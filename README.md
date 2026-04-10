# Flowy — AI Chief of Staff for Product Managers

> **Built at VibeCon Hackathon 2026 · YC Request for Startups Track**  
> *"Cursor, but for Product Managers"*

## What is Flowy?

Flowy transforms messy meeting transcripts into production-ready product artifacts in under 10 seconds:

- 📋 **Executive Summary** — Key decisions, risks, outcomes
- 🎯 **Jira Tickets** — Auto-classified by type, priority, assignee & due date
- 📄 **Product PRD** — Full investor-ready Product Requirements Document  
- 💬 **Slack Update** — Ready-to-post #product-updates message

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | Next.js 16, Tailwind CSS, Shadcn UI, Framer Motion |
| **Backend** | FastAPI, LangChain, OpenAI / Gemini |
| **Integrations** | Jira REST API v3, Slack Incoming Webhooks |

## Project Structure

```
flowy/
├── flowy-god-tier-ui/     # Next.js 16 dashboard (Shadcn UI)
│   ├── src/
│   │   ├── app/dashboard/ # Flowy workspace page
│   │   ├── components/flowy/  # FlowyWorkspace core component
│   │   └── lib/flowy-api.ts   # API client for backend
│   └── package.json
│
└── flowy-app/
    ├── backend/           # FastAPI Python backend
    │   ├── main.py        # Multi-agent orchestrator
    │   ├── requirements.txt
    │   └── .env.example   # Copy → .env and configure
    └── frontend/          # Original vanilla JS frontend
```

## Getting Started

### 1. Backend Setup

```bash
cd flowy-app/backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env with your API keys (see .env.example for details)

uvicorn main:app --reload --port 8000
```

### 2. Frontend Setup

```bash
cd flowy-god-tier-ui
npm install
npm run dev
```

Open **http://localhost:3000/dashboard/overview**

## Environment Variables

Copy `flowy-app/backend/.env.example` to `.env` and fill in:

```env
# LLM (pick one)
OPENAI_API_KEY=sk-...
GEMINI_API_KEY=AIza...

# Jira (all 4 required for real ticket creation)
JIRA_BASE_URL=https://yourcompany.atlassian.net
JIRA_EMAIL=your@email.com
JIRA_API_TOKEN=your-jira-api-token
JIRA_PROJECT_KEY=PROJ

# Slack (optional — enables 1-click posting)
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
```

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/process` | Run full AI pipeline on transcript |
| `GET` | `/jira/validate` | Test Jira connection |
| `POST` | `/slack/send` | Post message to Slack |
| `GET` | `/health` | Check all integrations status |

## Demo

1. Open the dashboard
2. Click **"Load Sample →"** to fill in a demo meeting transcript
3. Hit **"Process with Flowy"**
4. Watch 4 AI agents run live and push real tickets to your Jira board

---

Built with ❤️ by **Sumit Das** · [GitHub](https://github.com/Sumit-ai-dev)
