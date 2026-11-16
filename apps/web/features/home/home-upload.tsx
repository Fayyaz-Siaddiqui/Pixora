'use client';

import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { UploadDropzone } from '@/components/tools/upload-dropzone';
import { TOOLS } from '@/lib/tools';

/** Upload on the homepage, then pick what to do. The uploaded images are already selected in every tool. */
export function HomeUpload() {
  const [count, setCount] = useState(0);
  return (
    <div className="space-y-4">
      <UploadDropzone onUploaded={(n) => setCount(n)} />
      {count > 0 && (
        <div className="rounded-card border border-line bg-surface p-4" aria-live="polite">
          <p className="text-sm font-medium">
            {count === 1 ? 'Your image is ready.' : `${count} images are ready.`} What would you like to do?
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {TOOLS.filter((t) => t.href !== '/batch-image-resizer').map((t) => (
              <Link key={t.href} href={t.href} className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-sm hover:border-accent hover:text-accent">
                <t.Icon className="size-3.5" aria-hidden="true" />
                {t.name.replace('Image ', '')}
                <ArrowRight className="size-3" aria-hidden="true" />
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
