'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { processTranscript, sendSlackMessage, transcribeAudio, chatWithFlowy, FlowOutput } from '@/lib/flowy-api';
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

// Destination platform configuration
const DESTINATIONS = [
  { id: 'jira', name: 'Jira', status: 'connected', color: 'text-blue-500', bg: 'bg-blue-500/10' },
  { id: 'linear', name: 'Linear', status: 'coming_soon', color: 'text-violet-500', bg: 'bg-violet-500/10' },
  { id: 'asana', name: 'Asana', status: 'coming_soon', color: 'text-rose-500', bg: 'bg-rose-500/10' },
] as const;

// Web Speech API type declarations
interface SpeechRecognitionEvent {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
}

export function FlowyWorkspace() {
  const [transcript, setTranscript] = useState('');
  const [jiraKey, setJiraKey] = useState('FLOWY');
  const [isLoading, setIsLoading] = useState(false);
  const [output, setOutput] = useState<FlowOutput | null>(null);
  const [isSlackSending, setIsSlackSending] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const [destination, setDestination] = useState('jira');
  const [showDestDropdown, setShowDestDropdown] = useState(false);

  // Speech recognition state
  const [isRecording, setIsRecording] = useState(false);
  const [isFullCapturing, setIsFullCapturing] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const fullCaptureContextRef = useRef<AudioContext | null>(null);
  const fullCaptureStreamsRef = useRef<MediaStream[]>([]);
  const [previewStream, setPreviewStream] = useState<MediaStream | null>(null);

  // Reflection Chat States
  const [summaryHistory, setSummaryHistory] = useState<any[]>([]);
  const [prdHistory, setPrdHistory] = useState<any[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [summaryHistory, prdHistory]);

  // Check browser support
  const isSpeechSupported = typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

  // Helper to strip markdown code blocks from chat display
  const cleanMessage = (content: string) => {
    return content.split('```markdown')[0].split('```')[0].trim();
  };

  // Helper to extract document updates for history view
  const extractUpdate = (content: string) => {
    const parts = content.split('```markdown');
    if (parts.length > 1) return parts[1].split('```')[0].trim();
    const fallback = content.split('```');
    if (fallback.length > 1) return fallback[1].trim();
    return null;
  };

  // Helper to restore a historical version
  const handleRestore = (content: string | null, mode: 'summary' | 'prd', version: number) => {
    if (!content || !output) return;
    setOutput(prev => prev ? { ...prev, [mode === 'summary' ? 'meeting_summary' : 'prd_draft']: content } : prev);
    toast.success(`Restored ${mode.toUpperCase()} ${version === 0 ? 'Initial Draft' : `Snapshot v${version}`}`);
    setAgentLogs(prev => [...prev, `Restored ${version === 0 ? 'original' : 'historical'} ${mode.toUpperCase()} version`]);
    
    // Smooth scroll main viewer to top for feedback
    const viewerId = mode === 'summary' ? 'summary-viewer' : 'prd-viewer';
    document.getElementById(viewerId)?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Simulated agent steps for the UI
  const [agentLogs, setAgentLogs] = useState<string[]>([]);
  const agentMockSteps = [
    "Reading transcript...",
    "Supervisor Agent: Extracting context and speaker roles...",
    "Summary Agent running...",
    "Slack Update Agent running...",
    "PRD Agent running...",
    "Ticket Generator Agent running...",
    "Classifying priorities and due dates...",
    `Pushing tickets to ${DESTINATIONS.find(d => d.id === destination)?.name || 'platform'}...`
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
      }, 1500);
    }
    return () => clearInterval(interval);
  }, [isLoading]);

  // ── Speech Recognition ──
  const startRecording = useCallback(() => {
    if (!isSpeechSupported) {
      toast.error('Speech recognition is not supported in this browser. Please use Chrome.');
      return;
    }

    const SpeechRecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognitionClass();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    let finalTranscript = transcript;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interimTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript += result[0].transcript + ' ';
        } else {
          interimTranscript += result[0].transcript;
        }
      }
      setTranscript(finalTranscript + interimTranscript);
    };

    recognition.onend = () => {
      if (isRecording || isFullCapturing) {
        try {
          recognition.start();
        } catch (e) {}
      } else {
        setIsRecording(false);
        if (recordingTimerRef.current) {
          clearInterval(recordingTimerRef.current);
          recordingTimerRef.current = null;
        }
        setRecordingDuration(0);
      }
    };

    recognition.onerror = (event: { error: string }) => {
      console.error('Speech recognition error:', event.error);
      if (event.error !== 'aborted' && event.error !== 'no-speech') {
        toast.error(`Microphone error: ${event.error}`);
        setIsRecording(false);
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsRecording(true);
    setRecordingDuration(0);

    recordingTimerRef.current = setInterval(() => {
      setRecordingDuration(prev => prev + 1);
    }, 1000);

    toast.success('Recording started. Speak naturally.');
  }, [isSpeechSupported, transcript]);

  const startFullCapture = async () => {
    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({ 
        video: true, 
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } 
      });
      const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });

      if (displayStream.getAudioTracks().length === 0) {
          displayStream.getTracks().forEach(t => t.stop());
          micStream.getTracks().forEach(t => t.stop());
          toast.error("No meeting audio found! Did you forget to check 'Share Audio' in the popup?");
          return;
      }

      setPreviewStream(displayStream);

      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      await audioCtx.resume();
      fullCaptureContextRef.current = audioCtx;
      
      const destination = audioCtx.createMediaStreamDestination();
      const systemGain = audioCtx.createGain();
      const micGain = audioCtx.createGain();
      systemGain.gain.value = 1.2;
      micGain.gain.value = 0.8;
      
      const displaySource = audioCtx.createMediaStreamSource(displayStream);
      const micSource = audioCtx.createMediaStreamSource(micStream);
      
      displaySource.connect(systemGain);
      systemGain.connect(destination);
      micSource.connect(micGain);
      micGain.connect(destination);
      
      fullCaptureStreamsRef.current = [displayStream, micStream];

      const recorder = new MediaRecorder(destination.stream, { 
        mimeType: 'audio/webm;codecs=opus',
        audioBitsPerSecond: 128000
      });
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        setIsFullCapturing(false);
        setPreviewStream(null);
        stopRecording();

        try {
          if (fullCaptureStreamsRef.current) {
            fullCaptureStreamsRef.current.forEach(s => s.getTracks().forEach(t => t.stop()));
            fullCaptureStreamsRef.current = [];
          }
          if (fullCaptureContextRef.current && fullCaptureContextRef.current.state !== 'closed') {
            fullCaptureContextRef.current.close();
          }
        } catch (e) { console.error("Cleanup error", e); }
        
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setIsLoading(true);
        setOutput(null);
        setAgentLogs(['Merging dual-channel audio...', 'Connecting to Whisper engine...', 'Transcribing with diarization...']);
        
        try {
          const result = await transcribeAudio(audioBlob, jiraKey.trim() || undefined, destination);
          setOutput(result);
          if (result.processing_steps) setAgentLogs(result.processing_steps);
          if (result.raw_transcript) setTranscript(result.raw_transcript);
          else if (result.meeting_summary) setTranscript(result.meeting_summary);
        } catch (err: any) {
          toast.error(err.message || 'Full capture failed');
        } finally {
          setIsLoading(false);
        }
      };

      recorder.start(1000);
      setIsFullCapturing(true);
      setRecordingDuration(0);
      recordingTimerRef.current = setInterval(() => { setRecordingDuration(prev => prev + 1); }, 1000);
      if (isSpeechSupported) startRecording();
      toast.success('True Capture Active: Sharing meeting audio + your mic.');
    } catch (err: any) {
      console.error('Full capture error', err);
      toast.error('Failed to start full capture. Make sure to allow both Mic and Screen Audio.');
    }
  };

  const stopRecording = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    setIsRecording(false);
    setRecordingDuration(0);
    toast.success('Recording stopped. Transcript captured.');
  }, []);

  const stopFullCapture = () => {
    if (mediaRecorderRef.current) mediaRecorderRef.current.stop();
    if (fullCaptureStreamsRef.current) {
      fullCaptureStreamsRef.current.forEach(s => s.getTracks().forEach(t => t.stop()));
    }
    if (fullCaptureContextRef.current) fullCaptureContextRef.current.close();
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    setIsFullCapturing(false);
    setRecordingDuration(0);
  };

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const handleChat = async (mode: 'summary' | 'prd') => {
    if (!chatInput.trim() || !output) return;
    const userMsg = { role: 'user', content: chatInput };
    const history = mode === 'summary' ? summaryHistory : prdHistory;
    const setHistory = mode === 'summary' ? setSummaryHistory : setPrdHistory;
    setHistory(prev => [...prev, userMsg]);
    setChatInput('');
    setIsChatLoading(true);
    try {
      const currentContent = mode === 'summary' ? output.meeting_summary : (output.prd_draft || '');
      const result = await chatWithFlowy(userMsg.content, history, transcript, currentContent, mode);
      const assistantMsg = { role: 'assistant', content: result.response };
      setHistory(prev => [...prev, assistantMsg]);
      if (result.updated_content) {
        setOutput(prev => prev ? { ...prev, [mode === 'summary' ? 'meeting_summary' : 'prd_draft']: result.updated_content } : prev);
        setAgentLogs(prev => [...prev, `AI refined the ${mode.toUpperCase()} draft`]);
      }
    } catch (err: any) {
      toast.error("Reflection failed: " + err.message);
    } finally {
      setIsChatLoading(false);
    }
  };

  const handleGenerate = async () => {
    if (transcript.length < 20) {
      toast.error('Transcript is too short to generate meaningful insights.');
      return;
    }
    setIsLoading(true);
    setOutput(null);
    setAgentLogs([]);
    try {
      const result = await processTranscript(transcript, jiraKey.trim() || undefined, destination);
      setOutput(result);
      
      // Seed the initial history with 'Initial Version' snapshots
      if (result.meeting_summary) {
        setSummaryHistory([{
          role: 'assistant',
          content: `Initial summary generated. \n\n \`\`\`markdown\n${result.meeting_summary}\n\`\`\``
        }]);
      }
      
      if (result.prd_draft) {
        setPrdHistory([{
          role: 'assistant',
          content: `Initial PRD draft generated. \n\n \`\`\`markdown\n${result.prd_draft}\n\`\`\``
        }]);
      }

      if (result.processing_steps && result.processing_steps.length > 0) setAgentLogs(result.processing_steps);
      else setAgentLogs(curr => [...curr, "Pipeline complete"]);
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

  const selectedDest = DESTINATIONS.find(d => d.id === destination) || DESTINATIONS[0];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-full p-2 min-h-0">
      <div className="flex flex-col h-full space-y-4 min-h-0">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold flex items-center gap-2">Flowy AI Input</h2>
          <div className="relative">
            <button
              onClick={() => setShowDestDropdown(!showDestDropdown)}
              className={`flex items-center gap-2 text-xs font-medium border rounded-lg px-3 py-1.5 hover:bg-muted/50 transition ${selectedDest.color}`}
            >
              <span className={`size-2 rounded-full ${destination === 'jira' ? 'bg-blue-500' : destination === 'linear' ? 'bg-violet-500' : 'bg-rose-500'}`} />
              Push to: {selectedDest.name}
              <Icons.chevronDown className="size-3" />
            </button>
            {showDestDropdown && (
              <div className="absolute right-0 top-full mt-1 bg-popover border rounded-lg shadow-lg z-50 w-52 py-1">
                {DESTINATIONS.map(d => (
                  <button
                    key={d.id}
                    onClick={() => {
                      if (d.status === 'connected') setDestination(d.id);
                      else toast.info(`${d.name} integration is on the waitlist.`);
                      setShowDestDropdown(false);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-muted/50 transition ${destination === d.id ? 'bg-muted/30 font-medium' : ''}`}
                  >
                    <span className="flex items-center gap-2">
                      <span className={`size-2 rounded-full ${d.id === 'jira' ? 'bg-blue-500' : d.id === 'linear' ? 'bg-violet-500' : 'bg-rose-500'}`} />
                      {d.name}
                    </span>
                    {d.status === 'connected' ? <Badge variant="outline" className="text-[10px] text-emerald-500 border-emerald-500/30">Connected</Badge> : <Badge variant="outline" className="text-[10px] text-muted-foreground">Waitlist</Badge>}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <Card className="flex flex-col flex-grow border shadow-sm min-h-0 overflow-hidden">
          <CardHeader className="py-3 px-4 bg-muted/30 border-b flex flex-row items-center justify-between shrink-0">
             <CardTitle className="text-sm font-medium">Meeting Transcript</CardTitle>
             <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" className={`h-8 gap-2 text-xs font-semibold rounded-lg transition-all ${isFullCapturing ? 'bg-indigo-500/10 text-indigo-500 animate-pulse' : 'hover:bg-indigo-500/10 hover:text-indigo-500'}`} onClick={isFullCapturing ? stopFullCapture : startFullCapture}>
                    {isFullCapturing ? <Icons.spinner className="size-3 animate-spin" /> : <Icons.settings className="size-3" />}
                    {isFullCapturing ? 'Stop Capture' : 'True Capture'}
                  </Button>
                  <Button variant="ghost" size="sm" className={`h-8 gap-2 text-xs font-semibold rounded-lg transition-all ${isRecording ? 'bg-red-500/10 text-red-500 animate-pulse' : 'hover:bg-red-500/10 hover:text-red-500'}`} onClick={isRecording ? stopRecording : startRecording} disabled={isFullCapturing}>
                    <Icons.mic className="size-3" />
                    {isRecording ? `Stop (${formatDuration(recordingDuration)})` : 'Record Live'}
                  </Button>
                  <Button variant="ghost" size="sm" className="h-8 gap-2 text-xs font-semibold hover:bg-muted/50 rounded-lg" onClick={() => setTranscript(SAMPLE_TRANSCRIPT)} disabled={isRecording || isFullCapturing}>
                    Load Sample &rarr;
                  </Button>
                </div>
             </div>
          </CardHeader>
          <CardContent className="p-0 relative flex-grow min-h-0">
            <Textarea
              placeholder="Paste a meeting transcript, or click 'Record Live' to transcribe from your microphone..."
              className="absolute inset-0 border-0 rounded-none focus-visible:ring-0 resize-none p-4 text-sm overflow-y-auto"
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
            />
          </CardContent>
          <CardFooter className="flex justify-between items-center p-4 bg-muted/10 border-t shrink-0">
            <div className="flex flex-col gap-2">
              <div className="text-xs text-muted-foreground font-mono">
                {transcript.split(' ').filter(Boolean).length} words
                {isRecording && <span className="ml-2 text-red-500">Recording...</span>}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-muted-foreground">Project Key (optional):</span>
                <input type="text" maxLength={10} className="bg-background border rounded px-2 py-1 text-xs w-20 font-mono uppercase" placeholder="e.g. PROJ" value={jiraKey} onChange={e => setJiraKey(e.target.value.toUpperCase())} />
              </div>
            </div>
            <Button onClick={handleGenerate} disabled={isLoading || transcript.length < 20} className="gap-2">
              {isLoading ? <Icons.spinner className="animate-spin size-4" /> : <Icons.sparkles className="size-4" />}
              {isLoading ? 'Agents Processing...' : 'Process with Flowy'}
            </Button>
          </CardFooter>
        </Card>
      </div>

      <div className="flex flex-col h-full space-y-4 min-h-0">
        <h2 className="text-xl font-bold flex items-center gap-2">Agent Output</h2>
        <Card className="flex flex-col flex-grow border shadow-sm overflow-hidden bg-background min-h-0">
          {(!output && !isLoading) && (
            <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-muted-foreground p-8 text-center space-y-4">
               <Icons.page className="size-12 opacity-20" />
               <p className="text-sm">Output space is empty.<br/>Paste a transcript or record a live meeting, then click process to generate PRDs, Tickets, and updates.</p>
            </div>
          )}
          {isLoading && (
            <div className="flex flex-col h-full min-h-[300px] bg-slate-950 text-emerald-400 font-mono text-sm p-4 rounded-b-xl overflow-y-auto w-full">
              <div className="flex items-center gap-2 mb-4 text-emerald-500 font-bold border-b border-emerald-900 pb-2">
                <Icons.spinner className="size-4 animate-spin" /> LIVE AGENT LOGS
              </div>
              <AnimatePresence>
                {agentLogs.map((log, index) => (
                  <motion.div key={index} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="py-1 flex gap-2">
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
                   <TabsTrigger value="slack" className="data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-t-xl rounded-b-none border-b-0 h-full px-4"><Icons.slack className="size-4 mr-2" /> Slack</TabsTrigger>
                   <TabsTrigger value="logs" className="data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-t-xl rounded-b-none border-b-0 h-full px-4"><Icons.code className="size-4 mr-2" /> Logs</TabsTrigger>
                 </TabsList>
               </div>
               <div className="flex-grow overflow-y-auto p-4 min-h-0">
                 <TabsContent value="tickets" className="mt-0 h-full space-y-4">
                    {output.jira_error && <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md border border-destructive/20">Platform Connection Error: {output.jira_error}</div>}
                    {output.jira_links.length > 0 && (
                      <div className="bg-emerald-500/10 text-emerald-600 text-sm p-3 rounded-md border border-emerald-500/20 mb-4 flex flex-col gap-2">
                         <div className="font-bold flex items-center gap-1">Live {selectedDest.name} Links</div>
                         <div className="flex flex-wrap gap-2">
                           {output.jira_links.map((link, i) => (
                              <a key={i} href={link} target="_blank" rel="noreferrer" className="text-xs hover:underline bg-background px-2 py-1 rounded shadow-sm border border-emerald-500/30">{link.split('/').pop() || link} ↗</a>
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

                 <TabsContent value="summary" className="mt-0 h-full flex flex-col min-h-0">
                    <div className="flex-grow overflow-y-auto pr-2 space-y-4 mb-4">
                      <div className="text-sm whitespace-pre-wrap leading-relaxed text-muted-foreground bg-muted/20 p-4 rounded-xl border">{output.meeting_summary}</div>
                      <div className="space-y-3">
                        {summaryHistory.map((msg, i) => (
                           <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                              <div className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-[13px] leading-relaxed shadow-sm transition-all ${
                                msg.role === 'user' 
                                  ? 'bg-gradient-to-br from-indigo-600 to-violet-700 text-white rounded-tr-none shadow-indigo-200/50' 
                                  : 'bg-white/60 dark:bg-black/40 backdrop-blur-md border border-white/20 rounded-tl-none text-foreground'
                              }`}>
                                {msg.role === 'user' ? msg.content : cleanMessage(msg.content)}

                                {/* Document Evolution Snapshot */}
                                {msg.role !== 'user' && msg.content.includes('```') && (
                                  <div 
                                    className="mt-3 bg-background/50 rounded-xl border border-white/10 p-2.5 text-[11px] font-mono overflow-hidden cursor-pointer hover:border-indigo-500/50 hover:bg-indigo-500/5 transition-colors group"
                                    onClick={() => handleRestore(extractUpdate(msg.content), 'summary', i)}
                                  >
                                    <div className="flex items-center justify-between mb-1.5">
                                      <div className="flex items-center gap-1.5 text-indigo-500 font-semibold uppercase tracking-wider text-[9px]">
                                        <Icons.history className="size-3" /> {i === 0 ? 'Initial Summary' : `Revised Summary v${i}`}
                                      </div>
                                      <div className="text-[9px] text-indigo-400 font-medium group-hover:text-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                                        Restore <Icons.clock className="size-2" />
                                      </div>
                                    </div>
                                    <div className="line-clamp-2 opacity-70 italic">
                                      {extractUpdate(msg.content)?.slice(0, 100)}...
                                    </div>
                                  </div>
                                )}
                              </div>
                           </div>
                        ))}
                        <div ref={scrollRef} />
                      </div>
                    </div>
                    <div className="relative mt-auto">
                      <input className="w-full bg-background border rounded-full px-4 py-2 text-xs focus:ring-1 focus:ring-indigo-500 outline-none pr-10" placeholder="Ask Flowy to change the summary or cross-question..." value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleChat('summary')} disabled={isChatLoading} />
                      <Button size="icon" variant="ghost" className="absolute right-1 top-1/2 -translate-y-1/2 size-7 hover:bg-transparent text-indigo-500" onClick={() => handleChat('summary')} disabled={isChatLoading}>
                         {isChatLoading ? <Icons.spinner className="size-3 animate-spin"/> : <Icons.send className="size-3"/>}
                      </Button>
                    </div>
                 </TabsContent>

                 <TabsContent value="prd" className="mt-0 h-full flex flex-col min-h-0">
                    <div className="flex-grow overflow-y-auto pr-2 space-y-4 mb-4">
                      <div className="prose prose-sm dark:prose-invert max-w-none text-muted-foreground whitespace-pre-wrap bg-muted/20 p-4 rounded-xl border">{output.prd_draft}</div>
                      <div className="space-y-3">
                        {prdHistory.map((msg, i) => (
                           <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                              <div className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-[13px] leading-relaxed shadow-sm transition-all ${
                                msg.role === 'user' 
                                  ? 'bg-gradient-to-br from-indigo-600 to-violet-700 text-white rounded-tr-none shadow-indigo-200/50' 
                                  : 'bg-white/60 dark:bg-black/40 backdrop-blur-md border border-white/20 rounded-tl-none text-foreground'
                              }`}>
                                {msg.role === 'user' ? msg.content : cleanMessage(msg.content)}

                                {/* Document Evolution Snapshot */}
                                {msg.role !== 'user' && msg.content.includes('```') && (
                                  <div 
                                    className="mt-3 bg-background/50 rounded-xl border border-white/10 p-2.5 text-[11px] font-mono overflow-hidden cursor-pointer hover:border-indigo-500/50 hover:bg-indigo-500/5 transition-colors group"
                                    onClick={() => handleRestore(extractUpdate(msg.content), 'prd', i)}
                                  >
                                    <div className="flex items-center justify-between mb-1.5">
                                      <div className="flex items-center gap-1.5 text-indigo-500 font-semibold uppercase tracking-wider text-[9px]">
                                        <Icons.history className="size-3" /> {i === 0 ? 'Initial PRD' : `Revised PRD v${i}`}
                                      </div>
                                      <div className="text-[9px] text-indigo-400 font-medium group-hover:text-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                                        Restore <Icons.clock className="size-2" />
                                      </div>
                                    </div>
                                    <div className="line-clamp-2 opacity-70 italic text-[10px] leading-tight">
                                      {extractUpdate(msg.content)?.slice(0, 100)}...
                                    </div>
                                  </div>
                                )}
                              </div>
                           </div>
                        ))}
                        <div ref={scrollRef} />
                      </div>
                      </div>
                    <div className="relative mt-auto">
                      <input className="w-full bg-background border rounded-full px-4 py-2 text-xs focus:ring-1 focus:ring-indigo-500 outline-none pr-10" placeholder="Refine this PRD with instructions or questions..." value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleChat('prd')} disabled={isChatLoading} />
                      <Button size="icon" variant="ghost" className="absolute right-1 top-1/2 -translate-y-1/2 size-7 hover:bg-transparent text-indigo-500" onClick={() => handleChat('prd')} disabled={isChatLoading}>
                        {isChatLoading ? <Icons.spinner className="size-3 animate-spin"/> : <Icons.send className="size-3"/>}
                      </Button>
                    </div>
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

      {/* ── Floating Live Monitor ── */}
      <AnimatePresence>
        {isFullCapturing && previewStream && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="fixed bottom-6 right-6 w-72 aspect-video bg-background/80 backdrop-blur-xl border border-primary/20 rounded-xl shadow-2xl overflow-hidden z-50 group pointer-events-none"
          >
            <div className="absolute top-2 left-2 z-10 flex items-center gap-2">
              <Badge className="bg-red-500 animate-pulse text-[10px] px-1.5 h-4 border-none">
                LIVE CAPTURE
              </Badge>
              <div className="text-[10px] text-white bg-black/50 px-1.5 h-4 rounded-full backdrop-blur-sm flex items-center gap-1">
                <Icons.monitor className="size-2" />
                Dual-Source
              </div>
            </div>
            
            <video
              ref={(el) => {
                if (el) el.srcObject = previewStream;
              }}
              autoPlay
              muted
              playsInline
              className="w-full h-full object-cover grayscale-[0.2] group-hover:grayscale-0 transition-all duration-500"
            />
            
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-60" />
            <div className="absolute bottom-2 left-2 right-2 text-[10px] text-white flex justify-between items-center font-mono font-bold tracking-tight">
               <span>MONITORING STREAM</span>
               <span className="flex items-center gap-1">
                 {formatDuration(recordingDuration)}
                 <span className="size-1.5 bg-red-500 rounded-full animate-pulse" />
               </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
