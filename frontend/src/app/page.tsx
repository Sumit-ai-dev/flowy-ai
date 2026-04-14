"use client";

import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowRight, Waves, Mic, FileText, GitBranch,
  CheckCircle2, TerminalSquare, Activity, ChevronDown
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

const G = "#00E676";

/* ── INTERACTIVE EFFECTS (Obsidian Assembly Style) ────────────────────────── */
function Reveal({ children, delay = 0, y = 30, className = "" }: { children: React.ReactNode, delay?: number, y?: number, className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y, scale: 0.98 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, margin: "-100px" }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function SpotlightCard({ children, className = "" }: { children: React.ReactNode, className?: string }) {
  const divRef = React.useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [opacity, setOpacity] = useState(0);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!divRef.current) return;
    const rect = divRef.current.getBoundingClientRect();
    setPosition({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  return (
    <div
      ref={divRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setOpacity(1)}
      onMouseLeave={() => setOpacity(0)}
      className={cn(
        "relative overflow-hidden group transition-all duration-500",
        "bg-white/[0.03] backdrop-blur-3xl border border-white/10 hover:border-white/20",
        className
      )}
    >
      <div
        className="pointer-events-none absolute -inset-px transition-opacity duration-300 z-0"
        style={{
          opacity,
          background: `radial-gradient(600px circle at ${position.x}px ${position.y}px, rgba(0,230,118,0.15), transparent 40%)`,
        }}
      />
      <div className="relative z-10">{children}</div>
    </div>
  );
}

/* ── step counter — pure CSS ──────────────────────────────────────────────── */
function Counter({ to, suffix = "" }: { to: number; suffix?: string }) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    const dur = 2000;
    const start = Date.now();
    const id = setInterval(() => {
      const p = Math.min((Date.now() - start) / dur, 1);
      setVal(Math.round((1 - Math.pow(1 - p, 3)) * to));
      if (p >= 1) clearInterval(id);
    }, 16);
    return () => clearInterval(id);
  }, [to]);
  return <>{val}{suffix}</>;
}

/* ── WAVE bars ────────────────────────────────────────────────────────────── */
const WAVE = [35,55,72,45,88,62,40,78,53,66,43,91,58,74,47,83,61,38,76,52,85,44,69,57,80,41,64,73];

