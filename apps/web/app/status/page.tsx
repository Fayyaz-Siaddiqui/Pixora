import type { Metadata } from 'next';
import { SystemStatus } from '@/features/status/system-status';

export const metadata: Metadata = {
  title: 'System status',
  description: 'Live status of the image processing API, database and image engine.',
};

export default function StatusPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <h1 className="mb-6 font-display text-3xl font-semibold tracking-tight">System status</h1>
      <SystemStatus />
    </div>
  );
}
