"""
Flowy — Multi-Agent AI Chief of Staff
=======================================
Architecture:
  ┌─────────────────────────────────────────────────────┐
  │               SUPERVISOR AGENT                      │
  │  Reads transcript → extracts context & intent       │
  └──────────┬──────────────────────────────────────────┘
             │  dispatches in PARALLEL to:
    ┌────────┴─────────────────────────────────┐
    │         │              │                 │
    ▼         ▼              ▼                 ▼
Summary   Ticket        PRD Writer        Slack Dispatcher
Agent     Generator     (GPT-4o /         Agent
(Flash)   (GPT-4o /     Gemini-Pro)       (Flash)
          Gemini-Pro)
    │         │              │                 │
    └────────┬─────────────────────────────────┘
             │
             ▼
      Result Aggregator  →  Jira Push  →  FlowOutput

Multi-model routing:
  • FAST tasks  (Summary, Slack)    → gemini-2.0-flash  OR gpt-4o-mini
  • DEEP tasks  (PRD, Tickets)      → gemini-1.5-pro   OR gpt-4o
"""

from __future__ import annotations
import os, json, asyncio
from typing import Optional, List, TypedDict, Annotated
from datetime import datetime, timedelta
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from dotenv import load_dotenv
import requests

load_dotenv()

# ─────────────────────────────────────────────
# MULTI-MODEL SETUP
# ─────────────────────────────────────────────

OPENAI_API_KEY  = os.getenv("OPENAI_API_KEY")
GEMINI_API_KEY  = os.getenv("GEMINI_API_KEY")

def get_fast_llm():
    """Fast model for quick tasks: Summary, Slack."""
    if GEMINI_API_KEY:
        from langchain_google_genai import ChatGoogleGenerativeAI
        return ChatGoogleGenerativeAI(
            model="gemini-2.0-flash",
            google_api_key=GEMINI_API_KEY,
            temperature=0.4
        )
    elif OPENAI_API_KEY:
        from langchain_openai import ChatOpenAI
        return ChatOpenAI(model="gpt-4o-mini", temperature=0.4)
    raise ValueError("Set GEMINI_API_KEY or OPENAI_API_KEY in .env")

def get_smart_llm():
    """Smarter model for deep reasoning: PRD, Tickets."""
    if GEMINI_API_KEY:
        from langchain_google_genai import ChatGoogleGenerativeAI
        return ChatGoogleGenerativeAI(
            model="gemini-2.0-flash",          # upgrade to gemini-1.5-pro if available
            google_api_key=GEMINI_API_KEY,
            temperature=0.2
        )
    elif OPENAI_API_KEY:
        from langchain_openai import ChatOpenAI
        return ChatOpenAI(model="gpt-4o", temperature=0.2)
    raise ValueError("Set GEMINI_API_KEY or OPENAI_API_KEY in .env")

def get_model_names() -> dict:
    if GEMINI_API_KEY:
        return {"fast": "gemini-2.0-flash", "smart": "gemini-2.0-flash (precision mode)"}
    return {"fast": "gpt-4o-mini", "smart": "gpt-4o"}

# ─────────────────────────────────────────────
# PYDANTIC SCHEMAS
# ─────────────────────────────────────────────

class ProcessRequest(BaseModel):
    transcript: str
    jira_project_key: Optional[str] = None

class JiraTicketOut(BaseModel):
    ticket_id: str
    summary: str
    description: str
    issue_type: str
    priority: str
    assignee: str
    due_date: str
    labels: List[str]
    jira_key: Optional[str] = None
    jira_url: Optional[str] = None

class FlowOutput(BaseModel):
    meeting_summary: str
    slack_update: str
    prd_draft: Optional[str] = None
    tickets: List[JiraTicketOut]
    jira_links: List[str] = Field(default_factory=list)
    processing_steps: List[str] = Field(default_factory=list)
    jira_error: Optional[str] = None

class JiraValidationResult(BaseModel):
    connected: bool
    base_url: str
    project_key: str
    project_name: Optional[str] = None
    issue_types: List[str] = Field(default_factory=list)
    priorities: List[str] = Field(default_factory=list)
    error: Optional[str] = None

