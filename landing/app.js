const API_BASE = 'http://localhost:8000';

// DOM Elements
const transcriptInput = document.getElementById('transcriptInput');
const jiraKeyInput = document.getElementById('jiraKey');
const processBtn = document.getElementById('processBtn');
const validateJiraBtn = document.getElementById('validateJiraBtn');
const loadSampleBtn = document.getElementById('loadSample');
const jiraValidationMsg = document.getElementById('jiraValidationMsg');
const logPanel = document.getElementById('logPanel');
const logSteps = document.getElementById('logSteps');
const resultsGrid = document.getElementById('resultsGrid');
const apiStatus = document.getElementById('apiStatus');
const slackWebhookInput = document.getElementById('slackWebhookInput');

const summaryContent = document.getElementById('summaryContent');
const slackContent = document.getElementById('slackContent');
const prdContent = document.getElementById('prdContent');
const ticketsBody = document.getElementById('ticketsBody');
const ticketCount = document.getElementById('ticketCount');

// Sample Data
const SAMPLE_TRANSCRIPT = `
Alex: Hey everyone, thanks for jumping on. We need to finalize the checkout flow redesign for the Q2 release.
Sarah: The current dropout rate at the payment step is 40%. It's definitely the confusing UI.
Tom: I can start on the Figma mockups for the new 3-step flow. I'll have them ready by Friday.
James: Alex, we also have a critical bug. The coupon code field crashes the app on iOS 17.4.
Alex: Okay, James, please prioritize that. We need a fix by Wednesday. 
Sarah: What about the progress bar? People want to see how many steps are left.
Alex: Add it to the redesign story. Tom, make sure that's in the mockups.
Tom: Got it. I'll also follow up with the API team on the backend requirements for the new flow.
James: Should I assign the iOS bug to the mobile pod? 
Alex: Yes, assign it to them but keep yourself as the reviewer.
`;

// Init
async function checkHealth() {
    try {
        const res = await fetch(`${API_BASE}/health`);
        const data = await res.json();
        apiStatus.textContent = '● Online';
        apiStatus.style.color = '#10b981';
    } catch (e) {
        apiStatus.textContent = '● Offline (Run backend)';
        apiStatus.style.color = '#ef4444';
    }
}

// Logic
loadSampleBtn.addEventListener('click', () => {
    transcriptInput.value = SAMPLE_TRANSCRIPT.trim();
    jiraKeyInput.value = 'FLOWY';
});

function addLogStep(text, status = 'active') {
    const div = document.createElement('div');
    div.className = `log-step ${status}`;
    div.textContent = text;
    logSteps.appendChild(div);
    logPanel.scrollTop = logPanel.scrollHeight;
    return div;
}

processBtn.addEventListener('click', async () => {
    const transcript = transcriptInput.value.trim();
    if (!transcript) return alert('Please paste a transcript first!');

    // UI Reset
    processBtn.disabled = true;
    logPanel.style.display = 'block';
    resultsGrid.style.display = 'none';
    logSteps.innerHTML = '';
    
    addLogStep('🚀 Initializing Multi-Agent Pipeline...');
    
    try {
        const response = await fetch(`${API_BASE}/process`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                transcript,
                jira_project_key: jiraKeyInput.value || null
            })
        });

        if (!response.ok) throw new Error('API Error');

        const data = await response.json();
        
        // Simulate live agent execution based on backend steps
        for (const step of data.processing_steps) {
            const el = addLogStep(step);
            await new Promise(r => setTimeout(r, 600)); // Visual spacing
            el.classList.remove('active');
            el.classList.add('done');
        }

        // Show Results
        displayResults(data);
        resultsGrid.style.display = 'grid';
        resultsGrid.scrollIntoView({ behavior: 'smooth' });

    } catch (err) {
        addLogStep(`❌ Error: ${err.message}`, 'error');
        alert('Check if the backend is running on localhost:8000');
    } finally {
        processBtn.disabled = false;
    }
});

