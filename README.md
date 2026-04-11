# Flowy — AI Chief of Staff for Product Managers

> **Built at VibeCon Hackathon 2026 | YC Request for Startups Track**
> *"Cursor, but for Product Managers"*

---

## 🚀 NEW: Flowy v2.0 — The Reflection Update

We've evolved Flowy from a static generator into a **living, collaborative workspace**. v2.0 introduces deep iteration capabilities:

- **🔄 AI Reflection Agent** — Don't just generate; iterate. Chat with a world-class PM sidekick to refine your PRDs and Summaries in real-time.
- **🕰️ Interactive Time Travel** — A revolutionary versioning system. Every AI edit is captured as a "Snapshot." Click any snapshot in the chat history to instantly restore your document to that exact historical point.
- **✨ Premium Glassmorphism UI** — A high-fidelity, translucent design system optimized for deep focus and executive-level output.
- **🌲 Evolutionary History** — Your chat thread serves as a visual timeline of your document's evolution, ensuring no idea is ever lost.

---

## Overview

Flowy transforms messy meeting transcripts into production-ready product artifacts in under 10 seconds using a parallelized multi-agent AI pipeline. Paste a raw meeting transcript and Flowy automatically generates:

- **Executive Summary** — Key decisions, risks, blockers, and owners
- **Jira Tickets** — Auto-classified by type, priority, assignee, and due date with live push to Jira
- **Product Requirements Document (PRD)** — Investor-ready, structured feature specification
- **Slack Update** — Professional #product-updates message with one-click posting via Block Kit

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│               SUPERVISOR AGENT                      │
│  Reads transcript -> extracts context & intent      │
└──────────┬──────────────────────────────────────────┘
           │  dispatches in PARALLEL to:
  ┌────────┴─────────────────────────────────┐
  │         │              │                 │
  v         v              v                 v
Summary   Ticket        PRD Writer        Slack
Agent     Generator     (Deep Model)      Agent
(Fast)    (Deep Model)                    (Fast)
  │         │              │                 │
  └────────┬─────────────────────────────────┘
           │
           v
     Result Aggregator  ->  Jira Push  ->  FlowOutput
           │
           └────>  REFLECTION AGENT  <────┐
                   (Human-in-the-loop)    │
                   (Time Travel / History)┘
```

**Multi-model routing:**
- Fast tasks (Summary, Slack) — `gemini-2.0-flash`
- Deep tasks (PRD, Tickets, Reflection) — `gemini-2.0-flash (precision)` or `gpt-4o`

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

## Key Features

- **Parallel Multi-Agent Pipeline** — 4 specialized AI agents run concurrently for fast results
- **Intelligent Model Routing** — Fast models for summaries, deep models for PRDs and tickets
- **Live Jira Integration** — Auto-classifies issue type, priority, assignee, and due date; pushes directly to your Jira board
- **Slack Block Kit** — Rich, professionally formatted notifications with markdown-to-mrkdwn conversion
- **Real-Time Agent Logs** — Watch each agent execute live in the terminal-style log viewer
- **Context Sharing** — Supervisor context flows to all agents; Summary context feeds into PRD generation

---

## Team

Built by **Sumit Das** | [GitHub](https://github.com/Sumit-ai-dev)

---

## License

This project was built for the VibeCon Hackathon 2026. All rights reserved.
