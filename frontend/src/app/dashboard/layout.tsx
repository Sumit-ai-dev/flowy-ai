import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Flowy AI Workspace',
  description: 'AI Chief of Staff for Product Managers',
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-zinc-950 relative overflow-hidden">
      {/* DeepMind grid */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:4rem_4rem] pointer-events-none" />
      {/* Ambient glow */}
      <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-primary/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-indigo-500/10 rounded-full blur-[120px] pointer-events-none" />
      <main className="w-full flex-1 overflow-hidden relative z-10">
        {children}
      </main>
    </div>
  );
}