/* ── PIPELINE STEPS ───────────────────────────────────────────────────────── */
const STEPS = [
  {
    n: "01", title: "Capture Audio", icon: Mic,
    desc: "Browser dual-stream mixing — mic and system audio simultaneously via Web Audio API. No plugin, no bot.",
    panel: () => (
      <div className="w-full h-full flex flex-col items-center justify-center gap-6 px-10">
        <div className="flex items-center gap-2">
          <span className="size-2.5 rounded-full bg-red-400 animate-pulse" />
          <span className="text-xs text-white/50 font-mono font-bold tracking-widest uppercase">Recording</span>
        </div>
        <div className="flex items-center gap-[3px] h-20 w-full">
          {WAVE.map((h, i) => (
            <div key={i} className="flex-1 rounded-full bg-white/40" style={{
              height: `${h * 0.6}%`,
              animation: `wavePulse ${0.9 + (i % 5) * 0.15}s ease-in-out infinite`,
              animationDelay: `${i * 0.035}s`,
            }} />
          ))}
        </div>
        <span className="text-white/30 font-mono text-sm">00:02:34 / 01:00:00</span>
      </div>
    ),
  },
  {
    n: "02", title: "Whisper Transcription", icon: TerminalSquare,
    desc: "Audio blob POST'd to FastAPI. OpenAI Whisper-1 returns a punctuated transcript in under 10 seconds.",
    panel: () => (
      <div className="w-full h-full flex flex-col justify-center px-8 font-mono text-sm space-y-3">
        <div className="text-white/25 text-xs uppercase tracking-widest mb-3 font-bold">transcript_output.txt</div>
        {["Alright so the main blocker is the OAuth flow...", "We need tickets for both frontend and backend.", "Let Sarah own the PRD, Dev takes the tickets.", "Target: ship by end of sprint. No exceptions."].map((l, i) => (
          <div key={i} className="text-white/70 leading-relaxed border-l-2 border-white/10 pl-3">{l}</div>
        ))}
        <span className="inline-block w-2 h-4 bg-white/60 ml-1 animate-pulse" />
      </div>
    ),
  },
  {
    n: "03", title: "Multi-Agent Dispatch", icon: GitBranch,
    desc: "Supervisor fans out to 4 sub-agents simultaneously via asyncio — Summary, PRD, Jira, Slack. ~1.1s total.",
    panel: () => (
      <div className="w-full h-full flex flex-col items-center justify-center gap-5 px-8">
        <div className="px-5 py-2.5 rounded-full border border-white/20 bg-white/8 text-white text-sm font-bold">
          Supervisor Agent
        </div>
        <div className="flex items-start gap-4 w-full justify-center">
          {["Summary","PRD Draft","Jira Tickets","Slack Post"].map((a, i) => (
            <div key={i} className="flex flex-col items-center gap-2">
              <div className="w-px h-8 bg-white/15" />
              <div className="px-3 py-2 rounded-xl border border-white/10 bg-white/[0.04] text-white/70 text-xs font-semibold text-center whitespace-nowrap">{a}</div>
              <span className="text-[11px] font-bold" style={{ color: G }}>✓</span>
            </div>
          ))}
        </div>
        <span className="text-xs text-white/30 font-mono">Total dispatch: 1.1s</span>
      </div>
    ),
  },
  {
    n: "04", title: "Ship to Your Stack", icon: CheckCircle2,
    desc: "Jira issues created via REST, PRD saved to memory, Slack message fires via Incoming Webhook.",
    panel: () => (
      <div className="w-full h-full flex flex-col justify-center gap-4 px-8">
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-white/40 font-mono text-xs">PROJ-143 created</span>
            <span className="text-[11px] font-bold px-2 py-1 rounded-full border" style={{ borderColor: G, color: G }}>✓ Live</span>
          </div>
          <div className="text-white font-bold text-sm mb-2">Implement OAuth 2.0 — frontend + backend</div>
          <div className="flex gap-2">
            {["Story","P1","Sarah"].map(t => <span key={t} className="text-[10px] bg-white/6 text-white/40 px-2 py-0.5 rounded-full">{t}</span>)}
          </div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 flex gap-3 items-start">
          <div className="size-8 rounded-lg bg-[#4A154B] flex items-center justify-center text-white text-xs font-black flex-shrink-0">S</div>
          <div>
            <div className="text-white/60 text-xs font-bold mb-0.5">#product-updates</div>
            <div className="text-white/50 text-xs leading-relaxed">Sprint update dispatched · 2 tickets created · PRD ready</div>
          </div>
        </div>
      </div>
    ),
  },
];

