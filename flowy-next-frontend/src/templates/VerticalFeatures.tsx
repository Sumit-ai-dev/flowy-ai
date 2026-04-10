import React, { useState } from 'react';
import { motion } from 'framer-motion';

const SAMPLE_TRANSCRIPT = `Alex: Hey everyone, thanks for jumping on. We need to finalize the checkout flow redesign for the Q2 release.
Sarah: The current dropout rate at the payment step is 40%. It's definitely the confusing UI.
Tom: I can start on the Figma mockups for the new 3-step flow. I'll have them ready by Friday.
James: Alex, we also have a critical bug. The coupon code field crashes the app on iOS 17.4.
Alex: Okay, James, please prioritize that. We need a fix by Wednesday. 
Sarah: What about the progress bar? People want to see how many steps are left.
Alex: Add it to the redesign story. Tom, make sure that's in the mockups.
Tom: Got it. I'll also follow up with the API team on the backend requirements for the new flow.
James: Should I assign the iOS bug to the mobile pod? 
Alex: Yes, assign it to them but keep yourself as the reviewer.`;

const TiltCard = ({ title, icon, children }: { title: string, icon: string, children: React.ReactNode }) => {
  return (
    <motion.div
      whileHover={{ scale: 1.02, rotateX: 2, rotateY: -2, z: 20 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
      className="bg-white rounded-2xl shadow-xl shadow-gray-200/50 border border-gray-100 p-6 flex flex-col transform-gpu"
    >
      <div className="flex items-center gap-3 mb-4 border-b border-gray-50 pb-3">
        <span className="text-3xl bg-primary-50 p-2 rounded-xl text-primary-600">{icon}</span>
        <h3 className="text-lg font-bold text-gray-800">{title}</h3>
      </div>
      <div className="text-sm text-gray-600 flex-grow whitespace-pre-wrap overflow-y-auto max-h-96">
        {children}
      </div>
    </motion.div>
  );
};

const VerticalFeatures = () => {
  const [transcript, setTranscript] = useState('');
  const [jiraKey, setJiraKey] = useState('FLOWY');
  const [slackWebhook, setSlackWebhook] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [slackSending, setSlackSending] = useState(false);
  const [slackSentStatus, setSlackSentStatus] = useState<string | null>(null);

  const handleSlackSend = async () => {
    if (!results?.slack_update) return;
    setSlackSending(true);
    setSlackSentStatus(null);
    try {
      const res = await fetch('http://localhost:8000/slack/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: results.slack_update, webhook_url: slackWebhook || undefined })
      });
      const data = await res.json();
      if (res.ok) setSlackSentStatus('✅ Sent to Slack!');
      else setSlackSentStatus(`❌ Error: ${data.detail || 'Could not send'}`);
    } catch (e) {
      setSlackSentStatus('❌ Network error');
    } finally {
      setSlackSending(false);
    }
  };

  const handleProcess = async () => {
    if (!transcript.trim()) return alert("Please paste a transcript.");
    setLoading(true);
    setResults(null);
    try {
      const res = await fetch('http://localhost:8000/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript, jira_project_key: jiraKey })
      });
      const data = await res.json();
      setResults(data);
    } catch (e) {
      alert("Error connecting to backend API.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div id="demo" className="max-w-screen-xl mx-auto px-4 py-20">
      <motion.div 
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="text-center mb-16"
      >
        <h2 className="text-4xl font-extrabold text-gray-900 mb-4 tracking-tight">Try it Live</h2>
        <p className="text-lg text-gray-500">Paste your meeting transcript and watch the magic happen.</p>
      </motion.div>

      <div className="grid md:grid-cols-2 gap-12">
        {/* INPUT PANEL */}
        <motion.div 
          initial={{ opacity: 0, x: -50 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          className="bg-white rounded-3xl shadow-2xl shadow-gray-200 p-8 border border-gray-100 flex flex-col"
        >
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-bold text-gray-800 text-lg flex items-center gap-2">📝 Transcript</h3>
            <button 
              onClick={() => { setTranscript(SAMPLE_TRANSCRIPT); setJiraKey('FLOWY'); }}
              className="text-primary-600 text-sm font-semibold hover:text-primary-700 bg-primary-50 px-3 py-1 rounded-lg transition"
            >
              Load Sample Data
            </button>
          </div>
          
          <textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            className="w-full bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm text-gray-700 h-64 focus:ring-2 focus:ring-primary-500 focus:outline-none mb-6"
            placeholder="Paste your meeting notes here..."
          />

          <div className="flex flex-col gap-2 mb-4">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Jira Project Key</label>
            <input 
              value={jiraKey}
              onChange={(e) => setJiraKey(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none"
              placeholder="e.g. PROJ"
            />
          </div>

          <div className="flex flex-col gap-2 mb-6">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-2">
              <span className="bg-[#4A154B] text-white rounded-full w-4 h-4 flex items-center justify-center text-[8px]">✈</span> Slack Webhook URL (optional)
            </label>
            <input 
              value={slackWebhook}
              onChange={(e) => setSlackWebhook(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none"
              placeholder="https://hooks.slack.com/services/..."
            />
          </div>

          <button
            onClick={handleProcess}
            disabled={loading}
            className={`w-full py-4 rounded-xl font-bold text-white transition-all ${loading ? 'bg-gray-400 cursor-not-allowed' : 'bg-primary-600 hover:bg-primary-700 hover:shadow-lg hover:-translate-y-1'}`}
          >
            {loading ? 'Processing with Flowy...' : '🚀 Process Meeting'}
          </button>
        </motion.div>

        {/* OUTPUT PANEL */}
        <div className="flex flex-col gap-8">
          {loading && (
             <motion.div 
               initial={{ opacity: 0 }} animate={{ opacity: 1 }}
               className="h-full flex items-center justify-center bg-gray-50 rounded-3xl border border-gray-100 p-8 text-center"
             >
               <div>
                  <div className="animate-spin text-primary-600 text-4xl mb-4">⚙️</div>
                  <h3 className="text-xl font-bold text-gray-800 mb-2">Analyzing Context...</h3>
                  <p className="text-gray-500">Flowy's Multi-Agent architecture is running.</p>
               </div>
             </motion.div>
          )}

          {!loading && !results && (
            <div className="h-full flex items-center justify-center bg-gray-50/50 rounded-3xl border border-gray-100 border-dashed p-8 text-center text-gray-400">
               Awaiting transcript processing...
            </div>
          )}

          {results && (
             <motion.div 
               initial={{ opacity: 0, x: 50 }}
               animate={{ opacity: 1, x: 0 }}
               className="grid grid-cols-1 gap-6"
             >
               <TiltCard title="Executive Summary" icon="📋">
                 {results.meeting_summary}
               </TiltCard>
               
               <TiltCard title="Slack Update" icon="💬">
                 {results.slack_update}
                 
                 <div className="mt-4 pt-4 border-t border-gray-100 flex items-center gap-4">
                   <button 
                     onClick={handleSlackSend}
                     disabled={slackSending}
                     className="bg-gradient-to-r from-[#4A154B] to-[#611f69] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:opacity-90 transition disabled:opacity-50"
                   >
                     {slackSending ? '⏳ Sending...' : '✈ Send to Slack'}
                   </button>
                   {slackSentStatus && <span className="text-sm font-bold text-gray-700">{slackSentStatus}</span>}
                 </div>
               </TiltCard>
             </motion.div>
          )}
        </div>
      </div>

      {results && (
        <motion.div 
          initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }}
          className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-12"
        >
          <TiltCard title="PRD Generated" icon="📄">
            {results.prd_draft || "No PRD generated."}
          </TiltCard>

          <TiltCard title="Jira Tickets" icon="🎯">
             {results.jira_error && (
               <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-4 text-xs font-bold border border-red-100">
                 {results.jira_error}
               </div>
             )}
             
             {results.jira_links?.length > 0 && (
               <div className="bg-green-50 text-green-700 p-3 rounded-lg mb-4 text-xs font-bold border border-green-100">
                 ✅ Live in Jira:
                 {results.jira_links.map((l: string, i: number) => (
                    <a key={i} href={l} target="_blank" rel="noreferrer" className="block text-primary-600 hover:underline mt-1">{l}</a>
                 ))}
               </div>
             )}

             <div className="overflow-x-auto">
               <table className="w-full text-left text-xs">
                 <thead className="bg-gray-50 text-gray-500 uppercase">
                   <tr>
                     <th className="p-2 border-b border-gray-100">Task</th>
                     <th className="p-2 border-b border-gray-100">Type</th>
                     <th className="p-2 border-b border-gray-100">Assignee</th>
                   </tr>
                 </thead>
                 <tbody>
                   {results.tickets.map((t: any, i: number) => (
                     <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                       <td className="p-2 font-medium text-gray-800">{t.summary}</td>
                       <td className="p-2"><span className="bg-gray-100 text-gray-600 px-2 py-1 rounded text-2xs">{t.issue_type}</span></td>
                       <td className="p-2 text-gray-500">{t.assignee}</td>
                     </tr>
                   ))}
                 </tbody>
               </table>
             </div>
          </TiltCard>
        </motion.div>
      )}

    </div>
  );
};

export { VerticalFeatures };
