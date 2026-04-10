// API Client for Flowy Python Backend

export type JiraTicketOut = {
  ticket_id: string;
  summary: string;
  description: string;
  issue_type: string;
  priority: string;
  assignee: string;
  due_date: string;
  labels: string[];
  jira_key?: string;
  jira_url?: string;
};

export type FlowOutput = {
  meeting_summary: string;
  slack_update: string;
  prd_draft?: string;
  tickets: JiraTicketOut[];
  jira_links: string[];
  processing_steps: string[];
  jira_error?: string;
};

export async function processTranscript(
  transcript: string,
  jira_project_key?: string
): Promise<FlowOutput> {
  const response = await fetch('http://localhost:8000/process', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      transcript,
      jira_project_key
    })
  });

  if (!response.ok) {
    const errObj = await response.json().catch(() => ({}));
    throw new Error(errObj.detail || 'Failed to process transcript with backend');
  }

  return response.json();
}

export async function sendSlackMessage(message: string): Promise<{ status: string; message: string }> {
  const response = await fetch('http://localhost:8000/slack/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ message })
  });

  if (!response.ok) {
    const errObj = await response.json().catch(() => ({}));
    throw new Error(errObj.detail || 'Failed to dispatch Slack message');
  }

  return response.json();
}
