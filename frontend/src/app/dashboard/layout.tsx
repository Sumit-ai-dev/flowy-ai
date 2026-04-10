import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Flowy AI Workspace',
  description: 'AI Chief of Staff for Product Managers',
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <main className="w-full flex-1 overflow-hidden">
        {children}
      </main>
    </div>
  );
}
