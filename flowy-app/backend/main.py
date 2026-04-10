"""
Flowy — AI Chief of Staff for Product Managers
================================================
Multi-agent backend that merges:
  - repo2's LangChain multi-agent orchestrator (Summary, Email, Action Items, Confluence agents)
  - repo4's smart ticket classification engine (priority, issue type, labels, due dates)
  - repo1's Jira API client for real ticket creation
  - A clean FastAPI wrapper exposing it all via REST

Author: Built for VibeCon Hackathon — YC Direct Interview Track
"""

from __future__ import annotations
import os, json
from typing import Optional, List
from datetime import datetime, timedelta
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from dotenv import load_dotenv
import requests

load_dotenv()

# ─────────────────────────────────────────────
# LLM SETUP — Supports OpenAI or Gemini
# ─────────────────────────────────────────────

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

def get_llm():
    if GEMINI_API_KEY:
        from langchain_google_genai import ChatGoogleGenerativeAI
        return ChatGoogleGenerativeAI(model="gemini-2.0-flash", google_api_key=GEMINI_API_KEY, temperature=0.3)
    elif OPENAI_API_KEY:
        from langchain_openai import ChatOpenAI
        return ChatOpenAI(model="gpt-4o-mini", temperature=0.3)
    else:
        raise ValueError("Set GEMINI_API_KEY or OPENAI_API_KEY in .env")

# ─────────────────────────────────────────────
# PYDANTIC SCHEMAS
# ─────────────────────────────────────────────

class ProcessRequest(BaseModel):
    transcript: str
    jira_project_key: Optional[str] = None  # If set, push tickets to real Jira

class JiraTicketOut(BaseModel):
    ticket_id: str
    summary: str
    description: str
    issue_type: str      # Bug | Story | Task
    priority: str        # High | Medium | Low
    assignee: str
    due_date: str
    labels: List[str]
    jira_key: Optional[str] = None   # Set after successful Jira push (e.g. "PROJ-42")
    jira_url: Optional[str] = None   # Direct browse link

class FlowOutput(BaseModel):
    meeting_summary: str
    slack_update: str
    prd_draft: Optional[str] = None
    tickets: List[JiraTicketOut]
    jira_links: List[str] = Field(default_factory=list)
    processing_steps: List[str] = Field(default_factory=list)
    jira_error: Optional[str] = None   # Surface any Jira push errors to the UI

class JiraValidationResult(BaseModel):
    connected: bool
    base_url: str
    project_key: str
    project_name: Optional[str] = None
    issue_types: List[str] = Field(default_factory=list)
    priorities: List[str] = Field(default_factory=list)
    error: Optional[str] = None

# ─────────────────────────────────────────────
# AGENT SYSTEM PROMPTS  (from repo2)
# ─────────────────────────────────────────────

SUMMARY_PROMPT = """You are a Summary Agent for a product team.
Produce a concise 5-8 line summary of the meeting transcript.
Focus ONLY on: key decisions made, features discussed, risks raised, and next priorities.
Be factual. No speculation. Format as clean bullet points."""

SLACK_PROMPT = """You are a Slack Update Agent.
Write a short, punchy Slack message (max 5 bullets) to post in #product-updates.
Use emoji. Be concise. Cover: what was decided, who owns what, and key deadlines.
This message will be read by engineers and designers. Skip small talk."""

PRD_PROMPT = """You are a world-class Senior Product Manager writing a Product Requirements Document (PRD) for a YC-backed startup.

From the meeting transcript, identify the SINGLE most strategically important feature or product decision discussed.
Then write a tight, investor-ready PRD using EXACTLY this structure:

## 🎯 Feature Name
Name it clearly. One line.

## 📌 Problem Statement
Explain the core user pain in 2-3 sentences. Be specific — include who is affected and what it costs them in time/money/frustration. No vague statements.

## 🏆 Goal
One clear, measurable sentence starting with a verb. Example: "Reduce checkout abandonment by 30% by simplifying the payment step to 3 fields."

## 👤 Target User
Describe the primary user persona in one sentence (role, context, pain).

## 📖 User Stories
Write exactly 3 user stories in this format:
- As a [user type], I want to [action], so that [outcome].

## ✅ Acceptance Criteria
Bullet list of 4-6 specific, testable criteria. Each one must be verifiable by QA.

## 📊 Success Metrics
3 metrics with target numbers. Format: Metric Name: current value → target value.
Example: Checkout completion rate: 60% → 80%

## 🚫 Out of Scope (v1)
Bullet list of 3-5 things explicitly NOT included in v1 to keep scope tight.

## ⚡ Dependencies & Risks
List 2-3 technical or business dependencies, and one key risk with a mitigation.

IMPORTANT: Be concrete and specific. Use numbers wherever possible. A PM reading this should be able to hand it directly to an engineering team."""

