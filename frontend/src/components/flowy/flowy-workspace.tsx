'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { processTranscript, sendSlackMessage, transcribeAudio, chatWithFlowy, FlowOutput } from '@/lib/flowy-api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Icons } from '@/components/icons';
import { toast } from 'sonner';
import { Waves, Mic, Radio, FileText, Kanban, Send, Slack, TerminalSquare, Clock, Plus, ChevronRight, ChevronLeft, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';

// ─── Sample transcript ────────────────────────────────────────────────────────
const SAMPLE_TRANSCRIPT = `Alright everyone, let's kick things off. Today's sprint planning call — main agenda: shipping the v2 dashboard before end of month.

First up, Emma — the onboarding flow has a critical bug. New users get stuck on the email verification screen and never make it to setup. This is a blocker, we need this fixed today. High priority.

Tom, we discussed the new CSV export feature for user lists. Product has been asking for this since Q3. Let's scope it as a Story — medium priority, due next Friday. You'll own that.

Sarah, the mobile app's performance on Android is terrible — animations are janky, the home feed takes 4 seconds to load. Let's log that as a Bug, high priority, and get it resolved this week.

We also need to redesign the pricing page. The current one has a 70% bounce rate. New design should be cleaner, with a comparison table. This is a Story for the design team — low priority, next sprint.

Finally, let's make sure we push sprint updates to the #product-updates Slack channel today after this call. Alex, can you handle that?

Key decisions: Launch date stays end of month. All blockers must be cleared by Wednesday. Next sync Thursday 4pm.`;

// ─── Constants ────────────────────────────────────────────────────────────────
const DESTINATIONS = [
  { id: 'jira',   name: 'Jira',   status: 'connected',   dot: 'bg-blue-500' },
  { id: 'linear', name: 'Linear', status: 'coming_soon', dot: 'bg-violet-500' },
  { id: 'asana',  name: 'Asana',  status: 'coming_soon', dot: 'bg-rose-500' },
] as const;

// ─── Web Speech API types ─────────────────────────────────────────────────────
interface SpeechRecognitionEvent { resultIndex: number; results: SpeechRecognitionResultList; }
interface SpeechRecognitionResultList { length: number; item(index: number): SpeechRecognitionResult; [index: number]: SpeechRecognitionResult; }
interface SpeechRecognitionResult { isFinal: boolean; length: number; item(index: number): SpeechRecognitionAlternative; [index: number]: SpeechRecognitionAlternative; }
interface SpeechRecognitionAlternative { transcript: string; confidence: number; }
interface SpeechRecognition extends EventTarget { continuous: boolean; interimResults: boolean; lang: string; start(): void; stop(): void; abort(): void; onresult: ((event: SpeechRecognitionEvent) => void) | null; onend: (() => void) | null; onerror: ((event: { error: string }) => void) | null; }
declare global { interface Window { SpeechRecognition: new () => SpeechRecognition; webkitSpeechRecognition: new () => SpeechRecognition; } }

// ─── Module Header component ──────────────────────────────────────────────────
function ModuleHeader({ index, title, badge }: { index: string; title: string; badge?: string }) {
  return (
    <div className="flex items-center justify-between mb-6">
      <div className="flex items-center gap-4">
        <span className="text-[10px] font-mono text-white/20 font-black tracking-[0.3em]">[{index}]</span>
        <h3 className="text-xs font-black text-white/50 uppercase tracking-[0.2em]">{title}</h3>
      </div>
      {badge && (
        <span className="text-[10px] font-mono text-emerald-500 border border-emerald-500/30 px-2 py-0.5 rounded-full">{badge}</span>
      )}
    </div>
  );
}

// ─── Inline Reflection Bar ────────────────────────────────────────────────────
function ReflectionBar({ onSend, isLoading, placeholder }: { onSend: (v: string) => void; isLoading: boolean; placeholder: string }) {
  const [val, setVal] = useState('');
  return (
    <div className="mt-6 flex items-center gap-2 border border-white/8 rounded-xl px-4 py-2.5 bg-white/[0.02] focus-within:border-white/20 transition-colors">
      <span className="text-[10px] font-mono text-white/20 uppercase tracking-widest whitespace-nowrap">Refine →</span>
      <input
        className="flex-1 bg-transparent text-sm text-white placeholder:text-white/20 outline-none font-medium"
        placeholder={placeholder}
        value={val}
        onChange={e => setVal(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && val.trim()) { onSend(val); setVal(''); } }}
        disabled={isLoading}
      />
      <button
        onClick={() => { if (val.trim()) { onSend(val); setVal(''); } }}
        disabled={isLoading || !val.trim()}
        className="text-white/30 hover:text-white disabled:opacity-20 transition-colors"
      >
        {isLoading ? <Icons.spinner className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
      </button>
    </div>
  );
}

// ─── Priority badge ───────────────────────────────────────────────────────────
const PRIORITY_STYLE: Record<string, string> = {
  High:   'border-red-500/40 text-red-400',
  Medium: 'border-amber-500/40 text-amber-400',
  Low:    'border-white/10 text-white/40',
};

// ─── Main component ───────────────────────────────────────────────────────────
export function FlowyWorkspace() {
  // ── Core State ──
  const [transcript, setTranscript] = useState('');
  const [jiraKey, setJiraKey] = useState('FLOWY');
  const [isLoading, setIsLoading] = useState(false);
  const [output, setOutput] = useState<FlowOutput | null>(null);
  const [isSlackSending, setIsSlackSending] = useState(false);
  const [destination, setDestination] = useState('jira');
  const [showDestDropdown, setShowDestDropdown] = useState(false);
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [pipelineMs, setPipelineMs] = useState<number | null>(null);

  // ── Speech ──
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

  // ── Reflection Chat ──
  const [summaryHistory, setSummaryHistory] = useState<any[]>([]);
  const [prdHistory, setPrdHistory] = useState<any[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const outputEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (output) outputEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [output, summaryHistory, prdHistory]);

  // ── Agent logs ──
  const [agentLogs, setAgentLogs] = useState<string[]>([]);
  const [activeStep, setActiveStep] = useState(0);
  const agentMockSteps = [
    'Reading transcript...',
    'Supervisor Agent: extracting context...',
    'Summary Agent running...',
    'Slack Update Agent running...',
    'PRD Agent running...',
    'Ticket Generator running...',
    'Classifying priorities...',
    `Pushing to ${DESTINATIONS.find(d => d.id === destination)?.name || 'platform'}...`,
  ];
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isLoading) {
      setActiveStep(0);
      setAgentLogs([agentMockSteps[0]]);
      interval = setInterval(() => {
        setActiveStep(prev => {
          const next = prev + 1;
          if (next < agentMockSteps.length) { setAgentLogs(curr => [...curr, agentMockSteps[next]]); return next; }
          return prev;
        });
      }, 1500);
    }
    return () => clearInterval(interval);
  }, [isLoading]);

  const isSpeechSupported = typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

  const cleanMessage = (content: string) => content.split('```markdown')[0].split('```')[0].trim();
  const extractUpdate = (content: string) => {
    const parts = content.split('```markdown');
    if (parts.length > 1) return parts[1].split('```')[0].trim();
    const fallback = content.split('```');
    if (fallback.length > 1) return fallback[1].trim();
    return null;
  };
  const handleRestore = (content: string | null, mode: 'summary' | 'prd', version: number) => {
    if (!content || !output) return;
    setOutput(prev => prev ? { ...prev, [mode === 'summary' ? 'meeting_summary' : 'prd_draft']: content } : prev);
    toast.success(`Restored ${mode.toUpperCase()} ${version === 0 ? 'Initial Draft' : `v${version}`}`);
  };

  // ── Speech Recognition ──
  const startRecording = useCallback(() => {
    if (!isSpeechSupported) { toast.error('Use Chrome for speech recognition.'); return; }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    let finalTranscript = transcript;
    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i];
        if (r.isFinal) finalTranscript += r[0].transcript + ' ';
        else interim += r[0].transcript;
      }
      setTranscript(finalTranscript + interim);
    };
    recognition.onend = () => {
      if (recognitionRef.current !== null) { try { recognition.start(); } catch (_) {} }
      else { setIsRecording(false); clearInterval(recordingTimerRef.current!); recordingTimerRef.current = null; setRecordingDuration(0); }
    };
    recognition.onerror = (e: { error: string }) => {
      if (e.error !== 'aborted' && e.error !== 'no-speech') { toast.error(`Mic error: ${e.error}`); setIsRecording(false); }
    };
    recognitionRef.current = recognition;
    recognition.start();
    setIsRecording(true);
    setRecordingDuration(0);
    recordingTimerRef.current = setInterval(() => setRecordingDuration(prev => prev + 1), 1000);
    toast.success('Recording started.');
  }, [isSpeechSupported, transcript]);

  const stopRecording = useCallback(() => {
    if (recognitionRef.current) { recognitionRef.current.stop(); recognitionRef.current = null; }
    if (recordingTimerRef.current) { clearInterval(recordingTimerRef.current); recordingTimerRef.current = null; }
    setIsRecording(false);
    setRecordingDuration(0);
    toast.success('Recording stopped.');
  }, []);

  const startFullCapture = async () => {
    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } as any });
      const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (displayStream.getAudioTracks().length === 0) { displayStream.getTracks().forEach(t => t.stop()); micStream.getTracks().forEach(t => t.stop()); toast.error('No meeting audio. Did you check "Share Audio"?'); return; }
      setPreviewStream(displayStream);
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      await audioCtx.resume();
      fullCaptureContextRef.current = audioCtx;
      const mixed = audioCtx.createMediaStreamDestination();
      const sysGain = audioCtx.createGain(); sysGain.gain.value = 1.2;
      const micGain = audioCtx.createGain(); micGain.gain.value = 0.8;
      audioCtx.createMediaStreamSource(displayStream).connect(sysGain); sysGain.connect(mixed);
      audioCtx.createMediaStreamSource(micStream).connect(micGain); micGain.connect(mixed);
      fullCaptureStreamsRef.current = [displayStream, micStream];
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
      const recorder = new MediaRecorder(mixed.stream, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 128000 });
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];
      recorder.ondataavailable = e => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        setIsFullCapturing(false); setPreviewStream(null); stopRecording();
        try { fullCaptureStreamsRef.current.forEach(s => s.getTracks().forEach(t => t.stop())); fullCaptureStreamsRef.current = []; if (fullCaptureContextRef.current?.state !== 'closed') fullCaptureContextRef.current?.close(); } catch (_) {}
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        if (audioChunksRef.current.length === 0 || blob.size < 500) { toast.error('No audio captured.'); return; }
        setIsLoading(true); setOutput(null); setAgentLogs(['Merging dual-channel audio...', 'Connecting to Whisper...', 'Transcribing...']);
        try { const r = await transcribeAudio(blob, jiraKey.trim() || undefined, destination); setOutput(r); if (r.processing_steps) setAgentLogs(r.processing_steps); if (r.raw_transcript) setTranscript(r.raw_transcript); else if (r.meeting_summary) setTranscript(r.meeting_summary); }
        catch (err: any) { toast.error(err.message || 'Capture failed'); }
        finally { setIsLoading(false); }
      };
      recorder.start(1000);
      setIsFullCapturing(true); setRecordingDuration(0);
      recordingTimerRef.current = setInterval(() => setRecordingDuration(prev => prev + 1), 1000);
      if (isSpeechSupported) startRecording();
      toast.success('True Capture active.');
    } catch (err: any) { toast.error('Failed to start capture.'); }
  };

  const stopFullCapture = () => {
    if (mediaRecorderRef.current) mediaRecorderRef.current.stop();
    fullCaptureStreamsRef.current.forEach(s => s.getTracks().forEach(t => t.stop()));
    if (fullCaptureContextRef.current) fullCaptureContextRef.current.close();
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    setIsFullCapturing(false); setRecordingDuration(0);
  };

  const formatDuration = (s: number) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  const handleChat = async (mode: 'summary' | 'prd', message: string) => {
    if (!output) return;
    const setHistory = mode === 'summary' ? setSummaryHistory : setPrdHistory;
    const history   = mode === 'summary' ? summaryHistory    : prdHistory;
    setHistory(prev => [...prev, { role: 'user', content: message }]);
    setIsChatLoading(true);
    try {
      const current = mode === 'summary' ? output.meeting_summary : (output.prd_draft || '');
      const result = await chatWithFlowy(message, history, transcript, current, mode);
      setHistory(prev => [...prev, { role: 'assistant', content: result.response }]);
      if (result.updated_content) setOutput(prev => prev ? { ...prev, [mode === 'summary' ? 'meeting_summary' : 'prd_draft']: result.updated_content } : prev);
    } catch (err: any) { toast.error('Reflection failed: ' + err.message); }
    finally { setIsChatLoading(false); }
  };

  const handleGenerate = async () => {
    if (transcript.length < 20) { toast.error('Transcript too short.'); return; }
    setIsLoading(true); setOutput(null); setAgentLogs([]);
    const t0 = Date.now();
    try {
      const result = await processTranscript(transcript, jiraKey.trim() || undefined, destination);
      setOutput(result);
      setPipelineMs(Date.now() - t0);
      if (result.meeting_summary) setSummaryHistory([{ role: 'assistant', content: `Initial summary.\n\n\`\`\`markdown\n${result.meeting_summary}\n\`\`\`` }]);
      if (result.prd_draft) setPrdHistory([{ role: 'assistant', content: `Initial PRD.\n\n\`\`\`markdown\n${result.prd_draft}\n\`\`\`` }]);
      if (result.processing_steps?.length) setAgentLogs(result.processing_steps);
      else setAgentLogs(curr => [...curr, 'Pipeline complete.']);
      toast.success('Pipeline complete.');
    } catch (e: any) { toast.error(e.message || 'Error running agents.'); setAgentLogs(curr => [...curr, 'Error.']); }
    finally { setIsLoading(false); }
  };

  const selectedDest = DESTINATIONS.find(d => d.id === destination) || DESTINATIONS[0];
  const wordCount = transcript.split(' ').filter(Boolean).length;

  return (
    <div className="flex h-screen w-full bg-[#080808] text-white overflow-hidden font-sans">

      {/* ═══════════════════════════════════════════════════
          ZONE 1 — LEFT NAV STRIP
      ═══════════════════════════════════════════════════ */}
      <aside className={`flex flex-col border-r border-white/5 bg-[#0A0A0A] transition-all duration-300 shrink-0 ${navCollapsed ? 'w-[60px]' : 'w-[220px]'}`}>
        {/* Logo */}
        <div className="flex items-center gap-2.5 p-4 border-b border-white/5 shrink-0">
          <div className="size-7 rounded-full bg-white flex items-center justify-center shrink-0">
            <Waves className="size-3.5 text-black" />
          </div>
          {!navCollapsed && <span className="text-sm font-black tracking-tighter uppercase">Flowy</span>}
        </div>

        {/* New Session */}
        <div className="p-3 border-b border-white/5 shrink-0">
          <button
            onClick={() => { setOutput(null); setTranscript(''); setAgentLogs([]); toast.success('New session ready.'); }}
            className={`flex items-center gap-2 w-full rounded-xl border border-white/8 bg-white/[0.02] hover:bg-white/[0.05] transition-colors px-3 py-2.5 text-white/60 hover:text-white ${navCollapsed ? 'justify-center' : ''}`}
          >
            <Plus className="size-3.5 shrink-0" />
            {!navCollapsed && <span className="text-xs font-bold uppercase tracking-widest">New Session</span>}
          </button>
        </div>

        {/* History placeholder */}
        {!navCollapsed && (
          <div className="flex-1 overflow-y-auto p-3 space-y-1">
            <div className="text-[9px] font-mono text-white/15 tracking-[0.3em] uppercase px-2 mb-3">Today</div>
            {['Sprint Planning', 'Q2 Roadmap Review', 'Bug Triage'].map((s, i) => (
              <button key={i} className="w-full text-left px-2 py-2 rounded-lg text-xs text-white/35 hover:text-white hover:bg-white/5 transition-colors truncate">
                {s}
              </button>
            ))}
            <div className="text-[9px] font-mono text-white/15 tracking-[0.3em] uppercase px-2 mb-3 mt-5">This Week</div>
            {['Design Sync', 'Investor Call'].map((s, i) => (
              <button key={i} className="w-full text-left px-2 py-2 rounded-lg text-xs text-white/25 hover:text-white hover:bg-white/5 transition-colors truncate">
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Collapse toggle */}
        <button
          onClick={() => setNavCollapsed(!navCollapsed)}
          className="flex items-center justify-center p-4 border-t border-white/5 text-white/20 hover:text-white transition-colors"
        >
          {navCollapsed ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}
        </button>
      </aside>

      {/* ═══════════════════════════════════════════════════
          ZONE 2 — INPUT COLUMN
      ═══════════════════════════════════════════════════ */}
      <div className="w-[360px] shrink-0 flex flex-col border-r border-white/5 bg-[#0C0C0C]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-white/5 shrink-0">
          <div className="text-[9px] font-mono text-white/20 tracking-[0.3em] uppercase mb-1">Input Module</div>
          <h2 className="text-sm font-black uppercase tracking-tight text-white">Meeting Capture</h2>
        </div>

        {/* Capture Controls */}
        <div className="px-5 py-3 border-b border-white/5 shrink-0 flex items-center gap-2">
          <button
            onClick={isFullCapturing ? stopFullCapture : startFullCapture}
            className={`flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest px-3 py-2 rounded-lg border transition-all ${isFullCapturing ? 'border-violet-500/50 text-violet-400 bg-violet-500/10 animate-pulse' : 'border-white/10 text-white/40 hover:text-white hover:border-white/30'}`}
          >
            <Radio className="size-3" />
            {isFullCapturing ? `${formatDuration(recordingDuration)}` : 'True Capture'}
          </button>
          <button
            onClick={isRecording ? stopRecording : startRecording}
            disabled={isFullCapturing}
            className={`flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest px-3 py-2 rounded-lg border transition-all disabled:opacity-30 ${isRecording ? 'border-red-500/50 text-red-400 bg-red-500/10 animate-pulse' : 'border-white/10 text-white/40 hover:text-white hover:border-white/30'}`}
          >
            <Mic className="size-3" />
            {isRecording ? formatDuration(recordingDuration) : 'Live Mic'}
          </button>
          <button
            onClick={() => setTranscript(SAMPLE_TRANSCRIPT)}
            disabled={isRecording || isFullCapturing}
            className="ml-auto text-[10px] font-bold text-white/20 hover:text-white/50 transition-colors disabled:opacity-20 uppercase tracking-widest"
          >
            Sample →
          </button>
        </div>

        {/* Transcript textarea */}
        <div className="flex-1 relative min-h-0">
          <textarea
            className="absolute inset-0 w-full h-full resize-none bg-transparent p-5 text-sm text-white/70 placeholder:text-white/15 outline-none leading-relaxed font-mono"
            placeholder="Paste a meeting transcript, or use Capture controls above..."
            value={transcript}
            onChange={e => setTranscript(e.target.value)}
          />
        </div>

        {/* Word count */}
        <div className="px-5 py-2 border-t border-white/5 shrink-0 flex items-center justify-between">
          <span className="text-[10px] font-mono text-white/20">{wordCount} words</span>
          {isRecording && <span className="text-[10px] font-mono text-red-400 animate-pulse">● RECORDING</span>}
          {isFullCapturing && <span className="text-[10px] font-mono text-violet-400 animate-pulse">● TRUE CAPTURE</span>}
        </div>

        {/* Project Config */}
        <div className="px-5 py-3 border-t border-white/5 shrink-0 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono text-white/20 uppercase tracking-[0.2em]">Project Key</span>
            <input
              type="text"
              maxLength={10}
              className="bg-white/[0.03] border border-white/8 rounded-lg px-2 py-1 text-xs font-mono uppercase text-white w-24 text-right outline-none focus:border-white/20 transition-colors"
              value={jiraKey}
              onChange={e => setJiraKey(e.target.value.toUpperCase())}
            />
          </div>

          {/* Destination Picker */}
          <div className="flex items-center justify-between relative">
            <span className="text-[10px] font-mono text-white/20 uppercase tracking-[0.2em]">Destination</span>
            <button
              onClick={() => setShowDestDropdown(!showDestDropdown)}
              className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-white/50 hover:text-white transition-colors"
            >
              <span className={`size-1.5 rounded-full ${selectedDest.dot}`} />
              {selectedDest.name}
              <Icons.chevronDown className="size-2.5" />
            </button>
            {showDestDropdown && (
              <div className="absolute right-0 bottom-full mb-1 bg-[#111] border border-white/10 rounded-xl shadow-2xl z-50 w-44 py-1 overflow-hidden">
                {DESTINATIONS.map(d => (
                  <button
                    key={d.id}
                    onClick={() => { if (d.status === 'connected') setDestination(d.id); else toast.info(`${d.name} coming soon.`); setShowDestDropdown(false); }}
                    className={`w-full flex items-center justify-between px-3 py-2.5 text-xs hover:bg-white/5 transition-colors ${destination === d.id ? 'text-white font-bold' : 'text-white/40'}`}
                  >
                    <span className="flex items-center gap-2">
                      <span className={`size-1.5 rounded-full ${d.dot}`} />
                      {d.name}
                    </span>
                    {d.status === 'connected'
                      ? <CheckCircle2 className="size-3 text-emerald-500" />
                      : <span className="text-[9px] text-white/20 uppercase tracking-widest">Soon</span>
                    }
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Process Button */}
        <div className="p-4 border-t border-white/5 shrink-0">
          <button
            onClick={handleGenerate}
            disabled={isLoading || transcript.length < 20}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-white text-black font-black text-xs uppercase tracking-widest hover:bg-emerald-400 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            {isLoading
              ? <><Icons.spinner className="size-3.5 animate-spin" /> Processing...</>
              : <><Icons.sparkles className="size-3.5" /> Process with Flowy</>
            }
          </button>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════
          ZONE 3 — OUTPUT LEDGER
      ═══════════════════════════════════════════════════ */}
      <div className="flex-1 overflow-y-auto bg-[#080808]">
        {/* Empty state */}
        {!output && !isLoading && (
          <div className="flex flex-col items-center justify-center h-full text-center p-12 space-y-6">
            <div className="size-16 rounded-2xl border border-white/5 flex items-center justify-center mb-2">
              <Waves className="size-7 text-white/10" />
            </div>
            <div>
              <h3 className="text-2xl font-black tracking-tighter text-white/20 uppercase mb-2">Awaiting Input</h3>
              <p className="text-sm text-white/15 max-w-sm leading-relaxed">Paste a transcript or record your meeting, then click <strong className="text-white/30">Process with Flowy</strong>.</p>
            </div>
            <div className="grid grid-cols-3 gap-3 mt-4 max-w-sm w-full">
              {['[01] Summary', '[02] Tickets', '[03] PRD'].map((m, i) => (
                <div key={i} className="border border-white/5 rounded-xl p-3 text-center">
                  <span className="text-[9px] font-mono text-white/15 uppercase tracking-widest">{m}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Loading — Agent Logs */}
        {isLoading && (
          <div className="flex flex-col h-full p-8 max-w-3xl mx-auto">
            <div className="text-[9px] font-mono text-white/20 tracking-[0.3em] uppercase mb-6">// Pipeline Executing</div>
            <div className="space-y-3">
              <AnimatePresence>
                {agentLogs.map((log, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -16 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.4 }}
                    className="flex items-center gap-4 font-mono text-sm"
                  >
                    <span className="text-white/15 text-[10px] tabular-nums">{String(i + 1).padStart(2, '0')}</span>
                    <span className={i === agentLogs.length - 1 ? 'text-emerald-400' : 'text-white/30'}>{log}</span>
                    {i === agentLogs.length - 1 && <Icons.spinner className="size-3 text-emerald-400 animate-spin" />}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
        )}

        {/* Output Ledger */}
        {output && !isLoading && (
          <div className="max-w-4xl mx-auto py-10 px-8 space-y-1">

            {/* Ledger Header */}
            <div className="mb-10">
              <div className="text-[9px] font-mono text-white/20 tracking-[0.3em] uppercase mb-2">
                Session // {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                {pipelineMs && <span className="ml-4 text-emerald-500">Pipeline: {(pipelineMs / 1000).toFixed(1)}s</span>}
              </div>
              <h2 className="text-3xl font-black tracking-tighter text-white uppercase">Meeting Output</h2>
              {output.jira_links?.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {output.jira_links.map((link, i) => (
                    <a key={i} href={link} target="_blank" rel="noreferrer" className="text-[10px] font-mono text-emerald-400 border border-emerald-500/30 px-3 py-1 rounded-full hover:bg-emerald-500/10 transition-colors">
                      {link.split('/').pop()} ↗
                    </a>
                  ))}
                </div>
              )}
              {output.jira_error && (
                <div className="mt-3 flex items-center gap-2 text-red-400 text-xs font-mono border border-red-500/20 rounded-xl px-3 py-2 bg-red-500/5">
                  <AlertCircle className="size-3.5" /> {output.jira_error}
                </div>
              )}
            </div>

            {/* Module [01] — Executive Summary */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="border border-white/8 rounded-2xl p-8 bg-white/[0.015]"
            >
              <ModuleHeader index="01" title="Executive Summary" />
              <div className="text-sm text-white/60 leading-relaxed whitespace-pre-wrap font-medium">
                {output.meeting_summary}
              </div>
              <ReflectionBar onSend={msg => handleChat('summary', msg)} isLoading={isChatLoading} placeholder="Refine this summary..." />
              {summaryHistory.length > 1 && (
                <div className="mt-4 space-y-2 border-t border-white/5 pt-4">
                  {summaryHistory.slice(1).map((msg, i) => msg.role !== 'user' && extractUpdate(msg.content) && (
                    <button
                      key={i}
                      onClick={() => handleRestore(extractUpdate(msg.content), 'summary', i + 1)}
                      className="w-full text-left px-3 py-2 rounded-lg border border-white/5 bg-white/[0.02] hover:border-indigo-500/30 hover:bg-indigo-500/5 transition-colors group"
                    >
                      <div className="text-[9px] font-mono text-indigo-400 uppercase tracking-widest mb-1 flex items-center justify-between">
                        <span>Snapshot v{i + 1}</span>
                        <span className="opacity-0 group-hover:opacity-100 transition-opacity">Restore ↩</span>
                      </div>
                      <div className="text-[10px] text-white/30 italic line-clamp-1">{extractUpdate(msg.content)?.slice(0, 80)}...</div>
                    </button>
                  ))}
                </div>
              )}
            </motion.div>

            {/* Module [02] — Tickets */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="border border-white/8 rounded-2xl p-8 bg-white/[0.015]"
            >
              <ModuleHeader index="02" title={`Tickets → ${selectedDest.name}`} badge={`${output.tickets.length} Created`} />
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {output.tickets.map((t, i) => (
                  <div key={t.ticket_id} className="border border-white/8 rounded-xl p-4 bg-white/[0.01] hover:bg-white/[0.03] transition-colors group">
                    <div className="flex items-start justify-between mb-3">
                      <span className={`text-[9px] font-mono border px-2 py-0.5 rounded-full ${PRIORITY_STYLE[t.priority] || PRIORITY_STYLE.Low}`}>
                        {t.issue_type} · {t.priority}
                      </span>
                      {t.jira_url && (
                        <a href={t.jira_url} target="_blank" rel="noreferrer" className="text-[9px] font-mono text-white/20 hover:text-white transition-colors">
                          {t.jira_key} ↗
                        </a>
                      )}
                    </div>
                    <h4 className="text-xs font-black text-white/80 leading-tight mb-2">{t.summary}</h4>
                    <p className="text-[10px] text-white/30 leading-relaxed line-clamp-3">{t.description}</p>
                    <div className="mt-3 pt-3 border-t border-white/5 text-[9px] font-mono text-white/20">{t.assignee}</div>
                  </div>
                ))}
              </div>
            </motion.div>

            {/* Module [03] — PRD Draft */}
            {output.prd_draft && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="border border-white/8 rounded-2xl p-8 bg-white/[0.015]"
              >
                <ModuleHeader index="03" title="PRD Specification" />
                <div className="prose prose-sm prose-invert max-w-none text-white/50 leading-relaxed whitespace-pre-wrap text-sm">
                  {output.prd_draft}
                </div>
                <ReflectionBar onSend={msg => handleChat('prd', msg)} isLoading={isChatLoading} placeholder="Refine this PRD with any instruction..." />
                {prdHistory.length > 1 && (
                  <div className="mt-4 space-y-2 border-t border-white/5 pt-4">
                    {prdHistory.slice(1).map((msg, i) => msg.role !== 'user' && extractUpdate(msg.content) && (
                      <button
                        key={i}
                        onClick={() => handleRestore(extractUpdate(msg.content), 'prd', i + 1)}
                        className="w-full text-left px-3 py-2 rounded-lg border border-white/5 bg-white/[0.02] hover:border-indigo-500/30 hover:bg-indigo-500/5 transition-colors group"
                      >
                        <div className="text-[9px] font-mono text-indigo-400 uppercase tracking-widest mb-1 flex items-center justify-between">
                          <span>Snapshot v{i + 1}</span>
                          <span className="opacity-0 group-hover:opacity-100 transition-opacity">Restore ↩</span>
                        </div>
                        <div className="text-[10px] text-white/30 italic line-clamp-1">{extractUpdate(msg.content)?.slice(0, 80)}...</div>
                      </button>
                    ))}
                  </div>
                )}
              </motion.div>
            )}

            {/* Module [04] — Slack Dispatch */}
            {output.slack_update && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.3 }}
                className="border border-white/8 rounded-2xl p-8 bg-white/[0.015]"
              >
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-4">
                    <span className="text-[10px] font-mono text-white/20 font-black tracking-[0.3em]">[04]</span>
                    <h3 className="text-xs font-black text-white/50 uppercase tracking-[0.2em]">Slack Dispatch</h3>
                  </div>
                  <button
                    onClick={async () => { setIsSlackSending(true); try { await sendSlackMessage(output.slack_update); toast.success('Posted to Slack!'); } catch (e: any) { toast.error(e.message); } finally { setIsSlackSending(false); } }}
                    disabled={isSlackSending}
                    className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest px-3 py-2 rounded-lg border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 transition-all disabled:opacity-30"
                  >
                    {isSlackSending ? <Icons.spinner className="size-3 animate-spin" /> : <Send className="size-3" />}
                    Push Live
                  </button>
                </div>
                <div className="bg-[#1A1D21] rounded-xl p-4 font-mono text-xs text-white/50 whitespace-pre-wrap leading-relaxed border border-white/5">
                  {output.slack_update}
                </div>
              </motion.div>
            )}

            <div ref={outputEndRef} className="h-10" />
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════
          ZONE 4 — RIGHT CONTROL CENTER
      ═══════════════════════════════════════════════════ */}
      <aside className="w-[260px] shrink-0 flex flex-col border-l border-white/5 bg-[#0A0A0A] overflow-y-auto">
        <div className="px-5 py-4 border-b border-white/5">
          <div className="text-[9px] font-mono text-white/20 tracking-[0.3em] uppercase mb-1">Run Settings</div>
          <h2 className="text-sm font-black uppercase tracking-tight text-white">Control Center</h2>
        </div>

        {/* Connection status */}
        <div className="px-5 py-4 border-b border-white/5 space-y-3">
          <div className="text-[9px] font-mono text-white/20 tracking-[0.3em] uppercase">Connections</div>
          {[
            { name: 'Jira Cloud', status: 'Connected', ok: true },
            { name: 'Whisper API', status: 'Active', ok: true },
            { name: 'Slack Web API', status: 'Connected', ok: true },
          ].map((c, i) => (
            <div key={i} className="flex items-center justify-between">
              <span className="text-xs text-white/40 font-medium">{c.name}</span>
              <span className={`text-[9px] font-mono uppercase tracking-widest ${c.ok ? 'text-emerald-400' : 'text-red-400'}`}>{c.status}</span>
            </div>
          ))}
        </div>

        {/* Pipeline Metrics */}
        <div className="px-5 py-4 border-b border-white/5 space-y-3">
          <div className="text-[9px] font-mono text-white/20 tracking-[0.3em] uppercase">Session Metrics</div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-white/40">Words</span>
            <span className="text-xs font-mono text-white/60">{wordCount}</span>
          </div>
          {pipelineMs && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-white/40">Latency</span>
              <span className="text-xs font-mono text-emerald-400">{(pipelineMs / 1000).toFixed(1)}s</span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-xs text-white/40">Agents</span>
            <span className="text-xs font-mono text-white/60">4 parallel</span>
          </div>
        </div>

        {/* Agent Log Ticker */}
        <div className="px-5 py-4 border-b border-white/5 flex-1">
          <div className="text-[9px] font-mono text-white/20 tracking-[0.3em] uppercase mb-3 flex items-center gap-2">
            Agent Logs
            {isLoading && <Icons.spinner className="size-2.5 text-emerald-400 animate-spin" />}
          </div>
          <div className="space-y-2 font-mono text-[10px]">
            {agentLogs.length === 0 && (
              <div className="text-white/15">Awaiting pipeline...</div>
            )}
            {agentLogs.map((log, i) => (
              <div key={i} className={`${i === agentLogs.length - 1 && isLoading ? 'text-emerald-400' : 'text-white/20'} leading-relaxed`}>
                <span className="text-white/10 mr-2">{String(i + 1).padStart(2, '0')}</span>{log}
              </div>
            ))}
          </div>
        </div>

        {/* Re-run */}
        {output && (
          <div className="p-4 border-t border-white/5">
            <button
              onClick={handleGenerate}
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-white/10 text-white/40 hover:text-white hover:border-white/30 text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-20"
            >
              <RefreshCw className="size-3" />
              Re-run Pipeline
            </button>
          </div>
        )}
      </aside>

      {/* Floating live capture monitor */}
      <AnimatePresence>
        {isFullCapturing && previewStream && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="fixed bottom-6 right-[280px] w-72 aspect-video bg-background/80 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50"
          >
            <div className="absolute top-2 left-2 z-10 flex items-center gap-2">
              <Badge className="bg-red-500 text-[9px] px-1.5 h-4 border-none animate-pulse">LIVE</Badge>
            </div>
            <video ref={el => { if (el) el.srcObject = previewStream; }} autoPlay muted playsInline className="w-full h-full object-cover" />
            <div className="absolute bottom-2 right-2 text-[9px] font-mono text-white bg-black/60 px-2 py-0.5 rounded-full">
              {formatDuration(recordingDuration)} ●
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