# ─────────────────────────────────────────────
# LANGGRAPH STATE
# ─────────────────────────────────────────────

class FlowyState(TypedDict):
    transcript: str
    supervisor_context: str          # parsed intent from Supervisor
    meeting_summary: str
    slack_update: str
    prd_draft: str
    raw_tickets_json: str
    steps: List[str]

# ─────────────────────────────────────────────
# AGENT PROMPTS
# ─────────────────────────────────────────────

SUPERVISOR_PROMPT = """You are the Flowy Orchestrator Agent.
Your job is to read a meeting transcript and output a structured context summary that will be passed to 4 specialized sub-agents.

Extract and return EXACTLY this JSON:
{
  "meeting_type": "sprint_planning | retrospective | design_review | incident | general",
  "team_focus": "one-sentence description of what the team is working on",
  "key_people": ["list", "of", "names", "mentioned"],
  "top_priority": "the single most critical decision or action from this meeting",
  "tone": "urgent | relaxed | technical | strategic"
}

Return ONLY valid JSON. No markdown, no explanation."""

SUMMARY_PROMPT = """You are the Flowy Summary Agent (powered by {model}).
You have been given a meeting transcript AND a supervisor context from the Orchestrator Agent.

SUPERVISOR CONTEXT:
{supervisor_context}

Your job: Write a crisp 5-8 line executive summary. Focus on key decisions, risks, blockers, and owners.
Format as clean bullet points starting with an emoji. Be factual and sharp."""

SLACK_PROMPT = """You are the Flowy Slack Agent (powered by {model}).
Write a punchy Slack message for #product-updates based on this transcript.

SUPERVISOR CONTEXT (use this to set the right tone):
{supervisor_context}

Rules:
- Max 5 bullet points
- Use relevant emoji
- Mention owners by name
- End with next steps
- Tone should match: {tone}"""

PRD_PROMPT = """You are the Flowy PRD Agent (powered by {model}), a world-class Senior Product Manager.

SUPERVISOR CONTEXT:
{supervisor_context}

MEETING SUMMARY (from Summary Agent):
{meeting_summary}

From the transcript, identify the SINGLE most strategically important feature. Write an investor-ready PRD:

## 🎯 Feature Name
## 📌 Problem Statement  
## 🏆 Goal (one measurable sentence)
## 👤 Target User
## 📖 User Stories (exactly 3)
## ✅ Acceptance Criteria (4-6 testable items)
## 📊 Success Metrics (3 metrics with numbers)
## 🚫 Out of Scope (v1)
## ⚡ Dependencies & Risks

Be concrete. Use numbers. A PM should hand this directly to engineers."""

TICKET_PROMPT = """You are the Flowy Ticket Agent (powered by {model}).

SUPERVISOR CONTEXT:
{supervisor_context}

Extract ALL action items from this transcript as Jira tickets.
Return ONLY a valid JSON array. Each object must have:
  - summary: string (max 80 chars, starts with verb)
  - description: string (clear acceptance criteria)
  - issue_type: "Bug" | "Story" | "Task"
  - priority: "High" | "Medium" | "Low"
  - assignee: first name if mentioned, else "Unassigned"
  - due_hint: natural language deadline, else "next week"
  - labels: array of single-word strings (NO spaces in labels)

Format: [{...}, {...}]"""

# ─────────────────────────────────────────────
# CLASSIFICATION ENGINE
# ─────────────────────────────────────────────

ISSUE_TYPE_RULES = [
    (["bug", "fix", "error", "crash", "broken", "regression", "not working"], "Bug"),
    (["story", "redesign", "onboard", "ui", "design", "flow", "feature", "new"], "Story"),
]
PRIORITY_RULES = [
    (["today", "urgent", "blocking", "critical", "immediately", "asap", "high"], "High"),
    (["wednesday", "thursday", "monday", "tuesday", "friday", "eod", "this week"], "Medium"),
    (["next week", "two weeks", "next sprint", "backlog"], "Low"),
]
DAY_OFFSETS = {"today": 0, "this week": 4, "next week": 7, "two weeks": 14}

