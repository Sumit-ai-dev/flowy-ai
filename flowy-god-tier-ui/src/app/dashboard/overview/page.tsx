import { FlowyWorkspace } from '@/components/flowy/flowy-workspace';

export const metadata = {
  title: 'Flowy | AI Chief of Staff'
};

export default function page() {
  return (
    <div className="h-screen w-full max-w-[1800px] mx-auto p-4 md:p-6 pb-0">
      <FlowyWorkspace />
    </div>
  );
}
