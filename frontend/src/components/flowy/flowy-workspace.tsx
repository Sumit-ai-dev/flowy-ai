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

const MODELS = [
  { id: 'gemini',  name: 'Gemini 2.0',  provider: 'Google',    color: 'text-blue-400',   dot: 'bg-blue-400',    status: 'active' },
  { id: 'gpt4o',  name: 'GPT-4o',       provider: 'OpenAI',    color: 'text-emerald-400', dot: 'bg-emerald-400', status: 'active' },
  { id: 'claude', name: 'Claude 3.5',   provider: 'Anthropic', color: 'text-amber-400',  dot: 'bg-amber-400',   status: 'active' },
  { id: 'llama',  name: 'Llama 3.3',    provider: 'Meta',      color: 'text-violet-400', dot: 'bg-violet-400',  status: 'coming_soon' },
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
const CHAT_MODELS = [
  { id: 'gemini', name: 'Gemini 2.0', dot: 'bg-blue-400',   color: 'text-blue-400',   glow: '59,130,246' },
  { id: 'gpt4o',  name: 'GPT-4o',    dot: 'bg-emerald-400', color: 'text-emerald-400', glow: '52,211,153' },
  { id: 'claude', name: 'Claude',    dot: 'bg-amber-400',   color: 'text-amber-400',   glow: '251,191,36' },
  { id: 'llama',  name: 'Llama 3.3', dot: 'bg-violet-400',  color: 'text-violet-400',  glow: '167,139,250' },
];

function ReflectionBar({
  onSend, isLoading, placeholder, model, onModelChange,
}: {
  onSend: (v: string) => void;
  isLoading: boolean;
  placeholder: string;
  model?: string;
  onModelChange?: (m: string) => void;
}) {
  const [val, setVal] = useState('');
  const [showPicker, setShowPicker] = useState(false);
  const activeModel = CHAT_MODELS.find(m => m.id === model) || CHAT_MODELS[0];
  return (
    <div className="relative">
      {/* Model mini-picker dropdown */}
      {showPicker && onModelChange && (
        <motion.div
          initial={{ opacity: 0, y: 6, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          className="absolute bottom-full mb-2 left-0 bg-[#141416] border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden w-48"
        >
          {CHAT_MODELS.map(m => (
            <button
              key={m.id}
              onClick={() => { onModelChange(m.id); setShowPicker(false); }}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-xs hover:bg-white/5 transition-colors ${
                model === m.id ? 'bg-white/[0.04]' : ''
              }`}
            >
              <span className={`size-2 rounded-full ${m.dot} ${model === m.id ? 'animate-pulse' : 'opacity-40'}`}
                style={model === m.id ? { boxShadow: `0 0 6px rgba(${m.glow},0.8)` } : {}} />
              <span className={`font-bold uppercase tracking-wide text-[10px] ${
                model === m.id ? m.color : 'text-white/40'
              }`}>{m.name}</span>
              {model === m.id && <span className="ml-auto text-emerald-400 text-[9px]">✓</span>}
            </button>
          ))}
        </motion.div>
      )}

      <div className="flex items-center gap-2 border border-white/8 rounded-xl bg-white/[0.02] focus-within:border-white/20 transition-colors overflow-hidden">
        {/* Model pill (left side) */}
        {model && onModelChange && (
          <button
            onClick={() => setShowPicker(p => !p)}
            className="flex items-center gap-1.5 pl-3 pr-2 py-2.5 border-r border-white/[0.06] hover:bg-white/[0.03] transition-colors shrink-0"
          >
            <span
              className={`size-1.5 rounded-full ${activeModel.dot} animate-pulse`}
              style={{ boxShadow: `0 0 5px rgba(${activeModel.glow},0.8)` }}
            />
            <span className={`text-[9px] font-black uppercase tracking-widest ${activeModel.color}`}
              style={{ textShadow: `0 0 10px rgba(${activeModel.glow},0.4)` }}>
              {activeModel.name}
            </span>
            <Icons.chevronDown className={`size-2.5 text-white/20 transition-transform ${showPicker ? 'rotate-180' : ''}`} />
          </button>
        )}
        {/* Refine label */}
        {!model && <span className="text-[10px] font-mono text-white/20 uppercase tracking-widest whitespace-nowrap pl-4">Refine →</span>}
        {/* Input */}
        <input
          className="flex-1 bg-transparent text-sm text-white placeholder:text-white/20 outline-none font-medium py-2.5 pr-2"
          placeholder={placeholder}
          value={val}
          onChange={e => setVal(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && val.trim()) { onSend(val); setVal(''); } }}
          disabled={isLoading}
        />
        <button
          onClick={() => { if (val.trim()) { onSend(val); setVal(''); } }}
          disabled={isLoading || !val.trim()}
          className="text-white/30 hover:text-white disabled:opacity-20 transition-colors pr-3"
        >
          {isLoading ? <Icons.spinner className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
        </button>
      </div>
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
  const [selectedModel, setSelectedModel] = useState('gemini');
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [pipelineMs, setPipelineMs] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'summary' | 'tickets' | 'prd' | 'slack'>('summary');

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

  // ── File Upload ──
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const ACCEPTED_TYPES = '.pdf,.png,.jpg,.jpeg,.webp,.txt,.doc,.docx,.mp3,.wav,.m4a,.mp4,.mov';
  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    const arr = Array.from(files);
    setUploadedFiles(prev => [...prev, ...arr.filter(f => !prev.find(p => p.name === f.name))]);
  };
  const removeFile = (name: string) => setUploadedFiles(prev => prev.filter(f => f.name !== name));
  const fileIcon = (f: File) => {
    const t = f.type;
    if (t.includes('pdf')) return { icon: '📄', color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20' };
    if (t.startsWith('image/')) return { icon: '🖼', color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' };
    if (t.startsWith('audio/')) return { icon: '🎵', color: 'text-violet-400', bg: 'bg-violet-500/10 border-violet-500/20' };
    if (t.startsWith('video/')) return { icon: '🎬', color: 'text-pink-400', bg: 'bg-pink-500/10 border-pink-500/20' };
    if (t.includes('word') || t.includes('document')) return { icon: '📝', color: 'text-indigo-400', bg: 'bg-indigo-500/10 border-indigo-500/20' };
    return { icon: '📎', color: 'text-white/40', bg: 'bg-white/5 border-white/10' };
  };
  const fmtSize = (n: number) => n < 1024 ? `${n}B` : n < 1048576 ? `${(n/1024).toFixed(0)}KB` : `${(n/1048576).toFixed(1)}MB`;

  // ── Reflection Chat ──
  const [summaryHistory, setSummaryHistory] = useState<any[]>([]);
  const [prdHistory, setPrdHistory] = useState<any[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const outputEndRef = useRef<HTMLDivElement>(null);
  const outputLedgerRef = useRef<HTMLDivElement>(null);
  const tabScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (output) outputEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [output, summaryHistory, prdHistory]);

  // Global wheel redirect: scroll Tab content when mouse is outside it
  useEffect(() => {
    const handler = (e: WheelEvent) => {
      const scroller = tabScrollRef.current;
      if (!scroller) return;
      if (scroller.contains(e.target as Node)) return; // already inside — do nothing
      scroller.scrollTop += e.deltaY;
    };
    window.addEventListener('wheel', handler, { passive: true });
    return () => window.removeEventListener('wheel', handler);
  }, []);

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
        try { const r = await transcribeAudio(blob, jiraKey.trim() || undefined, destination, selectedModel); setOutput(r); if (r.processing_steps) setAgentLogs(r.processing_steps); if (r.raw_transcript) setTranscript(r.raw_transcript); else if (r.meeting_summary) setTranscript(r.meeting_summary); }
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
      const result = await chatWithFlowy(message, history, transcript, current, mode, selectedModel);
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
      const result = await processTranscript(transcript, jiraKey.trim() || undefined, destination, selectedModel);
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

      {/* ZONE 2 — INPUT COLUMN — PREMIUM REDESIGN */}
      <div className="w-[360px] shrink-0 flex flex-col border-r border-white/[0.06] relative overflow-hidden"
        style={{ background: 'linear-gradient(180deg, #0e0e10 0%, #0a0a0c 100%)' }}
        onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={e => { e.preventDefault(); setIsDragOver(false); handleFiles(e.dataTransfer.files); }}
      >
        {/* Hidden file input */}
        <input ref={fileInputRef} type="file" multiple accept={ACCEPTED_TYPES} className="hidden"
          onChange={e => handleFiles(e.target.files)} />

        {/* Drag-over overlay */}
        {isDragOver && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex flex-col items-center justify-center rounded-none pointer-events-none"
            style={{ background: 'rgba(99,102,241,0.12)', border: '2px dashed rgba(99,102,241,0.5)', backdropFilter: 'blur(4px)' }}
          >
            <div className="size-14 rounded-2xl flex items-center justify-center mb-3"
              style={{ background: 'rgba(99,102,241,0.2)', boxShadow: '0 0 30px rgba(99,102,241,0.4)' }}>
              <span className="text-2xl">📂</span>
            </div>
            <p className="text-sm font-black text-indigo-300 uppercase tracking-widest">Drop to Upload</p>
            <p className="text-[9px] font-mono text-white/30 mt-1">PDF · Image · Audio · Doc</p>
          </motion.div>
        )}

        {/* Mesh gradient atmosphere */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-20 -left-20 w-64 h-64 rounded-full bg-indigo-600/[0.06] blur-3xl" />
          <div className="absolute bottom-0 right-0 w-48 h-48 rounded-full bg-violet-600/[0.04] blur-3xl" />
        </div>

        {/* ── HEADER ── */}
        <div className="relative px-5 pt-5 pb-4 shrink-0">
          <div className="flex items-center gap-3">
            {/* Logo mark */}
            <div className="relative shrink-0">
              <div className="size-9 rounded-xl flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', boxShadow: '0 0 24px rgba(99,102,241,0.5)' }}>
                <Waves className="size-4 text-white" />
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full bg-emerald-400 border-2 border-[#0e0e10]" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[8px] font-mono text-white/20 tracking-[0.35em] uppercase">Input Module</div>
              <h2 className="text-[13px] font-black uppercase tracking-tight text-white leading-tight">Meeting Capture</h2>
            </div>
            {/* Session badge */}
            <div className="flex items-center gap-1.5 bg-white/[0.04] backdrop-blur border border-white/[0.08] rounded-full px-2.5 py-1">
              <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[8px] font-mono text-white/30 uppercase tracking-wider">Live</span>
            </div>
          </div>
          {/* Bottom edge glow */}
          <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-indigo-500/20 to-transparent" />
        </div>

        {/* ── CAPTURE CONTROLS ── */}
        <div className="px-4 py-3 shrink-0 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            {/* True Capture */}
            <button
              onClick={isFullCapturing ? stopFullCapture : startFullCapture}
              className="relative flex flex-col items-center gap-1.5 py-3 px-3 rounded-xl border transition-all overflow-hidden group"
              style={isFullCapturing ? {
                borderColor: 'rgba(139,92,246,0.5)',
                background: 'rgba(139,92,246,0.10)',
                boxShadow: '0 0 18px rgba(139,92,246,0.25)',
              } : {
                borderColor: 'rgba(255,255,255,0.07)',
                background: 'rgba(255,255,255,0.02)',
              }}
            >
              {!isFullCapturing && <span className="absolute inset-0 bg-white/0 group-hover:bg-white/[0.03] transition-colors rounded-xl" />}
              <Radio className={`size-4 ${isFullCapturing ? 'text-violet-300 animate-pulse' : 'text-white/30 group-hover:text-white/60 transition-colors'}`} />
              <span className={`text-[9px] font-black uppercase tracking-widest ${isFullCapturing ? 'text-violet-300' : 'text-white/30 group-hover:text-white/60 transition-colors'}`}>
                {isFullCapturing ? formatDuration(recordingDuration) : 'True Capture'}
              </span>
              {isFullCapturing && (
                <div className="flex items-end gap-[2px] h-3">
                  {[3,5,4,6,3,5,4].map((h, i) => (
                    <span key={i} className="w-[2px] rounded-full bg-violet-400"
                      style={{ height: `${h}px`, animation: `pulse ${0.5 + i * 0.1}s ease-in-out infinite alternate` }} />
                  ))}
                </div>
              )}
            </button>
            {/* Live Mic */}
            <button
              onClick={isRecording ? stopRecording : startRecording}
              disabled={isFullCapturing}
              className="relative flex flex-col items-center gap-1.5 py-3 px-3 rounded-xl border transition-all overflow-hidden group disabled:opacity-30"
              style={isRecording ? {
                borderColor: 'rgba(239,68,68,0.5)',
                background: 'rgba(239,68,68,0.10)',
                boxShadow: '0 0 18px rgba(239,68,68,0.25)',
              } : {
                borderColor: 'rgba(255,255,255,0.07)',
                background: 'rgba(255,255,255,0.02)',
              }}
            >
              {!isRecording && <span className="absolute inset-0 bg-white/0 group-hover:bg-white/[0.03] transition-colors rounded-xl" />}
              <Mic className={`size-4 ${isRecording ? 'text-red-300 animate-pulse' : 'text-white/30 group-hover:text-white/60 transition-colors'}`} />
              <span className={`text-[9px] font-black uppercase tracking-widest ${isRecording ? 'text-red-300' : 'text-white/30 group-hover:text-white/60 transition-colors'}`}>
                {isRecording ? formatDuration(recordingDuration) : 'Live Mic'}
              </span>
              {isRecording && (
                <div className="flex items-end gap-[2px] h-3">
                  {[4,6,3,5,7,4,5].map((h, i) => (
                    <span key={i} className="w-[2px] rounded-full bg-red-400"
                      style={{ height: `${h}px`, animation: `pulse ${0.4 + i * 0.12}s ease-in-out infinite alternate` }} />
                  ))}
                </div>
              )}
            </button>
          </div>
          {/* Sample link */}
          <button
            onClick={() => setTranscript(SAMPLE_TRANSCRIPT)}
            disabled={isRecording || isFullCapturing}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-dashed border-white/[0.08] text-[9px] font-mono text-white/20 hover:text-white/50 hover:border-white/20 transition-all disabled:opacity-20 uppercase tracking-widest"
          >
            <span className="size-1 rounded-full bg-white/20" />
            Load Sample Transcript
            <span className="size-1 rounded-full bg-white/20" />
          </button>
          {/* Upload button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-dashed text-[9px] font-mono uppercase tracking-widest transition-all"
            style={{ borderColor: 'rgba(99,102,241,0.25)', color: 'rgba(99,102,241,0.5)' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(99,102,241,0.5)'; (e.currentTarget as HTMLElement).style.color = 'rgba(165,180,252,0.8)'; (e.currentTarget as HTMLElement).style.background = 'rgba(99,102,241,0.06)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(99,102,241,0.25)'; (e.currentTarget as HTMLElement).style.color = 'rgba(99,102,241,0.5)'; (e.currentTarget as HTMLElement).style.background = ''; }}
          >
            <span className="text-[10px]">⬆</span>
            Upload File  · Drag & Drop
          </button>
        </div>

        {/* ── UPLOADED FILE CHIPS ── */}
        {uploadedFiles.length > 0 && (
          <div className="px-4 pb-2 shrink-0 flex flex-col gap-1.5">
            <div className="text-[8px] font-mono text-white/15 uppercase tracking-[0.3em] mb-0.5">Attached Files</div>
            {uploadedFiles.map(f => {
              const { icon, color, bg } = fileIcon(f);
              return (
                <motion.div
                  key={f.name}
                  initial={{ opacity: 0, x: -12, scale: 0.95 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{ opacity: 0, x: -12, scale: 0.95 }}
                  transition={{ duration: 0.25, ease: 'easeOut' }}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-xl border ${bg} group`}
                >
                  <span className="text-sm shrink-0">{icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className={`text-[10px] font-mono font-bold truncate ${color}`}>{f.name}</div>
                    <div className="text-[8px] font-mono text-white/20">{fmtSize(f.size)}</div>
                  </div>
                  <button
                    onClick={() => removeFile(f.name)}
                    className="size-4 rounded-full bg-white/5 hover:bg-red-500/20 flex items-center justify-center text-white/20 hover:text-red-400 transition-all opacity-0 group-hover:opacity-100"
                  >
                    <span className="text-[9px] leading-none">✕</span>
                  </button>
                </motion.div>
              );
            })}
          </div>
        )}

        <div className="flex-1 relative min-h-0 mx-4 mb-3">
          <div className="absolute inset-0 rounded-xl border border-white/[0.06] overflow-hidden"
            style={{ background: 'rgba(255,255,255,0.015)' }}>
            {/* Glow when typing */}
            {transcript.length > 0 && (
              <div className="absolute inset-0 rounded-xl pointer-events-none"
                style={{ boxShadow: 'inset 0 0 30px rgba(99,102,241,0.03)' }} />
            )}
            {/* Recording live ring */}
            {(isRecording || isFullCapturing) && (
              <div className="absolute inset-0 rounded-xl border-2 pointer-events-none animate-pulse"
                style={{ borderColor: isRecording ? 'rgba(239,68,68,0.4)' : 'rgba(139,92,246,0.4)' }} />
            )}
            <textarea
              className="absolute inset-0 w-full h-full resize-none bg-transparent px-4 py-4 text-[13px] text-white/65 placeholder:text-white/15 outline-none leading-relaxed font-mono"
              placeholder={"// Paste transcript here...\n// or use one of the capture\n// controls above."}
              value={transcript}
              onChange={e => setTranscript(e.target.value)}
            />
            {/* Corner tag */}
            <div className="absolute top-2 right-2 text-[8px] font-mono text-white/10 uppercase tracking-widest pointer-events-none">
              {transcript.length > 0 ? 'ready' : 'empty'}
            </div>
          </div>
        </div>

        {/* ── WORD COUNT BAR ── */}
        <div className="px-4 pb-3 shrink-0">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[9px] font-mono text-white/20">{wordCount} words</span>
            {isRecording && <span className="flex items-center gap-1 text-[9px] font-mono text-red-400"><span className="size-1.5 rounded-full bg-red-400 animate-ping" />Recording</span>}
            {isFullCapturing && <span className="flex items-center gap-1 text-[9px] font-mono text-violet-400"><span className="size-1.5 rounded-full bg-violet-400 animate-ping" />Capturing</span>}
            {!isRecording && !isFullCapturing && <span className="text-[9px] font-mono text-white/10">{transcript.length > 20 ? '✓ ready' : 'min 20 chars'}</span>}
          </div>
          {/* Progress bar */}
          <div className="h-[2px] rounded-full bg-white/[0.05] overflow-hidden">
            <div className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${Math.min((wordCount / 200) * 100, 100)}%`,
                background: wordCount > 100
                  ? 'linear-gradient(90deg, #6366f1, #8b5cf6)'
                  : wordCount > 30
                  ? 'linear-gradient(90deg, #3b82f6, #6366f1)'
                  : 'linear-gradient(90deg, #475569, #3b82f6)',
              }}
            />
          </div>
        </div>

        {/* ── CONFIG GLASS CARD ── */}
        <div className="mx-4 mb-3 rounded-2xl border border-white/[0.07] shrink-0 relative"
          style={{ background: 'rgba(255,255,255,0.02)', backdropFilter: 'blur(12px)' }}>

          {/* Project Key */}
          <div className="flex items-center px-4 py-3 gap-3 border-b border-white/[0.05]">
            <div className="size-6 rounded-lg bg-white/[0.05] flex items-center justify-center shrink-0">
              <span className="text-[9px] font-black text-white/30">#</span>
            </div>
            <div className="flex-1">
              <div className="text-[8px] font-mono text-white/20 uppercase tracking-wider mb-0.5">Project Key</div>
              <input
                type="text"
                maxLength={10}
                placeholder="PROJ"
                className="bg-transparent text-xs font-mono font-black uppercase text-white/80 outline-none placeholder:text-white/15 w-full"
                value={jiraKey}
                onChange={e => setJiraKey(e.target.value.toUpperCase())}
              />
            </div>
            <div className="shrink-0 text-[9px] font-mono text-white/15 border border-white/[0.07] rounded-md px-1.5 py-0.5">
              {jiraKey || '—'}
            </div>
          </div>

          {/* Destination */}
          <div className="relative z-20 border-b border-white/[0.05]">
            <button
              onClick={() => setShowDestDropdown(!showDestDropdown)}
              className="w-full flex items-center px-4 py-3 gap-3 hover:bg-white/[0.03] transition-colors"
            >
              <div className={`size-6 rounded-lg flex items-center justify-center shrink-0 ${selectedDest.dot} bg-opacity-20`}
                style={{ background: `rgba(${selectedDest.id === 'jira' ? '59,130,246' : selectedDest.id === 'linear' ? '139,92,246' : '239,68,68'},0.15)` }}>
                <span className={`size-2 rounded-full ${selectedDest.dot}`}
                  style={{ boxShadow: `0 0 6px currentColor` }} />
              </div>
              <div className="flex-1 text-left">
                <div className="text-[8px] font-mono text-white/20 uppercase tracking-wider mb-0.5">Destination</div>
                <div className="text-xs font-black text-white/70 uppercase tracking-wide">{selectedDest.name}</div>
              </div>
              <Icons.chevronDown className={`size-3 text-white/20 transition-transform ${showDestDropdown ? 'rotate-180' : ''}`} />
            </button>
            {showDestDropdown && (
              <motion.div
                initial={{ opacity: 0, y: 4, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                className="absolute left-0 right-0 bottom-full mb-1 z-50 bg-[#141416] border border-white/10 rounded-xl shadow-2xl overflow-hidden"
              >
                {DESTINATIONS.map(d => (
                  <button key={d.id}
                    onClick={() => { if (d.status === 'connected') setDestination(d.id); else toast.info(`${d.name} coming soon.`); setShowDestDropdown(false); }}
                    className={`w-full flex items-center justify-between px-4 py-3 text-xs hover:bg-white/5 transition-colors ${destination === d.id ? 'text-white' : 'text-white/40'}`}
                  >
                    <span className="flex items-center gap-2.5">
                      <span className={`size-2 rounded-full ${d.dot}`} />
                      <span className="font-bold uppercase tracking-wide">{d.name}</span>
                    </span>
                    {d.status === 'connected' ? <CheckCircle2 className="size-3 text-emerald-500" /> : <span className="text-[9px] text-white/20">Soon</span>}
                  </button>
                ))}
              </motion.div>
            )}
          </div>

          {/* AI Model */}
          {(() => {
            const activeModel = MODELS.find(m => m.id === selectedModel) || MODELS[0];
            const glowMap: Record<string, string> = {
              gemini: '59,130,246', gpt4o: '52,211,153', claude: '251,191,36', llama: '167,139,250',
            };
            const glow = glowMap[selectedModel] || '255,255,255';
            return (
              <div className="relative z-30">
                <button
                  onClick={() => setShowModelDropdown(!showModelDropdown)}
                  className="w-full flex items-center px-4 py-3 gap-3 hover:bg-white/[0.03] transition-colors"
                >
                  <div className="size-6 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: `rgba(${glow},0.15)`, boxShadow: `0 0 12px rgba(${glow},0.2)` }}>
                    <span className={`size-2 rounded-full ${activeModel.dot} animate-pulse`}
                      style={{ boxShadow: `0 0 6px rgba(${glow},0.8)` }} />
                  </div>
                  <div className="flex-1 text-left">
                    <div className="text-[8px] font-mono text-white/20 uppercase tracking-wider mb-0.5">AI Model</div>
                    <div className={`text-xs font-black uppercase tracking-wide ${activeModel.color}`}
                      style={{ textShadow: `0 0 12px rgba(${glow},0.5)` }}>
                      {activeModel.name}
                    </div>
                  </div>
                  <span className="text-[8px] font-mono text-white/20 bg-white/[0.04] border border-white/[0.07] rounded-md px-1.5 py-0.5">{activeModel.provider}</span>
                  <Icons.chevronDown className={`size-3 text-white/20 transition-transform ${showModelDropdown ? 'rotate-180' : ''}`} />
                </button>
                {showModelDropdown && (
                  <motion.div
                    initial={{ opacity: 0, y: 4, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    className="absolute left-0 right-0 bottom-full mb-1 z-50 bg-[#141416] border border-white/10 rounded-xl shadow-2xl overflow-hidden"
                  >
                    {MODELS.map(m => {
                      const mg = glowMap[m.id] || '255,255,255';
                      return (
                        <button key={m.id}
                          onClick={() => { if (m.status === 'active') setSelectedModel(m.id); else toast.info(`${m.name} coming soon.`); setShowModelDropdown(false); }}
                          className={`w-full flex items-center gap-3 px-4 py-3 text-xs hover:bg-white/5 transition-colors ${selectedModel === m.id ? 'bg-white/[0.04]' : ''}`}
                        >
                          <span className={`size-2 rounded-full ${m.dot} ${selectedModel === m.id ? 'animate-pulse' : 'opacity-40'}`}
                            style={selectedModel === m.id ? { boxShadow: `0 0 8px rgba(${mg},0.8)` } : {}} />
                          <span className="flex-1 text-left">
                            <span className={`block font-bold uppercase tracking-wide ${selectedModel === m.id ? m.color : 'text-white/40'}`}>{m.name}</span>
                            <span className="text-[9px] text-white/20 normal-case tracking-normal font-normal">{m.provider}</span>
                          </span>
                          {m.status === 'active'
                            ? selectedModel === m.id && <CheckCircle2 className="size-3.5 text-emerald-400" />
                            : <span className="text-[9px] text-white/15">Soon</span>}
                        </button>
                      );
                    })}
                  </motion.div>
                )}
              </div>
            );
          })()}
        </div>

        {/* ── PROCESS BUTTON ── */}
        <div className="px-4 pb-5 shrink-0">
          <button
            onClick={handleGenerate}
            disabled={isLoading || transcript.length < 20}
            className="relative w-full flex items-center justify-center gap-2.5 py-4 rounded-2xl font-black text-[11px] uppercase tracking-[0.15em] overflow-hidden transition-all disabled:opacity-30 disabled:cursor-not-allowed group"
            style={{
              background: isLoading
                ? 'linear-gradient(135deg, #18181b, #27272a)'
                : 'linear-gradient(135deg, #ffffff 0%, #c7f0df 45%, #e8d9ff 100%)',
              color: isLoading ? 'rgba(255,255,255,0.3)' : '#09090b',
              boxShadow: isLoading
                ? 'none'
                : '0 0 40px rgba(255,255,255,0.12), 0 0 80px rgba(99,102,241,0.1), 0 4px 24px rgba(0,0,0,0.5)',
            }}
          >
            {/* Shimmer */}
            {!isLoading && (
              <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
            )}
            {/* Glow ring on hover */}
            {!isLoading && (
              <span className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ boxShadow: 'inset 0 0 20px rgba(99,102,241,0.15)' }} />
            )}
            {isLoading
              ? <><Icons.spinner className="size-3.5 animate-spin" /> Processing agents...</>
              : <><Icons.sparkles className="size-3.5" /> Process with Flowy</>
            }
          </button>
        </div>
      </div>

      {/* ZONE 3 — TABBED OUTPUT PANEL */}
      <div ref={outputLedgerRef} className="flex-1 overflow-hidden bg-[#080808] flex flex-col relative">
        {/* Ambient glow */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-indigo-500/[0.03] rounded-full blur-3xl" />
          <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-emerald-500/[0.02] rounded-full blur-3xl" />
        </div>

        {/* Empty state */}
        {!output && !isLoading && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center h-full text-center p-12 space-y-8"
          >
            <div className="relative">
              <div className="size-20 rounded-3xl border border-white/[0.07] bg-white/[0.02] flex items-center justify-center backdrop-blur-sm">
                <Waves className="size-8 text-white/15" />
              </div>
              <div className="absolute inset-0 rounded-3xl bg-gradient-to-b from-white/5 to-transparent" />
            </div>
            <div className="space-y-3">
              <h3 className="text-3xl font-black tracking-tighter bg-gradient-to-r from-white/30 to-white/10 bg-clip-text text-transparent uppercase">Awaiting Input</h3>
              <p className="text-sm text-white/15 max-w-sm leading-relaxed">
                Paste a transcript or record your meeting, then click{' '}
                <strong className="text-white/30">Process with Flowy</strong>.
              </p>
            </div>
            <div className="flex gap-3">
              {['Summary', 'Tickets', 'PRD', 'Slack'].map((m, i) => (
                <motion.div
                  key={m}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.1 }}
                  className="border border-white/[0.05] rounded-xl px-4 py-2.5 text-center bg-white/[0.01]">
                  <span className="text-[9px] font-mono text-white/15 uppercase tracking-widest block mb-0.5">0{i+1}</span>
                  <span className="text-[10px] text-white/20 font-bold">{m}</span>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Loading — CRAZY ORBITAL ANIMATION */}
        {isLoading && (
          <div className="flex h-full relative overflow-hidden">
            {/* Animated scan grid background */}
            <div className="absolute inset-0 pointer-events-none"
              style={{
                background: 'radial-gradient(ellipse 80% 60% at 60% 50%, rgba(16,185,129,0.05) 0%, transparent 70%)',
              }}
            />
            {/* Horizontal scan lines */}
            <motion.div
              animate={{ y: ['-100%', '200%'] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'linear', repeatDelay: 1 }}
              className="absolute inset-x-0 h-px bg-gradient-to-r from-transparent via-emerald-400/30 to-transparent pointer-events-none z-10"
            />

            {/* Left — Orbital Core */}
            <div className="w-[45%] flex flex-col items-center justify-center shrink-0 py-16">
              {/* Label */}
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2 mb-10"
              >
                <motion.span
                  animate={{ opacity: [0.4, 1, 0.4] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                  className="size-1.5 rounded-full bg-emerald-400"
                />
                <span className="text-[8px] font-mono text-emerald-500/50 tracking-[0.5em] uppercase">Executing</span>
              </motion.div>

              {/* Orbital ring system */}
              <div className="relative flex items-center justify-center" style={{ width: 160, height: 160 }}>
                {/* Outer ring */}
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 7, repeat: Infinity, ease: 'linear' }}
                  className="absolute rounded-full"
                  style={{
                    width: 160, height: 160,
                    border: '1px solid transparent',
                    borderTopColor: 'rgba(52,211,153,0.7)',
                    borderRightColor: 'rgba(52,211,153,0.2)',
                    boxShadow: '0 0 20px rgba(52,211,153,0.15)',
                  }}
                />
                {/* Middle ring */}
                <motion.div
                  animate={{ rotate: -360 }}
                  transition={{ duration: 4.5, repeat: Infinity, ease: 'linear' }}
                  className="absolute rounded-full"
                  style={{
                    width: 118, height: 118,
                    border: '1px solid transparent',
                    borderBottomColor: 'rgba(139,92,246,0.7)',
                    borderLeftColor: 'rgba(139,92,246,0.2)',
                    boxShadow: '0 0 16px rgba(139,92,246,0.15)',
                  }}
                />
                {/* Inner ring */}
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 2.8, repeat: Infinity, ease: 'linear' }}
                  className="absolute rounded-full"
                  style={{
                    width: 76, height: 76,
                    border: '1px solid transparent',
                    borderTopColor: 'rgba(99,102,241,0.7)',
                    borderRightColor: 'rgba(99,102,241,0.2)',
                    boxShadow: '0 0 12px rgba(99,102,241,0.2)',
                  }}
                />
                {/* Orbiting dot (outer) */}
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 7, repeat: Infinity, ease: 'linear' }}
                  className="absolute"
                  style={{ width: 160, height: 160 }}
                >
                  <span className="absolute size-2.5 rounded-full bg-emerald-400 -top-[5px] left-1/2 -translate-x-1/2"
                    style={{ boxShadow: '0 0 10px rgba(52,211,153,0.9)' }} />
                </motion.div>
                {/* Orbiting dot (middle) */}
                <motion.div
                  animate={{ rotate: -360 }}
                  transition={{ duration: 4.5, repeat: Infinity, ease: 'linear' }}
                  className="absolute"
                  style={{ width: 118, height: 118 }}
                >
                  <span className="absolute size-2 rounded-full bg-violet-400 bottom-[-4px] left-1/2 -translate-x-1/2"
                    style={{ boxShadow: '0 0 8px rgba(139,92,246,0.9)' }} />
                </motion.div>
                {/* Core pulse */}
                <motion.div
                  animate={{ scale: [0.8, 1.2, 0.8], opacity: [0.6, 1, 0.6] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                  className="size-8 rounded-full bg-emerald-400 z-10"
                  style={{ boxShadow: '0 0 30px rgba(52,211,153,0.9), 0 0 60px rgba(52,211,153,0.4)' }}
                />
                {/* Secondary core ring */}
                <motion.div
                  animate={{ scale: [1, 2.5], opacity: [0.4, 0] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'easeOut' }}
                  className="absolute size-8 rounded-full bg-emerald-400/30 z-10"
                />
              </div>

              {/* Agent count */}
              <motion.div
                animate={{ opacity: [0.3, 0.8, 0.3] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="mt-10 text-[9px] font-mono text-white/20 tracking-[0.3em] uppercase"
              >
                {agentLogs.length} / 4 agents
              </motion.div>
            </div>

            {/* Right — Log Cards */}
            <div className="flex-1 flex flex-col justify-center py-8 pr-10 gap-2.5 border-l border-white/[0.04] overflow-hidden">
              <div className="text-[8px] font-mono text-white/15 tracking-[0.4em] uppercase mb-3 pl-1">// agent trace</div>
              <AnimatePresence>
                {agentLogs.map((log, i) => {
                  const isActive = i === agentLogs.length - 1;
                  return (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: 60, filter: 'blur(8px)', scale: 0.95 }}
                      animate={{ opacity: 1, x: 0, filter: 'blur(0px)', scale: 1 }}
                      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                      className="flex items-center gap-3 px-4 py-3 rounded-xl border transition-all"
                      style={isActive ? {
                        borderColor: 'rgba(52,211,153,0.25)',
                        background: 'rgba(52,211,153,0.04)',
                        boxShadow: '0 0 20px rgba(52,211,153,0.08)',
                      } : {
                        borderColor: 'rgba(255,255,255,0.04)',
                        background: 'rgba(255,255,255,0.01)',
                      }}
                    >
                      {/* Step index */}
                      <span className="text-[9px] font-mono text-white/10 tabular-nums w-4 shrink-0">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      {/* Status dot */}
                      {isActive ? (
                        <motion.span
                          animate={{ opacity: [0.4, 1, 0.4], scale: [0.8, 1.2, 0.8] }}
                          transition={{ duration: 0.8, repeat: Infinity }}
                          className="size-1.5 rounded-full bg-emerald-400 shrink-0"
                          style={{ boxShadow: '0 0 6px rgba(52,211,153,0.8)' }}
                        />
                      ) : (
                        <span className="size-1.5 rounded-full bg-white/10 shrink-0" />
                      )}
                      {/* Log text */}
                      <span className={`font-mono text-[11px] flex-1 ${isActive ? 'text-emerald-300' : 'text-white/25'}`}>
                        {log}
                      </span>
                      {/* Active spinner */}
                      {isActive && (
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                          className="size-3 rounded-full border border-emerald-400/30 border-t-emerald-400 shrink-0"
                        />
                      )}
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          </div>
        )}

        {/* Tabbed Output */}
        {output && !isLoading && (
          <div className="flex flex-col h-full">

            {/* Tab Bar */}
            <div className="flex items-center border-b border-white/[0.07] bg-black/30 backdrop-blur-sm shrink-0 px-2 pt-1 relative">
              {[
                { id: 'summary', label: 'Summary',  index: '01', color: 'from-blue-400 to-indigo-400' },
                { id: 'tickets', label: `Tickets (${output.tickets.length})`, index: '02', color: 'from-amber-400 to-orange-400' },
                { id: 'prd',     label: 'PRD',      index: '03', color: 'from-violet-400 to-purple-400' },
                { id: 'slack',   label: 'Slack',    index: '04', color: 'from-emerald-400 to-teal-400' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`relative flex items-center gap-2 px-5 py-3.5 text-[10px] font-black uppercase tracking-widest transition-all group ${
                    activeTab === tab.id ? 'text-white' : 'text-white/25 hover:text-white/60'
                  }`}
                >
                  <span className="text-[8px] font-mono opacity-30 tabular-nums">{tab.index}</span>
                  {tab.label}
                  {/* Active underline with glow */}
                  {activeTab === tab.id && (
                    <motion.span
                      layoutId="tab-underline"
                      className={`absolute bottom-0 inset-x-2 h-[2px] rounded-full bg-gradient-to-r ${tab.color}`}
                      style={{ boxShadow: `0 0 8px currentColor` }}
                    />
                  )}
                  {/* Hover bg */}
                  <span className="absolute inset-0 rounded-t-lg bg-white/0 group-hover:bg-white/[0.03] transition-colors" />
                </button>
              ))}

              {/* Right meta */}
              <div className="ml-auto flex items-center gap-4 px-4 text-[9px] font-mono text-white/20">
                {pipelineMs && (
                  <span className="flex items-center gap-1.5">
                    <span className="size-1 rounded-full bg-emerald-400 animate-pulse" />
                    <span>Pipeline <span className="text-emerald-400">{(pipelineMs / 1000).toFixed(1)}s</span></span>
                  </span>
                )}
                {output.jira_links?.length > 0 && output.jira_links.slice(0,3).map((link, i) => (
                  <a key={i} href={link} target="_blank" rel="noreferrer"
                    className="text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full hover:bg-emerald-500/10 hover:border-emerald-400/40 transition-all">
                    {link.split('/').pop()} ↗
                  </a>
                ))}
                <button onClick={handleGenerate} disabled={isLoading}
                  className="flex items-center gap-1.5 text-white/20 hover:text-white/60 transition-colors disabled:opacity-20 border border-white/10 hover:border-white/25 rounded-lg px-2.5 py-1">
                  <RefreshCw className="size-2.5" /> Re-run
                </button>
              </div>
            </div>

            {/* Tab Content */}
            <div ref={tabScrollRef} className="flex-1 overflow-y-auto">
              <AnimatePresence mode="wait">

                {/* [01] Summary */}
                {activeTab === 'summary' && (
                  <motion.div key="summary"
                    initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.25, ease: 'easeOut' }}
                    className="min-h-full flex flex-col"
                  >
                    <div className="p-8 max-w-3xl mx-auto w-full">
                      {/* Section header */}
                      <div className="flex items-center gap-3 mb-6">
                        <div className="h-5 w-[3px] rounded-full bg-gradient-to-b from-blue-400 to-indigo-500" />
                        <span className="text-[9px] font-mono text-white/30 tracking-[0.3em] uppercase">Executive Summary</span>
                      </div>
                      <p className="text-[15px] text-white/65 leading-[1.9] whitespace-pre-wrap font-medium tracking-wide">{output.meeting_summary}</p>
                    </div>
                    <div className="sticky bottom-0 border-t border-white/[0.05] bg-[#080808]/90 backdrop-blur-md px-8 py-4 max-w-3xl mx-auto w-full">
                      <ReflectionBar
                        onSend={msg => handleChat('summary', msg)}
                        isLoading={isChatLoading}
                        placeholder="Ask Flowy to refine this summary..."
                        model={selectedModel}
                        onModelChange={setSelectedModel}
                      />
                    </div>
                  </motion.div>
                )}

                {/* [02] Tickets */}
                {activeTab === 'tickets' && (
                  <motion.div key="tickets"
                    initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.25, ease: 'easeOut' }}
                    className="p-6"
                  >
                    {/* Header */}
                    <div className="flex items-center gap-3 mb-5">
                      <div className="h-5 w-[3px] rounded-full bg-gradient-to-b from-amber-400 to-orange-500" />
                      <span className="text-[9px] font-mono text-white/30 tracking-[0.3em] uppercase">{output.tickets.length} Tickets Created</span>
                    </div>
                    {output.jira_error && (
                      <div className="flex items-center gap-2 text-red-400 text-xs font-mono border border-red-500/20 rounded-xl px-3 py-2 bg-red-500/5 mb-4">
                        <AlertCircle className="size-3.5 shrink-0" /> {output.jira_error}
                      </div>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                      {output.tickets.map((t, idx) => {
                        const borderGlow = t.priority === 'High'
                          ? 'border-red-500/20 hover:border-red-500/40 hover:shadow-[0_0_20px_rgba(239,68,68,0.08)]'
                          : t.priority === 'Medium'
                          ? 'border-amber-500/20 hover:border-amber-500/40 hover:shadow-[0_0_20px_rgba(245,158,11,0.08)]'
                          : 'border-white/8 hover:border-white/15';
                        const leftBar = t.priority === 'High' ? 'bg-red-500' : t.priority === 'Medium' ? 'bg-amber-400' : 'bg-white/20';
                        return (
                          <motion.div
                            key={t.ticket_id}
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.05, duration: 0.3 }}
                            className={`relative border rounded-2xl p-5 bg-white/[0.01] transition-all duration-300 group overflow-hidden ${borderGlow}`}
                          >
                            {/* Priority left bar */}
                            <div className={`absolute left-0 top-4 bottom-4 w-[2px] rounded-full ${leftBar}`} />
                            <div className="flex items-center gap-2 mb-3 pl-2">
                              <span className={`text-[9px] font-mono border px-2 py-0.5 rounded-full ${PRIORITY_STYLE[t.priority] || PRIORITY_STYLE.Low}`}>
                                {t.issue_type}
                              </span>
                              <span className={`text-[9px] font-mono ${
                                t.priority === 'High' ? 'text-red-400' : t.priority === 'Medium' ? 'text-amber-400' : 'text-white/30'
                              }`}>{t.priority}</span>
                              {t.jira_url && (
                                <a href={t.jira_url} target="_blank" rel="noreferrer"
                                  className="ml-auto text-[9px] font-mono text-white/20 hover:text-emerald-400 opacity-0 group-hover:opacity-100 transition-all">
                                  {t.jira_key} ↗
                                </a>
                              )}
                            </div>
                            <h4 className="text-sm font-black text-white/80 leading-tight mb-2 pl-2">{t.summary}</h4>
                            <p className="text-[11px] text-white/30 leading-relaxed line-clamp-3 pl-2">{t.description}</p>
                            <div className="mt-4 pt-3 border-t border-white/[0.05] text-[9px] font-mono text-white/20 pl-2 flex items-center gap-2">
                              <span className="size-1.5 rounded-full bg-white/10" />
                              {t.assignee}
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  </motion.div>
                )}

                {/* [03] PRD */}
                {activeTab === 'prd' && (
                  <motion.div key="prd"
                    initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.25, ease: 'easeOut' }}
                    className="min-h-full flex flex-col"
                  >
                    {output.prd_draft ? (
                      <>
                        <div className="p-8 max-w-3xl mx-auto w-full">
                          <div className="flex items-center gap-3 mb-6">
                            <div className="h-5 w-[3px] rounded-full bg-gradient-to-b from-violet-400 to-purple-600" />
                            <span className="text-[9px] font-mono text-white/30 tracking-[0.3em] uppercase">Product Requirements Document</span>
                          </div>
                          <div className="text-[14px] text-white/55 leading-[1.9] whitespace-pre-wrap tracking-wide">{output.prd_draft}</div>
                        </div>
                        <div className="sticky bottom-0 border-t border-white/[0.05] bg-[#080808]/90 backdrop-blur-md px-8 py-4 max-w-3xl mx-auto w-full">
                          <ReflectionBar
                            onSend={msg => handleChat('prd', msg)}
                            isLoading={isChatLoading}
                            placeholder="Refine this PRD with an instruction..."
                            model={selectedModel}
                            onModelChange={setSelectedModel}
                          />
                        </div>
                      </>
                    ) : (
                      <div className="flex-1 flex items-center justify-center text-sm text-white/15">No PRD was generated.</div>
                    )}
                  </motion.div>
                )}

                {/* [04] Slack */}
                {activeTab === 'slack' && (
                  <motion.div key="slack"
                    initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.25, ease: 'easeOut' }}
                    className="min-h-full flex flex-col"
                  >
                    {output.slack_update ? (
                      <>
                        <div className="flex items-center justify-between px-8 py-5 border-b border-white/[0.05]">
                          <div>
                            <div className="flex items-center gap-3 mb-1">
                              <div className="h-4 w-[2px] rounded-full bg-gradient-to-b from-emerald-400 to-teal-500" />
                              <span className="text-[9px] font-mono text-white/30 tracking-[0.3em] uppercase">Slack Dispatch</span>
                            </div>
                            <span className="text-xs text-white/25">Preview → <span className="text-white/50">#product-updates</span></span>
                          </div>
                          <button
                            onClick={async () => { setIsSlackSending(true); try { await sendSlackMessage(output.slack_update); toast.success('Posted to Slack!'); } catch (e: any) { toast.error(e.message); } finally { setIsSlackSending(false); } }}
                            disabled={isSlackSending}
                            className="flex items-center gap-2 text-xs font-black uppercase tracking-widest px-5 py-2.5 rounded-xl transition-all disabled:opacity-30"
                            style={{
                              background: 'linear-gradient(135deg, rgba(52,211,153,0.15), rgba(20,184,166,0.15))',
                              border: '1px solid rgba(52,211,153,0.3)',
                              color: '#6ee7b7',
                              boxShadow: '0 0 20px rgba(52,211,153,0.1)',
                            }}
                          >
                            {isSlackSending ? <Icons.spinner className="size-3 animate-spin" /> : <Send className="size-3" />}
                            Push Live
                          </button>
                        </div>
                        <div className="flex-1 px-8 py-6">
                          <div className="relative bg-gradient-to-b from-[#0d1117] to-[#090d13] rounded-2xl p-6 border border-emerald-500/10">
                            {/* Terminal dots */}
                            <div className="flex gap-1.5 mb-4">
                              <span className="size-2 rounded-full bg-red-500/50" />
                              <span className="size-2 rounded-full bg-amber-500/50" />
                              <span className="size-2 rounded-full bg-emerald-500/50" />
                              <span className="ml-3 text-[9px] font-mono text-white/15">#product-updates</span>
                            </div>
                            <div className="font-mono text-sm text-emerald-300/70 whitespace-pre-wrap leading-relaxed">
                              {output.slack_update}
                            </div>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="flex-1 flex items-center justify-center text-sm text-white/15">No Slack update was generated.</div>
                    )}
                  </motion.div>
                )}

              </AnimatePresence>
            </div>
          </div>
        )}
      </div>


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