def classify_issue_type(text: str) -> str:
    t = text.lower()
    for keywords, itype in ISSUE_TYPE_RULES:
        if any(k in t for k in keywords):
            return itype
    return "Task"

def classify_priority(due_hint: str, text: str) -> str:
    combined = (due_hint + " " + text).lower()
    for keywords, priority in PRIORITY_RULES:
        if any(k in combined for k in keywords):
            return priority
    return "Medium"

def resolve_due_date(hint: str) -> str:
    hint_lower = hint.lower()
    weekdays = ["monday", "tuesday", "wednesday", "thursday", "friday"]
    now = datetime.now()
    if hint_lower in weekdays:
        target = weekdays.index(hint_lower)
        days_ahead = (target - now.weekday()) % 7 or 7
        return (now + timedelta(days=days_ahead)).strftime("%Y-%m-%d")
    offset = DAY_OFFSETS.get(hint_lower, 7)
    return (now + timedelta(days=offset)).strftime("%Y-%m-%d")

def enrich_ticket(raw: dict, idx: int) -> JiraTicketOut:
    summary     = raw.get("summary", "Untitled task")[:80]
    description = raw.get("description", "")
    issue_type  = classify_issue_type(raw.get("summary", "") + raw.get("description", ""))
    due_hint    = raw.get("due_hint", "next week")
    priority    = classify_priority(due_hint, raw.get("summary", ""))
    assignee    = raw.get("assignee", "Unassigned")
    # Sanitize labels — Jira does NOT allow spaces
    raw_labels  = raw.get("labels", ["general"])
    labels      = [l.replace(" ", "-").lower() for l in raw_labels[:5]]
    due_date    = resolve_due_date(due_hint)
    return JiraTicketOut(
        ticket_id=f"FLOWY-{idx+1:03d}",
        summary=summary, description=description,
        issue_type=issue_type, priority=priority,
        assignee=assignee, due_date=due_date, labels=labels,
    )

# ─────────────────────────────────────────────
# JIRA CLIENT
# ─────────────────────────────────────────────

def _jira_headers() -> dict:
    return {"Accept": "application/json", "Content-Type": "application/json"}

def _jira_auth():
    return (os.getenv("JIRA_EMAIL", ""), os.getenv("JIRA_API_TOKEN", ""))

def _jira_base() -> Optional[str]:
    return os.getenv("JIRA_BASE_URL", "").rstrip("/")

def jira_is_configured() -> bool:
    return all([_jira_base(), os.getenv("JIRA_EMAIL"), os.getenv("JIRA_API_TOKEN")])

def validate_jira_connection(project_key: str) -> JiraValidationResult:
    base = _jira_base()
    if not jira_is_configured():
        return JiraValidationResult(
            connected=False, base_url=base or "", project_key=project_key,
            error="JIRA_BASE_URL, JIRA_EMAIL, or JIRA_API_TOKEN not set in .env"
        )
    try:
        proj_r = requests.get(
            f"{base}/rest/api/3/project/{project_key}",
            headers=_jira_headers(), auth=_jira_auth(), timeout=8
        )
        if proj_r.status_code == 401:
            return JiraValidationResult(connected=False, base_url=base, project_key=project_key,
                                        error="Authentication failed — check JIRA_EMAIL and JIRA_API_TOKEN")
        if proj_r.status_code == 404:
            return JiraValidationResult(connected=False, base_url=base, project_key=project_key,
                                        error=f"Project '{project_key}' not found.")
        proj_r.raise_for_status()
        project_name = proj_r.json().get("name", project_key)
        meta_r = requests.get(
            f"{base}/rest/api/3/issue/createmeta?projectKeys={project_key}&expand=projects.issuetypes",
            headers=_jira_headers(), auth=_jira_auth(), timeout=8
        )
        issue_types = []
        if meta_r.status_code == 200:
            projects = meta_r.json().get("projects", [])
            if projects:
                issue_types = [it["name"] for it in projects[0].get("issuetypes", [])]
        prio_r = requests.get(f"{base}/rest/api/3/priority", headers=_jira_headers(), auth=_jira_auth(), timeout=8)
        priorities = [p["name"] for p in prio_r.json()] if prio_r.status_code == 200 else []
        return JiraValidationResult(
            connected=True, base_url=base, project_key=project_key,
            project_name=project_name, issue_types=issue_types, priorities=priorities
        )
    except requests.exceptions.ConnectionError:
        return JiraValidationResult(connected=False, base_url=base, project_key=project_key,
                                    error="Cannot reach Jira — check JIRA_BASE_URL")
    except Exception as e:
        return JiraValidationResult(connected=False, base_url=base, project_key=project_key, error=str(e))

