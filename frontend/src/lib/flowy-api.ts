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
  raw_transcript?: string;
};

export async function processTranscript(
  transcript: string,
  jira_project_key?: string,
  destination: string = 'jira'
): Promise<FlowOutput> {
  const response = await fetch('http://localhost:8000/process', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      transcript,
      jira_project_key,
      destination
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

export async function transcribeAudio(
  audioBlob: Blob,
  jira_project_key?: string,
  destination: string = 'jira'
): Promise<FlowOutput> {
  const formData = new FormData();
  formData.append('file', audioBlob, 'recording.webm');
  if (jira_project_key) formData.append('jira_project_key', jira_project_key);
  formData.append('destination', destination);

  const response = await fetch('http://localhost:8000/transcribe', {
    method: 'POST',
    body: formData
  });

  if (!response.ok) {
    const errObj = await response.json().catch(() => ({}));
    throw new Error(errObj.detail || 'Failed to transcribe audio with backend');
  }

  return response.json();
}

export async function chatWithFlowy(
  userMessage: string, 
  history: any[], 
  transcript: string, 
  currentContent: string, 
  mode: 'summary' | 'prd'
): Promise<{ response: string; updated_content: string | null }> {
  const response = await fetch('http://localhost:8000/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      user_message: userMessage,
      history,
      transcript,
      current_content: currentContent,
      mode
    })
  });

  if (!response.ok) {
    const errObj = await response.json().catch(() => ({}));
    throw new Error(errObj.detail || 'Chat interaction failed');
  }

  return response.json();
}
