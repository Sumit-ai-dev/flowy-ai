# Flowy — AI Chief of Staff for Product Managers

> **Built at VibeCon Hackathon 2026 | YC Request for Startups Track**
> *"The Multi-Model Orchestration Engine for Product Teams"*

---

## 🚀 Flowy v2.0 — The "Stateful Reflection" Update

We've evolved Flowy from a simple pipeline into a **Cognitive Orchestration Layer**. v2.0 leverages high-density AI patterns:

- **🔄 Multi-Model Agent Orchestration** — Dynamic routing and load balancing between specialized models (Gemini 2.0 / GPT-4o) based on task complexity.
- **🕰️ Deterministic Time Travel** — A rigorous state-restoration engine. Every AI interaction is a node in an **Evolutionary Memory Graph**, allowing for pixel-perfect document rollback.
- **✨ High-Fidelity Glassmorphism UI** — A GPU-accelerated, translucent design system implementing modern **Aesthetics-as-a-Service**.
- **🧠 Human-in-the-Loop (HITL) Reflection** — Real-time conversational refinement with a "Tech Lead" persona, optimizing for zero-shot accuracy.

---

## Overview

Flowy transforms messy meeting transcripts into production-ready product artifacts in under 10 seconds using a parallelized multi-agent AI pipeline. Paste a raw meeting transcript and Flowy automatically generates:

- **Executive Summary** — Key decisions, risks, blockers, and owners
- **Jira Tickets** — Auto-classified by type, priority, assignee, and due date with live push to Jira
- **Product Requirements Document (PRD)** — Investor-ready, structured feature specification
- **Slack Update** — Professional #product-updates message with one-click posting via Block Kit

---

## Architecture: Multi-Model Agentic Design

```
┌─────────────────────────────────────────────────────┐
│          COGNITIVE SUPERVISOR AGENT                 │
│  Context parsing & Asynchronous Dispatch Logic      │
└──────────┬──────────────────────────────────────────┘
           │  Asynchronous Parallel Inference (Gather)
  ┌────────┴─────────────────────────────────┐
  │         │              │                 │
  v         v              v                 v
Summary   Jira          PRD Architect     Slack
Agent     Generator     (High-Density)    Bridge
(Flash)   (Deep Spec)                     (Edge)
  │         │              │                 │
  └────────┬─────────────────────────────────┘
           │
           v
     Result Aggregator  ->  Jira Push  ->  State Sync
           │
           └────>  REFLECTION AGENT (HITL) <───┐
                   (Stateful Memory Graph)     │
                   (Time Travel restoration)   ┘
```

**Adaptive Model Routing:**
- High-Throughput Tiers (Summary, Slack) — `gemini-2.0-flash`
- High-Reasoning Tiers (PRD, Jira, Reflection) — `gemini-2.0-flash (precision)` or `gpt-4o`

All four agents execute concurrently via `asyncio.gather`, significantly reducing end-to-end latency.

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | Next.js 16, Tailwind CSS v4, Shadcn UI, Framer Motion |
| **Backend** | FastAPI, LangChain, LangGraph, Python asyncio |
| **LLM Providers** | Google Gemini 2.0 Flash, OpenAI GPT-4o |
| **Integrations** | Jira REST API v3, Slack Incoming Webhooks (Block Kit) |

---

## Project Structure

```
flowy/
├── backend/                  # FastAPI Python backend
│   ├── main.py               # Multi-agent orchestrator & API endpoints
│   ├── requirements.txt      # Python dependencies
│   ├── .env                  # Environment variables (not committed)
│   └── venv/                 # Python virtual environment
│
├── frontend/                 # Next.js 16 dashboard (primary UI)
│   ├── src/
│   │   ├── app/dashboard/    # Dashboard pages
│   │   ├── components/flowy/ # FlowyWorkspace core component
│   │   ├── lib/flowy-api.ts  # API client for backend communication
│   │   └── styles/           # Global CSS & theme configuration
│   └── package.json
│
├── flowy-next-frontend/      # Landing page (marketing site)
├── landing/                  # Additional landing assets
└── README.md
```

---

## Getting Started

### Prerequisites

- Python 3.9+
- Node.js 18+
- A Gemini API key or OpenAI API key

### 1. Backend Setup

```bash
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env with your API keys (see Environment Variables below)

uvicorn main:app --reload --port 8000
```

### 2. Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:3000/dashboard/overview**

---

## Environment Variables

Create a `.env` file in the `backend/` directory:

```env
# LLM Provider (at least one required)
OPENAI_API_KEY=sk-...
GEMINI_API_KEY=AIza...

# Jira Integration (all 4 required for live ticket creation)
JIRA_BASE_URL=https://yourcompany.atlassian.net
JIRA_EMAIL=your@email.com
JIRA_API_TOKEN=your-jira-api-token
JIRA_PROJECT_KEY=PROJ

# Slack Integration (optional — enables one-click posting)
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
```

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/process` | Run full multi-agent pipeline on a transcript |
| `GET` | `/jira/validate` | Validate Jira connection and project access |
| `POST` | `/slack/send` | Post formatted message to Slack via Block Kit |
| `GET` | `/health` | Check status of all integrations |

---

## How It Works

1. **Paste** a raw meeting transcript (or click "Load Sample")
2. **Process** — The Supervisor Agent parses intent and tone, then dispatches 4 agents in parallel
3. **Review** — Browse generated Summary, Tickets, PRD, and Slack update across tabbed output
4. **Push** — One-click push tickets to Jira and post updates to Slack

---

## Technical Key Features

- **🚀 Asynchronous Parallel Inference Pipeline** — Leveraging Python `asyncio.gather` for non-blocking multi-model execution.
- **🤖 HITL Reflection Layer** — A recursive feedback loop that allows the user to act as the final decision gate in the spec generation process.
- **🕰️ Stateful Evolutionary Memory** — A persistent state tree that captures every artifact version, enabling deterministic document restoration.
- **📡 Schema-Compliant Integrations** — Deep-link injection into Jira and Slack with automated metadata mapping.
- **💎 Low-Latency State Synchronization** — Zero-delay UI updates between the Reflection Agent and the Document Viewer.
- **📜 Semantic Traceability** — Full visibility into the "Agent Thought Process" via real-time processing logs.
- **🔗 Contextual Flow** — Supervisor context flows to all agents; Summary context feeds into PRD generation

---

## Team

Built by **Sumit Das** | [GitHub](https://github.com/Sumit-ai-dev)

---

## License

This project was built for the VibeCon Hackathon 2026. All rights reserved.