TICKET_PROMPT = """You are a Jira Ticket Generator Agent.
Extract ALL action items and feature requests from this transcript and structure them as Jira tickets.
Return ONLY valid JSON array. Each ticket must have:
  - summary: string (max 80 chars, starts with a verb)
  - description: string (clear acceptance criteria)
  - issue_type: "Bug" | "Story" | "Task"
  - priority: "High" | "Medium" | "Low"
  - assignee: first name if mentioned, else "Unassigned"
  - due_hint: natural language deadline if mentioned, else "next week"
  - labels: array of strings (e.g. ["frontend", "mobile", "api"])

Return format: [{{"summary":"...", "description":"...", "issue_type":"...", "priority":"...", "assignee":"...", "due_hint":"...", "labels":["...",]}}]"""

# ─────────────────────────────────────────────
# CLASSIFICATION ENGINE  (from repo4)
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
    for keywords, issue_type in ISSUE_TYPE_RULES:
        if any(k in t for k in keywords):
            return issue_type
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
    """Enrich and validate an LLM-generated raw ticket dict."""
    summary     = raw.get("summary", "Untitled task")[:80]
    description = raw.get("description", "")
    issue_type  = classify_issue_type(raw.get("summary", "") + raw.get("description", ""))
    due_hint    = raw.get("due_hint", "next week")
    priority    = classify_priority(due_hint, raw.get("summary", ""))
    assignee    = raw.get("assignee", "Unassigned")
    labels      = raw.get("labels", ["general"])
    due_date    = resolve_due_date(due_hint)

    return JiraTicketOut(
        ticket_id  = f"FLOWY-{idx+1:03d}",
        summary    = summary,
        description= description,
        issue_type = issue_type,
        priority   = priority,
        assignee   = assignee,
        due_date   = due_date,
        labels     = labels,
    )

# ─────────────────────────────────────────────
# JIRA CLIENT — REAL CONNECTION  (upgraded from repo1)
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
    """Hit Jira API to verify credentials and fetch project metadata."""
    base = _jira_base()
    if not jira_is_configured():
        return JiraValidationResult(
            connected=False, base_url=base or "", project_key=project_key,
            error="JIRA_BASE_URL, JIRA_EMAIL, or JIRA_API_TOKEN not set in .env"
        )
    try:
        # 1. Verify project exists
        proj_r = requests.get(
            f"{base}/rest/api/3/project/{project_key}",
            headers=_jira_headers(), auth=_jira_auth(), timeout=8
        )
        if proj_r.status_code == 401:
            return JiraValidationResult(connected=False, base_url=base, project_key=project_key,
                                        error="Authentication failed — check JIRA_EMAIL and JIRA_API_TOKEN")
        if proj_r.status_code == 404:
            return JiraValidationResult(connected=False, base_url=base, project_key=project_key,
                                        error=f"Project '{project_key}' not found. Check JIRA_PROJECT_KEY.")
        proj_r.raise_for_status()
        project_name = proj_r.json().get("name", project_key)

        # 2. Fetch available issue types for this project
        meta_r = requests.get(
            f"{base}/rest/api/3/issue/createmeta?projectKeys={project_key}&expand=projects.issuetypes",
            headers=_jira_headers(), auth=_jira_auth(), timeout=8
        )
        issue_types = []
        if meta_r.status_code == 200:
            projects = meta_r.json().get("projects", [])
            if projects:
                issue_types = [it["name"] for it in projects[0].get("issuetypes", [])]

        # 3. Fetch available priorities
        prio_r = requests.get(
            f"{base}/rest/api/3/priority",
            headers=_jira_headers(), auth=_jira_auth(), timeout=8
        )
        priorities = []
        if prio_r.status_code == 200:
            priorities = [p["name"] for p in prio_r.json()]

        return JiraValidationResult(
            connected=True, base_url=base, project_key=project_key,
            project_name=project_name, issue_types=issue_types, priorities=priorities
        )
    except requests.exceptions.ConnectionError:
        return JiraValidationResult(connected=False, base_url=base, project_key=project_key,
                                    error="Cannot reach Jira — check JIRA_BASE_URL and network connectivity")
    except Exception as e:
        return JiraValidationResult(connected=False, base_url=base, project_key=project_key,
                                    error=str(e))