def push_to_jira(ticket: JiraTicketOut, project_key: str, valid_issue_types: List[str], valid_priorities: List[str]):
    base = _jira_base()
    raw_type = ticket.issue_type
    if valid_issue_types and raw_type not in valid_issue_types:
        type_fallbacks = {
            "Bug":   next((t for t in ["Bug", "Task"] if t in valid_issue_types), valid_issue_types[0]),
            "Story": next((t for t in ["Story", "Task"] if t in valid_issue_types), valid_issue_types[0]),
        }
        raw_type = type_fallbacks.get(raw_type, valid_issue_types[0])
    raw_prio = ticket.priority
    if valid_priorities and raw_prio not in valid_priorities:
        raw_prio = "Medium" if "Medium" in valid_priorities else valid_priorities[0]
    description_adf = {
        "type": "doc", "version": 1,
        "content": [
            {"type": "heading", "attrs": {"level": 3}, "content": [{"type": "text", "text": "📋 Acceptance Criteria"}]},
            {"type": "paragraph", "content": [{"type": "text", "text": ticket.description}]},
            {"type": "paragraph", "content": [{"type": "text",
              "text": f"👤 Assignee Hint: {ticket.assignee}  |  📅 Due: {ticket.due_date}",
              "marks": [{"type": "em"}]}]},
            {"type": "paragraph", "content": [{"type": "text",
              "text": "🤖 Generated by Flowy Multi-Agent AI — VibeCon 2026",
              "marks": [{"type": "em"}]}]},
        ]
    }
    payload = {
        "fields": {
            "project":     {"key": project_key},
            "summary":     ticket.summary,
            "description": description_adf,
            "issuetype":   {"name": raw_type},
            "priority":    {"name": raw_prio},
            "labels":      ticket.labels,
        }
    }
    try:
        r = requests.post(
            f"{base}/rest/api/3/issue",
            json=payload, headers=_jira_headers(), auth=_jira_auth(), timeout=12
        )
        if r.status_code in [200, 201]:
            key = r.json().get("key", "")
            return key, f"{base}/browse/{key}", None
        else:
            err_detail = r.json().get("errors") or r.json().get("errorMessages") or r.text
            return None, None, f"HTTP {r.status_code}: {err_detail}"
    except requests.exceptions.Timeout:
        return None, None, "Jira request timed out"
    except Exception as e:
        return None, None, str(e)

# ─────────────────────────────────────────────
# MULTI-AGENT PIPELINE (PARALLEL + SHARED CONTEXT)
# ─────────────────────────────────────────────

