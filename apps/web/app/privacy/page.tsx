import type { Metadata } from 'next';
import { brand } from '@/lib/config';

export const metadata: Metadata = {
  title: 'Privacy & image handling',
  description: `How ${brand.name} processes, stores and deletes your images.`,
  alternates: { canonical: '/privacy' },
};

const SECTIONS = [
  {
    h: 'How your images are processed',
    p: [
      'Images you upload are sent over an encrypted (HTTPS) connection to our servers, where they are processed with the open-source libvips image library. Nothing is sent to third parties for processing.',
      'Each visitor gets a private, random identifier stored in a secure cookie. Your images are visible only through that identifier. Other people cannot see or download them.',
    ],
  },
  {
    h: 'How long files are kept',
    p: [
      'Uploaded files and processed results are deleted automatically 24 hours after upload. You can delete any image immediately using the delete button on its thumbnail.',
    ],
  },
  {
    h: 'Metadata and location',
    p: [
      'Photos can contain hidden information such as the camera model and the GPS location where they were taken. Processed images have all metadata removed by default. If you choose to keep photo details, only camera, author and date are kept; GPS location is always removed.',
    ],
  },
  {
    h: 'AI training',
    p: ['Your images are never used to train AI models.'],
  },
  {
    h: 'Cookies',
    p: ['We use one essential cookie to keep your uploads private to you, plus your colour theme preference stored in your browser. There are no advertising or tracking cookies.'],
  },
];

export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">Privacy & image handling</h1>
      <p className="mt-3 text-ink-muted">In short: your images are private, never used for training, and deleted automatically.</p>
      <div className="mt-10 space-y-8">
        {SECTIONS.map((s) => (
          <section key={s.h}>
            <h2 className="font-display text-xl font-semibold">{s.h}</h2>
            {s.p.map((t) => (
              <p key={t} className="mt-2 text-pretty text-ink-muted">{t}</p>
            ))}
          </section>
        ))}
      </div>
    </article>
  );
}
