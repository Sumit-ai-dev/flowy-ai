# Flowy Product Flow (Implementation-Aligned)

## What Flowy Takes In
- Input mode 1: Paste transcript text
- Input mode 2: Capture browser + microphone audio, transcribe with Whisper, then process

## Core Backend Sequence (`backend/main.py`)
1. `POST /process` receives transcript
2. Supervisor step extracts context (meeting type, people, tone, top priority)
3. Parallel execution runs:
- Summary agent
- Slack update agent
- Ticket extraction agent
4. PRD agent runs after summary, using summary + supervisor context
5. Ticket enrichment applies deterministic rules:
- issue type normalization
- priority classification
- due date resolution
- label sanitization
6. Optional Jira push validates project and creates issues
7. Response returns summary, PRD, Slack message, tickets, Jira links, processing log

## Reflection + Time Travel Behavior
- `POST /chat` runs a refinement agent for Summary or PRD
- Agent rewrites content based on user feedback
- Frontend keeps chat history snapshots
- User can restore older summary/PRD versions from history

## Frontend Experience (`flowy-workspace.tsx`)
- User enters transcript or records audio
- Click process to run full pipeline
- Output tabs show Summary, Tickets, PRD, Slack update
- User can send Slack message directly
- User can refine PRD/Summary in reflection chat and restore prior versions

## Current Integrations
- Live: Jira issue creation
- Live: Slack webhook posting
- Planned in UI labels: Linear, Asana (coming soon)

## What Is Strong In The Demo
- End-to-end speed from raw input to actionable output
- Parallel agent processing with visible pipeline logs
- Human-in-the-loop refinement before final push
- Restorable revision history for PM control

## Suggested One-Line Product Definition
Flowy is an AI PM copilot that converts meeting input into summary, PRD, Slack update, and Jira-ready execution artifacts with human-controlled refinement.