async def run_flowy_pipeline(transcript: str, jira_project_key: Optional[str]) -> FlowOutput:
    from langchain_core.prompts import ChatPromptTemplate

    steps = []
    models = get_model_names()

    # ── STAGE 1: SUPERVISOR ─────────────────────────────────────────────
    steps.append(f"🧠 Supervisor Agent analyzing transcript context...")
    fast_llm  = get_fast_llm()
    smart_llm = get_smart_llm()

    supervisor_chain = (
        ChatPromptTemplate.from_messages([
            ("system", SUPERVISOR_PROMPT),
            ("human", "{transcript}")
        ]) | fast_llm
    )
    supervisor_raw = (await supervisor_chain.ainvoke({"transcript": transcript})).content

    # Parse supervisor context
    try:
        clean = supervisor_raw.strip()
        if clean.startswith("```"):
            clean = "\n".join(clean.split("\n")[1:])
        if clean.endswith("```"):
            clean = "\n".join(clean.split("\n")[:-1])
        supervisor_ctx = json.loads(clean)
        supervisor_context = json.dumps(supervisor_ctx, indent=2)
        tone = supervisor_ctx.get("tone", "strategic")
        meeting_type = supervisor_ctx.get("meeting_type", "general")
    except Exception:
        supervisor_context = supervisor_raw
        tone = "strategic"
        meeting_type = "general"

    steps.append(f"✅ Supervisor identified: {meeting_type} meeting | Tone: {tone}")
    steps.append(f"⚡ Dispatching 4 specialized agents in PARALLEL...")
    steps.append(f"   📋 Summary Agent  → {models['fast']}")
    steps.append(f"   💬 Slack Agent    → {models['fast']}")
    steps.append(f"   📄 PRD Agent      → {models['smart']}")
    steps.append(f"   🎯 Ticket Agent   → {models['smart']}")

    # ── STAGE 2: PARALLEL AGENT EXECUTION ───────────────────────────────

    summary_chain = (
        ChatPromptTemplate.from_messages([
            ("system", SUMMARY_PROMPT.format(model=models["fast"], supervisor_context=supervisor_context)),
            ("human", "{transcript}")
        ]) | fast_llm
    )

    slack_chain = (
        ChatPromptTemplate.from_messages([
            ("system", SLACK_PROMPT.format(model=models["fast"], supervisor_context=supervisor_context, tone=tone)),
            ("human", "{transcript}")
        ]) | fast_llm
    )

    ticket_chain = (
        ChatPromptTemplate.from_messages([
            ("system", TICKET_PROMPT.format(model=models["smart"], supervisor_context=supervisor_context)),
            ("human", "{transcript}")
        ]) | smart_llm
    )

    # Run Summary, Slack, Tickets in parallel (PRD needs summary first for context)
    summary_task  = summary_chain.ainvoke({"transcript": transcript})
    slack_task    = slack_chain.ainvoke({"transcript": transcript})
    ticket_task   = ticket_chain.ainvoke({"transcript": transcript})

    summary_result, slack_result, ticket_result = await asyncio.gather(
        summary_task, slack_task, ticket_task
    )

    meeting_summary  = summary_result.content
    slack_update     = slack_result.content
    raw_ticket_text  = ticket_result.content

    steps.append(f"✅ Summary Agent complete")
    steps.append(f"✅ Slack Agent complete")
    steps.append(f"✅ Ticket Agent complete")

    # ── STAGE 3: PRD AGENT (uses summary as shared context) ─────────────
    steps.append(f"📄 PRD Agent writing requirements doc (using summary context)...")
    prd_chain = (
        ChatPromptTemplate.from_messages([
            ("system", PRD_PROMPT.format(
                model=models["smart"],
                supervisor_context=supervisor_context,
                meeting_summary=meeting_summary
            )),
            ("human", "{transcript}")
        ]) | smart_llm
    )
    prd_result = await prd_chain.ainvoke({"transcript": transcript})
    prd_draft  = prd_result.content
    steps.append(f"✅ PRD Agent complete")

    # ── STAGE 4: TICKET CLASSIFICATION ──────────────────────────────────
    steps.append(f"⚙️ Classifying priorities, due dates, and issue types...")
    raw_tickets = []
    try:
        clean = raw_ticket_text.strip()
        if clean.startswith("```"):
            clean = "\n".join(clean.split("\n")[1:])
        if clean.endswith("```"):
            clean = "\n".join(clean.split("\n")[:-1])
        raw_tickets = json.loads(clean)
    except Exception:
        raw_tickets = []

    tickets = [enrich_ticket(t, i) for i, t in enumerate(raw_tickets)]
    steps.append(f"✅ {len(tickets)} tickets classified and enriched")

    # ── STAGE 5: JIRA PUSH ───────────────────────────────────────────────
    jira_links = []
    jira_error = None
    if jira_project_key and tickets:
        steps.append(f"🔐 Validating Jira connection to '{jira_project_key}'...")
        validation = validate_jira_connection(jira_project_key)
        if not validation.connected:
            jira_error = validation.error
            steps.append(f"⚠️ Jira error: {validation.error}")
        else:
            steps.append(f"✅ Connected to Jira: {validation.project_name}")
            steps.append(f"🚀 Pushing {len(tickets)} tickets to Jira...")
            push_errors = []
            for t in tickets:
                key, url, err = push_to_jira(t, jira_project_key, validation.issue_types, validation.priorities)
                if url:
                    jira_links.append(url)
                    t.jira_key = key
                    t.jira_url = url
                elif err:
                    push_errors.append(f"{t.ticket_id}: {err}")
            if jira_links:
                steps.append(f"✅ {len(jira_links)}/{len(tickets)} tickets pushed live to Jira!")
            if push_errors:
                jira_error = " | ".join(push_errors)
                steps.append(f"⚠️ {len(push_errors)} ticket(s) failed: check jira_error")
    else:
        steps.append("ℹ️ Simulation mode — add Jira project key to push real tickets")

    steps.append("🎉 Multi-agent pipeline complete!")

    return FlowOutput(
        meeting_summary=meeting_summary,
        slack_update=slack_update,
        prd_draft=prd_draft,
        tickets=tickets,
        jira_links=jira_links,
        processing_steps=steps,
        jira_error=jira_error,
    )

