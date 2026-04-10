'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { processTranscript, sendSlackMessage, FlowOutput } from '@/lib/flowy-api';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Icons } from '@/components/icons';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';

const SAMPLE_TRANSCRIPT = `Alright everyone, let's kick things off. Today's sprint planning call — main agenda: shipping the v2 dashboard before end of month.

First up, Emma — the onboarding flow has a critical bug. New users get stuck on the email verification screen and never make it to setup. This is a blocker, we need this fixed today. High priority.

Tom, we discussed the new CSV export feature for user lists. Product has been asking for this since Q3. Let's scope it as a Story — medium priority, due next Friday. You'll own that.

Sarah, the mobile app's performance on Android is terrible — animations are janky, the home feed takes 4 seconds to load. Let's log that as a Bug, high priority, and get it resolved this week.

We also need to redesign the pricing page. The current one has a 70% bounce rate. New design should be cleaner, with a comparison table. This is a Story for the design team — low priority, next sprint.

Finally, let's make sure we push sprint updates to the #product-updates Slack channel today after this call. Alex, can you handle that?

Key decisions: Launch date stays end of month. All blockers must be cleared by Wednesday. Next sync Thursday 4pm.`;

export function FlowyWorkspace() {
  const [transcript, setTranscript] = useState('');
  const [jiraKey, setJiraKey] = useState('FLOWY');
  const [isLoading, setIsLoading] = useState(false);
  const [output, setOutput] = useState<FlowOutput | null>(null);
  const [isSlackSending, setIsSlackSending] = useState(false);
  const [activeStep, setActiveStep] = useState(0);

  // Simulated agent steps for the UI (the actual API is processing in background)
  const [agentLogs, setAgentLogs] = useState<string[]>([]);
  const agentMockSteps = [
    "Reading transcript...",
    "Summary Agent running...",
    "Slack Update Agent running...",
    "PRD Agent running...",
    "Ticket Generator Agent running...",
    "Classifying priorities and due dates...",
    "Pushing tickets to Jira..."
  ];

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isLoading) {
      setActiveStep(0);
      setAgentLogs([agentMockSteps[0]]);
      interval = setInterval(() => {
        setActiveStep(prev => {
          const next = prev + 1;
          if (next < agentMockSteps.length) {
             setAgentLogs(curr => [...curr, agentMockSteps[next]]);
             return next;
          }
          return prev;
        });
      }, 1500); // add a step every 1.5s while loading
    }
    return () => clearInterval(interval);
  }, [isLoading]);

  const handleGenerate = async () => {
    if (transcript.length < 20) {
      toast.error('Transcript is too short to generate meaningful insights.');
      return;
    }
    setIsLoading(true);
    setOutput(null);
    setAgentLogs([]);
    try {
      const result = await processTranscript(transcript, jiraKey.trim() || undefined);
      setOutput(result);
      if (result.processing_steps && result.processing_steps.length > 0) {
         setAgentLogs(result.processing_steps);
      } else {
         setAgentLogs(curr => [...curr, "Pipeline complete"]);
      }
      toast.success('Generated successfully');
    } catch (e: any) {
      toast.error(e.message || 'Error running agents.');
      setAgentLogs(curr => [...curr, "Error processing transcript"]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendSlack = async () => {
    if (!output?.slack_update) return;
    setIsSlackSending(true);
    try {
      await sendSlackMessage(output.slack_update);
      toast.success('Slack message posted!');
    } catch (e: any) {
      toast.error(e.message || 'Failed to dispatch Slack message.');
    } finally {
      setIsSlackSending(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-full p-2 min-h-0">
      
      {/* Left Pane: Input */}
      <div className="flex flex-col h-full space-y-4 min-h-0">
        <h2 className="text-xl font-bold flex items-center gap-2">
          Flowy AI Input
        </h2>
        <Card className="flex flex-col flex-grow border shadow-sm min-h-0 overflow-hidden">
          <CardHeader className="py-3 px-4 bg-muted/30 border-b flex flex-row items-center justify-between shrink-0">
             <CardTitle className="text-sm font-medium">Meeting Transcript</CardTitle>
             <button
               onClick={() => setTranscript(SAMPLE_TRANSCRIPT)}
               className="text-xs text-primary hover:underline font-medium"
             >
               Load Sample →
             </button>
          </CardHeader>
          <CardContent className="p-0 relative flex-grow min-h-0">
            <Textarea
              placeholder="Paste the raw meeting transcript here. Our AI PM layer will do the rest..."
              className="absolute inset-0 border-0 rounded-none focus-visible:ring-0 resize-none p-4 text-sm overflow-y-auto"
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
            />
          </CardContent>
          <CardFooter className="flex justify-between items-center p-4 bg-muted/10 border-t shrink-0">
            <div className="flex flex-col gap-2">
              <div className="text-xs text-muted-foreground font-mono">
                {transcript.split(' ').filter(Boolean).length} words
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-muted-foreground">Jira Project (optional):</span>
                <input
                  type="text"
                  maxLength={10}
                  className="bg-background border rounded px-2 py-1 text-xs w-20 font-mono uppercase"
                  placeholder="e.g. PROJ"
                  value={jiraKey}
                  onChange={e => setJiraKey(e.target.value.toUpperCase())}
                />
              </div>
            </div>
            <Button
              onClick={handleGenerate}
              disabled={isLoading || transcript.length < 20}
              className="gap-2"
            >
              {isLoading ? <Icons.spinner className="animate-spin size-4" /> : <Icons.sparkles className="size-4" />}
              {isLoading ? 'Agents Processing...' : 'Process with Flowy'}
            </Button>
          </CardFooter>
        </Card>
      </div>

      {/* Right Pane: Logs / Output */}
      <div className="flex flex-col h-full space-y-4 min-h-0">
        <h2 className="text-xl font-bold flex items-center gap-2">
          Magic Output
        </h2>
        
        <Card className="flex flex-col flex-grow border shadow-sm overflow-hidden bg-background min-h-0">
          {(!output && !isLoading) && (
            <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-muted-foreground p-8 text-center space-y-4">
               <Icons.page className="size-12 opacity-20" />
               <p className="text-sm">Output space is empty.<br/>Paste a transcript and click process to generate PRDs, Tickets, and updates.</p>
            </div>
          )}

          {isLoading && (
            <div className="flex flex-col h-full min-h-[300px] bg-slate-950 text-emerald-400 font-mono text-sm p-4 rounded-b-xl overflow-y-auto w-full">
              <div className="flex items-center gap-2 mb-4 text-emerald-500 font-bold border-b border-emerald-900 pb-2">
                <Icons.spinner className="size-4 animate-spin" /> LIVE AGENT LOGS
              </div>
              <AnimatePresence>
                {agentLogs.map((log, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="py-1 flex gap-2"
                  >
                    <span className="opacity-50">[{new Date().toISOString().substring(11, 19)}]</span> {log}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}

          {output && !isLoading && (
             <Tabs defaultValue="tickets" className="flex flex-col h-full w-full">
               <div className="bg-muted/30 border-b px-2 pt-2">
                 <TabsList className="bg-transparent border-0 h-9 p-0 space-x-4">
                   <TabsTrigger value="tickets" className="data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-t-xl rounded-b-none border-b-0 h-full px-4"><Icons.kanban className="size-4 mr-2" /> Tickets ({output.tickets.length})</TabsTrigger>
                   <TabsTrigger value="summary" className="data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-t-xl rounded-b-none border-b-0 h-full px-4"><Icons.page className="size-4 mr-2" /> Summary</TabsTrigger>
                   <TabsTrigger value="prd" className="data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-t-xl rounded-b-none border-b-0 h-full px-4"><Icons.post className="size-4 mr-2" /> PRD</TabsTrigger>
                   <TabsTrigger value="slack" className="data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-t-xl rounded-b-none border-b-0 h-full px-4"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2 lucide lucide-slack"><rect width="3" height="8" x="13" y="2" rx="1.5"/><path d="M19 8.5V10h1.5A1.5 1.5 0 1 0 19 8.5z"/><rect width="3" height="8" x="8" y="14" rx="1.5"/><path d="M5 15.5V14H3.5A1.5 1.5 0 1 0 5 15.5z"/><rect width="8" height="3" x="14" y="13" rx="1.5"/><path d="M15.5 19H14v1.5a1.5 1.5 0 1 0 1.5-1.5z"/><rect width="8" height="3" x="2" y="8" rx="1.5"/><path d="M8.5 5H10V3.5A1.5 1.5 0 1 0 8.5 5z"/></svg> Slack</TabsTrigger>
                   <TabsTrigger value="logs" className="data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-t-xl rounded-b-none border-b-0 h-full px-4"><Icons.code className="size-4 mr-2" /> Logs</TabsTrigger>
                 </TabsList>
               </div>

               <div className="flex-grow overflow-y-auto p-4 min-h-0">
                 <TabsContent value="tickets" className="mt-0 h-full space-y-4">
                    {output.jira_error && (
                      <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md border border-destructive/20">
                        Jira Connection Error: {output.jira_error}
                      </div>
                    )}
                    
                    {output.jira_links.length > 0 && (
                      <div className="bg-emerald-500/10 text-emerald-600 text-sm p-3 rounded-md border border-emerald-500/20 mb-4 flex flex-col gap-2">
                         <div className="font-bold flex items-center gap-1">Live Jira Links</div>
                         <div className="flex flex-wrap gap-2">
                           {output.jira_links.map((link, i) => (
                              <a key={i} href={link} target="_blank" rel="noreferrer" className="text-xs hover:underline bg-background px-2 py-1 rounded shadow-sm border border-emerald-500/30">
                                {link.split('/').pop() || link} ↗
                              </a>
                           ))}
                         </div>
                      </div>
                    )}

                    <div className="grid grid-cols-1 gap-3">
                      {output.tickets.map(t => (
                        <div key={t.ticket_id} className="border rounded-md p-3 bg-card shadow-sm hover:shadow-md transition">
                          <div className="flex justify-between items-start mb-2">
                            <div className="font-bold text-sm">{t.ticket_id}: {t.summary}</div>
                            {t.jira_url && <a href={t.jira_url} target="_blank" rel="noreferrer" className="text-xs text-blue-500 hover:underline">{t.jira_key || 'View'} ↗</a>}
                          </div>
                          <div className="text-xs text-muted-foreground mb-3">{t.description}</div>
                          <div className="flex gap-2 text-[10px]">
                            <Badge variant="outline">{t.issue_type}</Badge>
                            <Badge variant={t.priority === 'High' ? 'destructive' : t.priority === 'Medium' ? 'default' : 'secondary'}>{t.priority}</Badge>
                            <Badge variant="secondary" className="font-mono">{t.assignee}</Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                 </TabsContent>

                 <TabsContent value="summary" className="mt-0 h-full text-sm whitespace-pre-wrap leading-relaxed text-muted-foreground">
                   {output.meeting_summary}
                 </TabsContent>

                 <TabsContent value="prd" className="mt-0 h-full prose prose-sm dark:prose-invert max-w-none text-muted-foreground whitespace-pre-wrap">
                   {output.prd_draft}
                 </TabsContent>

                 <TabsContent value="slack" className="mt-0 h-full flex flex-col h-full">
                    <div className="flex justify-between items-center mb-4">
                       <span className="text-sm font-medium text-muted-foreground">Preview before dispatching to #product-updates</span>
                       <Button size="sm" onClick={handleSendSlack} disabled={isSlackSending} variant="outline" className="border-indigo-500 text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20">
                         {isSlackSending ? <Icons.spinner className="size-4 animate-spin mr-2" /> : <Icons.send className="size-4 mr-2" />}
                         Push Live
                       </Button>
                    </div>
                    <div className="bg-muted p-4 rounded-md font-mono text-xs whitespace-pre-wrap flex-grow border">
                       {output.slack_update}
                    </div>
                 </TabsContent>

                 <TabsContent value="logs" className="mt-0 h-full bg-slate-950 text-emerald-400 font-mono text-xs p-4 rounded-md">
                   {output.processing_steps.map((step, i) => (
                     <div key={i} className="mb-1 py-1">
                       <span className="opacity-50">[{new Date().toISOString().substring(11, 19)}]</span> {step}
                     </div>
                   ))}
                 </TabsContent>
               </div>
             </Tabs>
          )}

        </Card>
      </div>

    </div>
  );
}