function displayResults(data) {
    summaryContent.textContent = data.meeting_summary;
    slackContent.textContent = data.slack_update;
    prdContent.textContent = data.prd_draft || 'No PRD generated for this session.';

    // Inject Send-to-Slack approve button
    const slackCard = slackContent.closest('.result-card') || slackContent.parentElement;
    let oldSlackBtn = document.getElementById('sendSlackBtn');
    if (oldSlackBtn) oldSlackBtn.remove();
    const sendSlackBtn = document.createElement('button');
    sendSlackBtn.id = 'sendSlackBtn';
    sendSlackBtn.innerHTML = '✈ Send to Slack';
    sendSlackBtn.style.cssText = 'margin-top:0.8rem;padding:0.45rem 1.1rem;background:linear-gradient(135deg,#4A154B,#611f69);color:#fff;border:none;border-radius:0.5rem;cursor:pointer;font-size:0.82rem;font-weight:600;letter-spacing:0.03em;transition:opacity 0.2s;';
    sendSlackBtn.onmouseenter = () => sendSlackBtn.style.opacity = '0.8';
    sendSlackBtn.onmouseleave = () => sendSlackBtn.style.opacity = '1';
    slackCard.appendChild(sendSlackBtn);

    sendSlackBtn.addEventListener('click', async () => {
        const msg = slackContent.textContent.trim();
        const webhookUrl = slackWebhookInput ? slackWebhookInput.value.trim() : '';
        sendSlackBtn.disabled = true;
        sendSlackBtn.innerHTML = '⏳ Sending...';
        try {
            const r = await fetch(`${API_BASE}/slack/send`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: msg, webhook_url: webhookUrl || undefined })
            });
            const result = await r.json();
            if (r.ok) {
                sendSlackBtn.innerHTML = '✅ Sent to Slack!';
                sendSlackBtn.style.background = 'linear-gradient(135deg,#10b981,#059669)';
            } else {
                const errMsg = result.detail || 'Error';
                if (errMsg.includes('SLACK_WEBHOOK_URL')) {
                    sendSlackBtn.innerHTML = '❌ Paste your Slack Webhook URL above first';
                } else {
                    sendSlackBtn.innerHTML = `❌ ${errMsg}`;
                }
                sendSlackBtn.style.background = '#ef4444';
            }
        } catch (e) {
            sendSlackBtn.innerHTML = '❌ Network error';
            sendSlackBtn.style.background = '#ef4444';
        }
        setTimeout(() => {
            sendSlackBtn.disabled = false;
            sendSlackBtn.innerHTML = '✈ Send to Slack';
            sendSlackBtn.style.background = 'linear-gradient(135deg,#4A154B,#611f69)';
        }, 4000);
    });

    ticketCount.textContent = `${data.tickets.length} tickets generated`;
    ticketsBody.innerHTML = '';

    data.tickets.forEach(t => {
        const tr = document.createElement('tr');
        const jiraLink = t.jira_url
            ? `<a href="${t.jira_url}" target="_blank" style="color:var(--primary);font-weight:700;font-size:0.75rem;text-decoration:none;border:1px solid var(--primary);padding:0.1rem 0.4rem;border-radius:0.3rem;">${t.jira_key || 'Open'} ↗</a>`
            : '';
        tr.innerHTML = `
            <td><span style="color:var(--primary);font-weight:700">${t.ticket_id}</span> ${jiraLink}</td>
            <td>${t.summary}</td>
            <td><span class="type-${t.issue_type.toLowerCase()}">${t.issue_type}</span></td>
            <td><span class="badge-${t.priority.toLowerCase()}">${t.priority}</span></td>
            <td>${t.assignee}</td>
            <td>${t.due_date}</td>
            <td>${t.labels.map(l => `<span style="font-size:0.7rem;opacity:0.6">#${l}</span>`).join(' ')}</td>
        `;
        ticketsBody.appendChild(tr);
    });

    // Show Jira error if any
    const jiraErrorBanner = document.getElementById('jiraErrorBanner');
    if (data.jira_error && jiraErrorBanner) {
        jiraErrorBanner.textContent = `⚠️ Jira issue: ${data.jira_error}`;
        jiraErrorBanner.style.display = 'block';
    } else if (jiraErrorBanner) {
        jiraErrorBanner.style.display = 'none';
    }

    // Show all Jira browse links as a block
    const jiraLinksEl = document.getElementById('jiraLinks');
    if (data.jira_links && data.jira_links.length > 0 && jiraLinksEl) {
        jiraLinksEl.style.display = 'block';
        jiraLinksEl.innerHTML = `<strong style="color:var(--success);font-size:0.85rem;">🎉 Live in Jira:</strong><br/>` +
            data.jira_links.map(l => `<a href="${l}" target="_blank" style="color:var(--primary);font-size:0.85rem;display:block;margin-top:0.3rem;">${l} ↗</a>`).join('');
    }
}

// Copy Buttons
document.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const targetId = btn.getAttribute('data-target');
        const text = document.getElementById(targetId).textContent;
        navigator.clipboard.writeText(text);
        const originalText = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(() => btn.textContent = originalText, 2000);
    });
});

checkHealth();
setInterval(checkHealth, 5000);

// Validate Jira connection on demand
if (validateJiraBtn) {
    validateJiraBtn.addEventListener('click', async () => {
        const key = jiraKeyInput.value.trim();
        if (!key) {
            jiraValidationMsg.textContent = 'Enter a project key first';
            jiraValidationMsg.style.color = '#f59e0b';
            return;
        }
        validateJiraBtn.textContent = '...';
        validateJiraBtn.disabled = true;
        try {
            const r = await fetch(`${API_BASE}/jira/validate?project_key=${key}`);
            const data = await r.json();
            if (data.connected) {
                jiraValidationMsg.textContent = `✅ Connected — ${data.project_name} · Types: ${data.issue_types.join(', ')}`;
                jiraValidationMsg.style.color = '#10b981';
            } else {
                jiraValidationMsg.textContent = `❌ ${data.error}`;
                jiraValidationMsg.style.color = '#ef4444';
            }
        } catch(e) {
            jiraValidationMsg.textContent = '❌ Backend is offline. Start it first.';
            jiraValidationMsg.style.color = '#ef4444';
        }
        validateJiraBtn.textContent = 'Validate';
        validateJiraBtn.disabled = false;
    });
}