# ─────────────────────────────────────────────
# FASTAPI APP
# ─────────────────────────────────────────────

app = FastAPI(
    title="Flowy Multi-Agent API",
    description="Multi-model AI Chief of Staff — Supervisor + 4 Parallel Specialized Agents",
    version="2.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def root():
    models = get_model_names()
    return {
        "status": "ok",
        "product": "Flowy — Multi-Agent AI PM",
        "version": "2.0.0",
        "architecture": "Supervisor + 4 Parallel Specialized Agents",
        "models": models,
    }

@app.post("/process", response_model=FlowOutput)
async def process_transcript(req: ProcessRequest):
    if not req.transcript or len(req.transcript.strip()) < 20:
        raise HTTPException(status_code=400, detail="Transcript too short.")
    try:
        return await run_flowy_pipeline(req.transcript, req.jira_project_key)
    except ValueError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Pipeline error: {str(e)}")

@app.get("/jira/validate", response_model=JiraValidationResult)
def jira_validate(project_key: Optional[str] = None):
    key = project_key or os.getenv("JIRA_PROJECT_KEY", "")
    if not key:
        raise HTTPException(status_code=400, detail="Pass ?project_key=YOUR_KEY")
    return validate_jira_connection(key)

@app.get("/health")
def health():
    models = get_model_names()
    jira_status = "not configured"
    if jira_is_configured():
        proj_key = os.getenv("JIRA_PROJECT_KEY", "")
        if proj_key:
            v = validate_jira_connection(proj_key)
            jira_status = f"connected — {v.project_name}" if v.connected else f"error: {v.error}"
        else:
            jira_status = "credentials set (no project key)"
    return {
        "status": "healthy",
        "version": "2.0.0",
        "architecture": "multi-agent-parallel",
        "fast_model": models["fast"],
        "smart_model": models["smart"],
        "jira": jira_status,
    }

class SlackSendRequest(BaseModel):
    message: str

@app.post("/slack/send")
def slack_send(req: SlackSendRequest):
    webhook_url = os.getenv("SLACK_WEBHOOK_URL", "")
    if not webhook_url:
        raise HTTPException(status_code=400, detail="SLACK_WEBHOOK_URL not set in .env")
    if not req.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty.")
    try:
        resp = requests.post(webhook_url, json={"text": req.message}, timeout=10)
        if resp.status_code == 200 and resp.text == "ok":
            return {"status": "sent", "message": "Posted to Slack ✅"}
        raise HTTPException(status_code=400, detail=f"Slack error: {resp.text}")
    except requests.exceptions.RequestException as e:
        raise HTTPException(status_code=500, detail=f"Network error: {str(e)}")

@app.get("/slack/status")
def slack_status():
    return {"configured": bool(os.getenv("SLACK_WEBHOOK_URL", ""))}