function InteractiveHeroBackdrop() {
  const [m, setM] = useState({ x: 0, y: 0 });
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    setIsReady(true);
    const handleMove = (e: MouseEvent) => {
      setM({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener("mousemove", handleMove);
    return () => window.removeEventListener("mousemove", handleMove);
  }, []);

  if (!isReady) return <div className="absolute inset-0 bg-[#060606]" />;

  return (
    <div className="absolute inset-0 bg-[#060606] overflow-hidden">
      {/* ── BASE GENERATED IMAGE ─────────────────────────────────────── */}
      <motion.div
        className="absolute inset-0 opacity-40 bg-cover bg-center"
        style={{ backgroundImage: "url('/aesthetic-hero-bg.png')" }}
        animate={{ scale: [1, 1.05, 1] }}
        transition={{ duration: 40, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* ── AMBIENT GLOW BLOBS ────────────────────────────────────────── */}
      <motion.div
        className="absolute w-[60vw] h-[60vw] rounded-full blur-[120px] opacity-15 pointer-events-none"
        animate={{
          x: m.x * 0.05,
          y: m.y * 0.05,
          scale: [1, 1.1, 1],
        }}
        transition={{ scale: { duration: 10, repeat: Infinity, ease: "easeInOut" } }}
        style={{
          background: "radial-gradient(circle, rgba(0,230,118,0.4) 0%, transparent 70%)",
          left: "10%",
          top: "10%",
        }}
      />
      <motion.div
        className="absolute w-[50vw] h-[50vw] rounded-full blur-[100px] opacity-15 pointer-events-none"
        animate={{
          x: m.x * -0.03,
          y: m.y * -0.03,
          scale: [1, 1.2, 1],
        }}
        transition={{ scale: { duration: 15, repeat: Infinity, ease: "easeInOut" } }}
        style={{
          background: "radial-gradient(circle, rgba(147,51,234,0.4) 0%, transparent 70%)",
          right: "15%",
          bottom: "10%",
        }}
      />
      <motion.div
        className="absolute w-[40vw] h-[40vw] rounded-full blur-[90px] opacity-10 pointer-events-none"
        animate={{
          x: m.x * 0.02,
          y: m.y * -0.04,
        }}
        style={{
          background: "radial-gradient(circle, rgba(56,189,248,0.4) 0%, transparent 70%)",
          left: "40%",
          top: "30%",
        }}
      />

      {/* ── TECHNICAL OVERLAY ─────────────────────────────────────────── */}
      <div className="absolute inset-0 bg-noise opacity-[0.03] mix-blend-overlay pointer-events-none" />
      <div className="absolute inset-0 pointer-events-none" style={{
        backgroundImage: "linear-gradient(to right,rgba(255,255,255,0.015) 1px,transparent 1px),linear-gradient(to bottom,rgba(255,255,255,0.015) 1px,transparent 1px)",
        backgroundSize: "4rem 4rem"
      }} />

      {/* ── SCANLINE ──────────────────────────────────────────────────── */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="w-full h-[1px] bg-white/[0.03] absolute top-0" style={{ animation: "scanline 8s linear infinite" }} />
      </div>

      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#060606]/40 to-[#060606]" />
    </div>
  );
}


function PipelineSection() {
  const [active, setActive] = useState(0);
  const [progress, setProgress] = useState(0);
  const D = 4500;

  useEffect(() => {
    setProgress(0);
    const t0 = Date.now();
    const id = setInterval(() => {
      const pct = Math.min(((Date.now() - t0) / D) * 100, 100);
      setProgress(pct);
      if (pct >= 100) { setActive(a => (a + 1) % STEPS.length); clearInterval(id); }
    }, 30);
    return () => clearInterval(id);
  }, [active]);

  const step = STEPS[active];
  const Panel = step.panel;

  return (
    <section className="relative z-10 py-28 px-6 md:px-12 border-b border-white/5 bg-transparent">
      <div className="max-w-7xl mx-auto">
        <div className="mb-14">
          <p className="text-[11px] font-bold tracking-[0.2em] uppercase mb-4" style={{ color: G }}>The Pipeline</p>
          <h2 className="text-4xl md:text-5xl font-black tracking-tighter text-white leading-[0.92]">
            Audio to Jira<br/>in 4 steps.
          </h2>
        </div>
        <div className="grid lg:grid-cols-[1fr_1.4fr] gap-4 items-stretch">
          {/* Step tabs */}
          <div className="flex flex-col gap-3">
            {STEPS.map((s, i) => {
              const isActive = i === active;
              return (
                <button key={i} onClick={() => setActive(i)}
                  className={cn(
                    "text-left rounded-2xl border p-5 transition-all duration-300 relative overflow-hidden",
                    isActive ? "border-white/15 bg-white/[0.04]" : "border-white/5 hover:border-white/10"
                  )}
                >
                  {isActive && (
                    <div className="absolute bottom-0 left-0 h-[2px] rounded-full"
                      style={{ width: `${progress}%`, backgroundColor: G, transition: "width 0.05s linear" }}
                    />
                  )}
                  <div className="flex items-start gap-4">
                    <div className={cn(
                      "flex-shrink-0 size-10 rounded-xl flex items-center justify-center text-xs font-black font-mono transition-all",
                      isActive ? "bg-white/10 text-white border border-white/15" : "text-white/25 border border-white/6"
                    )}>{s.n}</div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <s.icon className={cn("size-4 transition-colors", isActive ? "text-white/70" : "text-white/20")} />
                        <h4 className={cn("text-sm font-bold", isActive ? "text-white" : "text-white/40")}>{s.title}</h4>
                      </div>
                      {isActive && <p className="text-xs text-white/40 leading-relaxed">{s.desc}</p>}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
          {/* Visual panel */}
          <div className="rounded-3xl border border-white/8 bg-white/[0.02] overflow-hidden min-h-[360px] relative">
            <div className="absolute top-4 right-4 text-[11px] font-bold text-white/20 font-mono">{step.n} / 04</div>
            <div className="absolute inset-0">
              <Panel />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
function SectionBackdrop() {
  return (
    <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden select-none">
      {/* ── AMBIENT MOOD ────────────────────────────────────────────────── */}
      <div className="absolute top-[10%] left-[-10%] w-[70vw] h-[70vw] rounded-full bg-emerald-500/5 blur-[120px] animate-aurora" />
      <div className="absolute top-[40%] right-[-10%] w-[60vw] h-[60vw] rounded-full bg-indigo-500/5 blur-[120px] animate-aurora" style={{ animationDelay: "-5s" }} />
      <div className="absolute bottom-[10%] left-[10%] w-[80vw] h-[80vw] rounded-full bg-purple-500/5 blur-[150px] animate-aurora" style={{ animationDelay: "-10s" }} />

      {/* ── NEURAL MESH (Dots) ─────────────────────────────────────────── */}
      <div className="absolute inset-0 opacity-[0.15]" style={{
        backgroundImage: `radial-gradient(circle at 1px 1px, rgba(255,255,255,0.05) 1px, transparent 0)`,
        backgroundSize: '40px 40px'
      }} />

      {/* ── NOISE / TEXTURE ────────────────────────────────────────────── */}
      <div className="absolute inset-0 bg-noise opacity-[0.02]" />
    </div>
  );
}

export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 60);
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  return (
    <main className="bg-[#0A0A0A] text-white overflow-x-hidden font-sans selection:bg-white/20 relative">
      <SectionBackdrop />
      {/* ── GLOBAL FILM GRAIN (Obsidian Style) ───────────────────────── */}
      <div className="pointer-events-none fixed inset-0 z-[100] opacity-[0.04] mix-blend-overlay"
        style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E\")" }}
      />

      <style>{`
        * { cursor: auto !important; }
        button, a, [role="button"] { cursor: pointer !important; }
        @keyframes wavePulse {
          0%,100% { transform: scaleY(0.3); }
          50%      { transform: scaleY(1); }
        }
        @keyframes ticker {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>

      {/* ── NAV (fixed) ──────────────────────────────────────────────────── */}
      <nav className={cn(
        "fixed top-0 w-full z-50 px-8 py-4 flex justify-between items-center transition-all duration-300",
        scrolled ? "bg-black/80 backdrop-blur-2xl border-b border-white/6" : ""
      )}>
        <div className="flex items-center gap-2.5 text-base font-black tracking-tighter text-white">
          <div className="size-7 rounded-full bg-white flex items-center justify-center">
            <Waves className="size-3.5 text-black" />
          </div>
          FLOWY
        </div>
        <Link href="/dashboard/overview">
          <button className="text-sm font-bold px-5 py-2 rounded-full border border-white/15 text-white hover:bg-white hover:text-black transition-all duration-300">
            Launch Platform
          </button>
        </Link>
      </nav>

      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <section className="relative min-h-screen flex flex-col items-center justify-center px-4 overflow-hidden">
        <InteractiveHeroBackdrop />

        <div className="relative z-10 max-w-5xl mx-auto text-center w-full flex flex-col items-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 mb-10 rounded-full border border-white/15 bg-white/5 text-white/60 text-[11px] font-semibold tracking-[0.15em] uppercase">
            <span className="size-1.5 rounded-full" style={{ backgroundColor: G }} />
            VibeCon Hackathon 2026
          </div>

          <h1 className="text-[clamp(4rem,14vw,11rem)] font-black tracking-[-0.05em] leading-none text-white mb-6 select-none mix-blend-difference">
            FLOWY
          </h1>

          <p className="text-[clamp(0.7rem,1.6vw,1rem)] font-bold tracking-[0.4em] text-white/30 uppercase mb-8">
            MEETINGS BECOME PIPELINES.
          </p>

          <p className="max-w-lg text-base text-white/45 mb-12 leading-relaxed">
            The multi-model cognitive engine for product teams — converts 30 minutes of audio chaos into Jira tickets, PRDs, and Slack updates in under 10 seconds.
          </p>

          <div className="flex items-center gap-4">
            <Link href="/dashboard/overview">
              <button className="group flex items-center gap-2 rounded-full bg-white text-black px-9 py-3.5 text-sm font-bold hover:bg-[#00E676] transition-colors duration-300">
                Deploy Workspace <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
              </button>
            </Link>
            <a href="#pipeline" className="text-sm text-white/35 hover:text-white/60 transition-colors font-medium flex items-center gap-1.5">
              See how it works <ChevronDown className="size-4" />
            </a>
          </div>
        </div>

        {/* Scroll cue */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 text-white/20 animate-bounce">
          <ChevronDown className="size-5" />
        </div>
      </section>

      {/* ── TICKER ───────────────────────────────────────────────────────── */}
      <div className="relative z-10 overflow-hidden py-4 border-y border-white/8 bg-white/[0.02] backdrop-blur-md">
        <div className="flex whitespace-nowrap" style={{ animation: "ticker 40s linear infinite" }}>
          {[...Array(3)].map((_, groupIndex) => (
            <React.Fragment key={groupIndex}>
              {["Multi-Model Orchestration","Whisper Transcription","Live Jira Push","PRD Generation","Stateful Memory Graph","FastAPI Backend","Agentic AI","Sub-10s Pipeline"].map((t, i) => (
                <span key={`${groupIndex}-${i}`} className="mx-12 text-white/25 text-[11px] font-bold tracking-[0.25em] uppercase">
                  {t} <span className="ml-12 text-white/10">—</span>
                </span>
              ))}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* ── [01] THE COGNITIVE GAP (Problem) ────────────────────────────── */}
      <section className="relative z-10 py-32 px-6 flex flex-col items-center justify-center text-center">
        <Reveal>
          <div className="max-w-4xl mx-auto">
            <h2 className="text-[clamp(2rem,8vw,5.5rem)] font-black tracking-[-0.04em] leading-[0.9] text-white mb-10 uppercase">
              Modern meetings<br/>are <span className="text-white/20">action black holes.</span>
            </h2>
            <p className="max-w-2xl mx-auto text-white/40 text-lg leading-relaxed font-medium">
              60 minutes of audio. 0 minutes of progress. Most teams spend more time documenting decisions than making them. Flowy bridges the cognitive gap.
            </p>
          </div>
        </Reveal>
      </section>

      {/* ── STATS ────────────────────────────────────────────────────────── */}
      <section className="relative z-10 py-24 px-6 border-b border-white/5 bg-transparent">
        <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4">
          {[
            { label: "Full Pipeline",     display: "< 10s", count: false },
            { label: "Parallel Agents",   to: 4,    suffix: "",  count: true },
            { label: "Tool Integrations", to: 3,    suffix: "+", count: true },
            { label: "Live Audio Capture",to: 100,  suffix: "%", count: true },
          ].map((s, i) => (
            <div key={i} className="border-r border-white/5 last:border-0 py-10 px-8 text-center md:text-left">
              <div className="text-5xl md:text-6xl font-black tracking-tighter text-white mb-2 tabular-nums">
                {s.count ? <Counter to={s.to!} suffix={s.suffix} /> : s.display}
              </div>
              <div className="text-xs text-white/30 font-semibold uppercase tracking-widest">{s.label}</div>
              {i === 0 && <div className="mt-3 h-[2px] w-10 rounded-full" style={{ backgroundColor: G }} />}
            </div>
          ))}
        </div>
      </section>

      {/* ── [02] DISTRIBUTED INTELLIGENCE (Use Cases) ───────────────────── */}
      <section className="relative z-10 py-16 px-6 border-b border-white/5 bg-transparent">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-1 px-4">
          {[
            { id: "01", role: "Product Leads", desc: "Automate technical specifications and roadmaps directly from brainstorming sessions." },
            { id: "02", role: "Engineering",    desc: "Seamlessly route verified decisions into Jira tickets with full context preservation." },
            { id: "03", role: "Project Ops",    desc: "Dispatch high-fidelity executive summaries and Slack updates with zero manual effort." },
          ].map((u, i) => (
            <Reveal key={i} delay={i * 0.1}>
              <div className="group relative p-10 border border-white/10 bg-white/[0.01] hover:bg-white/[0.03] transition-all duration-500 min-h-[300px] flex flex-col justify-between">
                <div>
                  <span className="block text-[10px] font-mono text-white/20 mb-10 tracking-[0.3em] font-bold uppercase">[{u.id}] // Cognitive Module</span>
                  <h3 className="text-2xl font-black text-white mb-4 uppercase tracking-tight">{u.role}</h3>
                  <p className="text-sm text-white/40 leading-relaxed max-w-[240px] font-medium">{u.desc}</p>
                </div>
                <div className="size-1.5 rounded-full bg-white/10 group-hover:bg-[#00E676] group-hover:shadow-[0_0_10px_#00E676] transition-all duration-500" />
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── FEATURES BENTO ───────────────────────────────────────────────── */}
      <section id="features" className="relative z-10 py-28 px-6 md:px-12 border-b border-white/5 bg-transparent">
        <div className="max-w-7xl mx-auto">
          <Reveal>
            <div className="mb-16">
              <p className="text-[11px] font-bold tracking-[0.2em] uppercase mb-4" style={{ color: G }}>The Architecture</p>
              <h2 className="text-4xl md:text-6xl font-black tracking-tighter text-white leading-[0.92]">
                Cognitive<br/>orchestration.
              </h2>
            </div>
          </Reveal>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Large — capture */}
            <Reveal delay={0.1} className="md:col-span-2">
              <SpotlightCard className="rounded-3xl border border-white/8 bg-white/[0.02] p-10 h-full">
                <Mic className="size-6 text-white/40 mb-8" />
                <h3 className="text-2xl font-bold text-white mb-4 tracking-tight">Dual-Stream Audio Capture</h3>
                <p className="text-white/40 leading-relaxed text-sm max-w-md">
                  Web Audio API mixes microphone + system audio simultaneously at the browser level. No external bot, no latency. Lossless Opus WebM streamed directly to FastAPI.
                </p>
                <div className="mt-8 flex items-center gap-[3px] h-14">
                  {WAVE.slice(0, 18).map((h, i) => (
                    <div key={i} className="flex-1 rounded-full bg-white/20 transition-colors"
                      style={{ height: `${h * 0.55}%`, animation: `wavePulse ${1.2 + (i%4)*0.2}s ease-in-out ${i*0.04}s infinite` }}
                    />
                  ))}
                </div>
              </SpotlightCard>
            </Reveal>

            {/* Supervisor */}
            <Reveal delay={0.2}>
              <SpotlightCard className="rounded-3xl border border-white/8 bg-white/[0.02] p-10 h-full">
                <GitBranch className="size-6 text-white/40 mb-8" />
                <h3 className="text-xl font-bold text-white mb-4 tracking-tight">Supervisor Agent</h3>
                <p className="text-white/40 leading-relaxed text-sm">
                  LangGraph-powered orchestration. Fans out to 4 sub-agents simultaneously.
                </p>
                <div className="mt-6 space-y-2">
                  {["Summary","PRD Draft","Jira Tickets","Slack Post"].map(a => (
                    <div key={a} className="flex items-center gap-2.5">
                      <span className="size-1.5 rounded-full" style={{ backgroundColor: G }} />
                      <span className="text-xs text-white/50 font-medium">{a}</span>
                    </div>
                  ))}
                </div>
              </SpotlightCard>
            </Reveal>

            {/* Memory */}
            <Reveal delay={0.3}>
              <SpotlightCard className="rounded-3xl border border-white/8 bg-white/[0.02] p-10 h-full">
                <Activity className="size-6 text-white/40 mb-8" />
                <h3 className="text-xl font-bold text-white mb-4 tracking-tight">Stateful Memory</h3>
                <p className="text-white/40 leading-relaxed text-sm">
                  Cross-session context graph. Decisions and blockers persist across sprints.
                </p>
              </SpotlightCard>
            </Reveal>

            {/* Integrations */}
            <Reveal delay={0.4} className="md:col-span-2">
              <SpotlightCard className="rounded-3xl border border-white/8 bg-white/[0.02] p-10 h-full">
                <FileText className="size-6 text-white/40 mb-8" />
                <h3 className="text-2xl font-bold text-white mb-4 tracking-tight">Live Stack Integrations</h3>
                <p className="text-white/40 leading-relaxed text-sm max-w-md">
                  Jira REST API, Slack Incoming Webhooks, PRD document storage. Zero export steps — outputs land directly where your team works.
                </p>
                <div className="mt-8 flex items-center gap-3">
                  {[["J","#0052CC"],["S","#4A154B"],["N","#000000"]].map(([l,bg]) => (
                    <div key={l} className="size-10 rounded-xl flex items-center justify-center text-white text-sm font-black border border-white/10"
                      style={{ backgroundColor: bg as string }}
                    >{l}</div>
                  ))}
                  <span className="text-white/30 text-sm ml-2">+ more</span>
                </div>
              </SpotlightCard>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── PIPELINE ─────────────────────────────────────────────────────── */}
      <div id="pipeline">
        <PipelineSection />
      </div>

      {/* ── OUTPUTS ──────────────────────────────────────────────────────── */}
      <section className="relative z-10 py-28 px-6 md:px-12 border-b border-white/5 bg-transparent">
        <div className="max-w-7xl mx-auto">
          <Reveal>
            <div className="mb-16">
              <p className="text-[11px] font-bold tracking-[0.2em] uppercase mb-4" style={{ color: G }}>What you get out</p>
              <h2 className="text-4xl md:text-6xl font-black tracking-tighter text-white leading-[0.92]">
                One meeting.<br/>Four outputs.
              </h2>
            </div>
          </Reveal>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { n:"01", icon: FileText,       label: "Jira Tickets",  desc: "Auto-classified by type, priority, and assignee. Live REST push to your board." },
              { n:"02", icon: FileText,       label: "PRD Draft",     desc: "Investor-ready spec: goals, user stories, edge cases, and constraints." },
              { n:"03", icon: Activity,       label: "Slack Update",  desc: "#product-updates dispatched via Incoming Webhook. Formatted, on-brand." },
              { n:"04", icon: CheckCircle2,   label: "Exec Summary",  desc: "Decisions, action items, owners, risks, and blockers extracted precisely." },
            ].map(({ n, icon: Icon, label, desc }, i) => (
              <Reveal key={i} delay={i * 0.1}>
                <SpotlightCard className="p-10 border border-white/10 bg-white/[0.02] rounded-2xl h-full">
                  <div className="absolute top-0 left-0 h-[2px] w-12 rounded-full" style={{ backgroundColor: G }} />
                  <span className="text-[4rem] font-black text-white/5 leading-none select-none block mb-4 tabular-nums">{n}</span>
                  <Icon className="size-5 text-white/40 mb-4" />
                  <h4 className="text-white font-bold text-base mb-2">{label}</h4>
                  <p className="text-sm text-white/35 leading-relaxed">{desc}</p>
                </SpotlightCard>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── [04] JOIN THE ASSEMBLY (Waitlist) ─────────────────────────── */}
      <section className="relative z-10 py-32 px-6 border-b border-white/5 bg-transparent">
        <div className="max-w-3xl mx-auto text-center">
          <Reveal>
            <h2 className="text-4xl md:text-5xl font-black tracking-tighter text-white mb-6 uppercase">
              Join the Assembly.
            </h2>
            <p className="text-white/40 mb-12 text-lg">
              Secure your place in the future of cognitive orchestration.
            </p>
            
            <form className="flex flex-col md:flex-row gap-3 max-w-lg mx-auto" onSubmit={(e) => e.preventDefault()}>
              <input 
                type="email" 
                placeholder="system@access.io" 
                className="flex-1 px-6 py-4 rounded-2xl bg-white/[0.03] border border-white/10 text-white placeholder:text-white/20 focus:outline-none focus:border-[#00E676]/50 transition-all font-mono text-sm"
              />
              <button className="px-8 py-4 rounded-2xl bg-white text-black font-black text-sm hover:bg-[#00E676] transition-all uppercase tracking-widest">
                Dispatch
              </button>
            </form>
          </Reveal>
        </div>
      </section>

      {/* ── CINEMATIC CTA ────────────────────────────────────────────────── */}
      <section className="relative h-screen overflow-hidden flex flex-col justify-between pb-14 bg-[#080808]">
        {/* Background photo */}
        <div className="absolute inset-0">
          <div className="absolute inset-0"
            style={{ backgroundImage: "url('/person-bg.png')", backgroundSize: "cover", backgroundPosition: "60% center" }}
          />
          <div className="absolute inset-0" style={{
            background: "linear-gradient(to right, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.35) 55%, rgba(0,0,0,0.1) 100%)"
          }} />
        </div>

        {/* Floating card */}
        <Reveal y={50} delay={0.2} className="absolute top-[12%] left-10 md:left-16 z-10 w-[90vw] max-w-[400px]">
          <SpotlightCard className="bg-zinc-900/85 backdrop-blur-3xl rounded-3xl p-9 flex flex-col gap-8 border border-white/6 w-full h-full">
          <div className="flex items-center gap-2.5">
            <div className="size-8 rounded-full bg-white flex items-center justify-center">
              <Waves className="size-4 text-black" />
            </div>
            <span className="text-sm font-black tracking-tighter text-white">FLOWY</span>
          </div>
          <div>
            <h2 className="text-3xl md:text-[2.2rem] font-bold text-white leading-tight mb-6 tracking-tight">
              Your meeting<br/>just became<br/>your backlog.
            </h2>
            <Link href="/dashboard/overview">
              <button className="flex items-center gap-2 text-sm font-bold text-white/50 hover:text-white transition-colors duration-300 uppercase tracking-[0.12em] group">
                LAUNCH FLOWY
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
              </button>
            </Link>
          </div>
          <div className="flex gap-6 border-t border-white/8 pt-6">
            {[["<10s","Pipeline"],["4x","Agents"],["100%","Live Audio"]].map(([v,l]) => (
              <div key={l}>
                <div className="text-xl font-black text-white">{v}</div>
                <div className="text-[10px] text-white/30 uppercase tracking-widest mt-0.5">{l}</div>
              </div>
            ))}
          </div>
        </SpotlightCard>
        </Reveal>

        {/* Bottom labels */}
        <div className="relative z-10 flex-1" />
        <div className="relative z-10 flex justify-between px-10 mb-6">
          <p className="text-xl font-bold italic text-white/60">We capture.</p>
          <p className="text-xl font-bold italic text-white/60">We deliver.</p>
        </div>

        {/* Pill launch bar */}
        <div className="relative z-10 flex justify-center px-6">
          <div className="flex items-center bg-white/10 backdrop-blur-2xl rounded-full border border-white/10 overflow-hidden max-w-[540px] w-full">
            <Link href="/dashboard/overview">
              <button className="flex-shrink-0 size-13 rounded-full bg-white/20 hover:bg-white/35 transition-colors flex items-center justify-center ml-1 my-1 w-[52px] h-[52px]">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M8 5.14v14l11-7z" /></svg>
              </button>
            </Link>
            <span className="ml-5 text-white/80 text-xs font-bold tracking-[0.2em] uppercase">LAUNCH</span>
            <span className="mx-5 text-white/15">|</span>
            <span className="text-white/45 text-xs font-mono">00:00 / 10:00</span>
            <span className="mx-5 text-white/15">|</span>
            <span className="text-white/40 text-[10px] font-semibold uppercase tracking-wider leading-tight mr-6">ALL RUNNING<br/>AS FLOWY</span>
          </div>
        </div>
      </section>

      <footer className="relative z-10 border-t border-white/5 bg-[#080808] px-8 pt-20 pb-12 overflow-hidden">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-12 mb-20">
            <div className="col-span-2">
              <div className="flex items-center gap-2.5 text-white mb-6">
                <div className="size-8 rounded-full bg-white flex items-center justify-center">
                  <Waves className="size-4 text-black" />
                </div>
                <span className="text-lg font-black tracking-tighter uppercase">FLOWY</span>
              </div>
              <p className="text-white/30 text-sm leading-relaxed max-w-xs mb-8 font-medium">
                The multi-model cognitive orchestration engine for distributed product teams. Built for zero-latency artifact generation.
              </p>
            </div>
            
            <div>
              <h4 className="text-[10px] font-mono text-white/20 mb-6 tracking-[0.3em] font-black uppercase">Assembly</h4>
              <ul className="flex flex-col gap-3">
                {['Dispatch', 'Archives', 'People', 'Infrastructure'].map(l => (
                  <li key={l}><a href="#" className="text-white/40 hover:text-white transition-colors text-xs font-bold uppercase tracking-widest">{l}</a></li>
                ))}
              </ul>
            </div>

            <div>
              <h4 className="text-[10px] font-mono text-white/20 mb-6 tracking-[0.3em] font-black uppercase">Protocols</h4>
              <ul className="flex flex-col gap-3">
                {['Security', 'Privacy', 'Logistics', 'Network'].map(l => (
                  <li key={l}><a href="#" className="text-white/40 hover:text-white transition-colors text-xs font-bold uppercase tracking-widest">{l}</a></li>
                ))}
              </ul>
            </div>

            <div>
              <h4 className="text-[10px] font-mono text-white/20 mb-6 tracking-[0.3em] font-black uppercase">Access</h4>
              <ul className="flex flex-col gap-3">
                {['Twitter', 'GitHub', 'Discord', 'Platform'].map(l => (
                  <li key={l}><a href="#" className="text-white/40 hover:text-white transition-colors text-xs font-bold uppercase tracking-widest">{l}</a></li>
                ))}
              </ul>
            </div>
          </div>
          
          <div className="flex flex-col md:flex-row justify-between items-center border-t border-white/5 pt-8 gap-6">
            <div className="text-[10px] text-white/10 font-mono tracking-[0.2em] uppercase">
              &copy; 2026 ASSEMBLY NODE // FLOWY SYSTEMS. ALL COORDINATES WITHHELD.
            </div>
            <div className="flex items-center gap-4 text-[10px] text-white/20 font-bold uppercase tracking-widest">
              <span>VibeCon Hackathon 2026</span>
              <span className="size-1 rounded-full bg-white/5" />
              <span>Polaris School of Technology</span>
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}