def push_to_jira(ticket: JiraTicketOut, project_key: str, valid_issue_types: List[str], valid_priorities: List[str]) -> tuple[Optional[str], Optional[str], Optional[str]]:
    """Push one ticket to Jira. Returns (jira_key, browse_url, error_msg)."""
    base = _jira_base()

    # Normalise issue type against what the project actually supports
    raw_type = ticket.issue_type
    if valid_issue_types and raw_type not in valid_issue_types:
        # Map common LLM-generated types to nearest valid project type
        type_fallbacks = {
            "Bug":     next((t for t in ["Bug", "Task"] if t in valid_issue_types), valid_issue_types[0]),
            "Story":   next((t for t in ["Story", "Task"] if t in valid_issue_types), valid_issue_types[0]),
            "Epic":    next((t for t in ["Epic", "Task"] if t in valid_issue_types), valid_issue_types[0]),
            "Subtask": next((t for t in ["Subtask", "Task"] if t in valid_issue_types), valid_issue_types[0]),
        }
        raw_type = type_fallbacks.get(raw_type, valid_issue_types[0])

    # Normalise priority
    raw_prio = ticket.priority
    if valid_priorities and raw_prio not in valid_priorities:
        raw_prio = "Medium" if "Medium" in valid_priorities else valid_priorities[0]

    # Build Atlassian Document Format description
    description_adf = {
        "type": "doc", "version": 1,
        "content": [
            {"type": "heading", "attrs": {"level": 3}, "content": [{"type": "text", "text": "📋 Acceptance Criteria"}]},
            {"type": "paragraph", "content": [{"type": "text", "text": ticket.description}]},
            {"type": "paragraph", "content": [
                {"type": "text", "text": f"👤 Assignee Hint: {ticket.assignee}  |  📅 Due: {ticket.due_date}",
                 "marks": [{"type": "em"}]}
            ]},
            {"type": "paragraph", "content": [
                {"type": "text", "text": "🤖 Generated by Flowy AI — VibeCon 2026",
                 "marks": [{"type": "em"}]}
            ]},
        ]
    }

    payload = {
        "fields": {
            "project":     {"key": project_key},
            "summary":     ticket.summary,
            "description": description_adf,
            "issuetype":   {"name": raw_type},
            "priority":    {"name": raw_prio},
            "labels":      [l.replace(" ", "-").replace("_", "-") for l in ticket.labels[:5]],  # Jira: no spaces in labels
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
# ORCHESTRATOR
# ─────────────────────────────────────────────

async def run_flowy_pipeline(transcript: str, jira_project_key: Optional[str]) -> FlowOutput:
    llm   = get_llm()
    steps = []

    from langchain_core.prompts import ChatPromptTemplate

    steps.append("🔍 Reading transcript...")

    # Agent 1: Summary
    steps.append("📋 Summary Agent running...")
    summary_chain  = ChatPromptTemplate.from_messages([("system", SUMMARY_PROMPT), ("human", "{transcript}")]) | llm
    meeting_summary = summary_chain.invoke({"transcript": transcript}).content

    # Agent 2: Slack update
    steps.append("💬 Slack Update Agent running...")
    slack_chain = ChatPromptTemplate.from_messages([("system", SLACK_PROMPT), ("human", "{transcript}")]) | llm
    slack_update = slack_chain.invoke({"transcript": transcript}).content

    # Agent 3: PRD
    steps.append("📄 PRD Agent running...")
    prd_chain  = ChatPromptTemplate.from_messages([("system", PRD_PROMPT), ("human", "{transcript}")]) | llm
    prd_draft  = prd_chain.invoke({"transcript": transcript}).content

    # Agent 4: Ticket generator
    steps.append("🎯 Ticket Generator Agent running...")
    ticket_chain = ChatPromptTemplate.from_messages([("system", TICKET_PROMPT), ("human", "{transcript}")]) | llm
    raw_ticket_text = ticket_chain.invoke({"transcript": transcript}).content

    # Parse and enrich tickets
    steps.append("⚙️ Classifying priorities and due dates...")
    raw_tickets = []
    try:
        # Strip markdown fences if present
        clean = raw_ticket_text.strip()
        if clean.startswith("```"):
            clean = "\n".join(clean.split("\n")[1:])
        if clean.endswith("```"):
            clean = "\n".join(clean.split("\n")[:-1])
        raw_tickets = json.loads(clean)
    except Exception:
        raw_tickets = []

    tickets = [enrich_ticket(t, i) for i, t in enumerate(raw_tickets)]

    # Jira push
    jira_links = []
    jira_error = None
    if jira_project_key and tickets:
        steps.append(f"🔐 Validating Jira connection to {jira_project_key}...")
        validation = validate_jira_connection(jira_project_key)
        if not validation.connected:
            jira_error = validation.error
            steps.append(f"⚠️ Jira validation failed: {validation.error}")
        else:
            steps.append(f"✅ Connected to Jira project: {validation.project_name}")
            steps.append(f"🚀 Pushing {len(tickets)} tickets...")
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
                steps.append(f"✅ {len(jira_links)}/{len(tickets)} tickets live in Jira!")
            if push_errors:
                steps.append(f"⚠️ {len(push_errors)} ticket(s) failed — see jira_error for details")
                jira_error = " | ".join(push_errors)
    else:
        steps.append("✅ Simulation mode — add Jira key to push real tickets")

    steps.append("🎉 Pipeline complete!")

    return FlowOutput(
        meeting_summary  = meeting_summary,
        slack_update     = slack_update,
        prd_draft        = prd_draft,
        tickets          = tickets,
        jira_links       = jira_links,
        processing_steps = steps,
        jira_error       = jira_error,
    )

# ─────────────────────────────────────────────
# FASTAPI APP
# ─────────────────────────────────────────────

app = FastAPI(title="Flowy API", description="AI Chief of Staff for Product Managers", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def root():
    return {"status": "ok", "product": "Flowy — AI PM Agent", "version": "1.0.0"}

@app.post("/process", response_model=FlowOutput)
async def process_transcript(req: ProcessRequest):
    if not req.transcript or len(req.transcript.strip()) < 20:
        raise HTTPException(status_code=400, detail="Transcript too short. Please provide a real meeting transcript.")
    try:
        result = await run_flowy_pipeline(req.transcript, req.jira_project_key)
        return result
    except ValueError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Pipeline error: {str(e)}")


@app.get("/jira/validate", response_model=JiraValidationResult)
def jira_validate(project_key: Optional[str] = None):
    """Test Jira credentials and fetch project metadata without processing a transcript."""
    key = project_key or os.getenv("JIRA_PROJECT_KEY", "")
    if not key:
        raise HTTPException(status_code=400, detail="Pass ?project_key=YOUR_KEY or set JIRA_PROJECT_KEY in .env")
    return validate_jira_connection(key)


@app.get("/health")
def health():
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
        "llm": "gemini-2.0-flash" if GEMINI_API_KEY else "gpt-4o-mini" if OPENAI_API_KEY else "not configured",
        "jira": jira_status,
    }


# ─────────────────────────────────────────────
# SLACK SEND ENDPOINT
# ─────────────────────────────────────────────

class SlackSendRequest(BaseModel):
    message: str

@app.post("/slack/send")
def slack_send(req: SlackSendRequest):
    """Send a message to Slack via Incoming Webhook."""
    webhook_url = os.getenv("SLACK_WEBHOOK_URL", "")
    if not webhook_url:
        raise HTTPException(status_code=400, detail="SLACK_WEBHOOK_URL not set in .env. See https://api.slack.com/messaging/webhooks")
    if not req.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty.")
    try:
        resp = requests.post(webhook_url, json={"text": req.message}, timeout=10)
        if resp.status_code == 200 and resp.text == "ok":
            return {"status": "sent", "message": "Message posted to Slack ✅"}
        else:
            raise HTTPException(status_code=400, detail=f"Slack error: {resp.text}")
    except requests.exceptions.RequestException as e:
        raise HTTPException(status_code=500, detail=f"Network error: {str(e)}")

@app.get("/slack/status")
def slack_status():
    """Check if Slack webhook is configured."""
    configured = bool(os.getenv("SLACK_WEBHOOK_URL", ""))
    return {"configured": configured}
