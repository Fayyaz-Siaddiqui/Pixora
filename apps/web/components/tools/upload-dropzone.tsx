'use client';

import { ImagePlus, Loader2, ShieldCheck, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button, Notice, ProgressBar } from '@/components/ui/controls';
import { useConfig } from '@/hooks/use-config';
import { cx, formatBytes, formatLabel } from '@/lib/format';
import { useWorkspace } from '@/stores/workspace';

const ACCEPT = 'image/jpeg,image/png,image/webp,image/avif,image/gif,image/tiff,.jpg,.jpeg,.png,.webp,.avif,.gif,.tif,.tiff';

/**
 * Drag-and-drop / browse / paste upload. Files go to the server, which
 * validates their real content; per-file problems are listed clearly.
 */
export function UploadDropzone({
  size = 'large',
  multiple = true,
  onUploaded,
  listenForPaste = true,
}: {
  size?: 'large' | 'compact';
  multiple?: boolean;
  onUploaded?: (count: number) => void;
  listenForPaste?: boolean;
}) {
  const { config } = useConfig();
  const upload = useWorkspace((s) => s.upload);
  const uploads = useWorkspace((s) => s.uploads);
  const rejections = useWorkspace((s) => s.rejections);
  const uploadError = useWorkspace((s) => s.uploadError);
  const dismiss = useWorkspace((s) => s.dismissRejections);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const send = async (files: File[]) => {
    const list = multiple ? files : files.slice(0, 1);
    if (list.length === 0) return;
    // Newly uploaded images become the selection, ready for the tool.
    const done = await upload(list, { selectNew: 'replace' });
    if (done.length) onUploaded?.(done.length);
  };

  useEffect(() => {
    if (!listenForPaste) return;
    const onPaste = (e: ClipboardEvent) => {
      const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/'));
      if (files.length) {
        e.preventDefault();
        void send(files);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listenForPaste, multiple]);

  const busy = uploads.length > 0;
  const progress = busy ? (uploads.reduce((s, u) => s + u.progress, 0) / uploads.length) * 100 : 0;
  const formats = (config?.inputFormats ?? ['jpeg', 'png', 'webp', 'avif']).map(formatLabel).join(', ');
  const maxSize = config ? formatBytes(config.limits.uploadMaxBytes) : null;

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void send([...e.dataTransfer.files]);
        }}
        className={cx(
          'relative flex flex-col items-center justify-center rounded-card border-2 border-dashed text-center transition-colors',
          size === 'large' ? 'gap-4 px-6 py-12 sm:py-16' : 'gap-2 px-4 py-5',
          dragging ? 'border-accent bg-accent-soft' : 'border-line bg-surface hover:border-ink-muted/50',
        )}
      >
        {size === 'large' && (
          <span className="grid size-14 place-items-center rounded-full bg-accent-soft text-accent">
            {busy ? <Loader2 className="size-6 animate-spin" aria-hidden="true" /> : <ImagePlus className="size-6" aria-hidden="true" />}
          </span>
        )}
        <div>
          <p className={cx('font-medium', size === 'large' ? 'text-lg' : 'text-sm')}>
            {busy ? 'Uploading…' : dragging ? 'Drop to upload' : multiple ? 'Drag & drop images here' : 'Drag & drop an image here'}
          </p>
          {size === 'large' && <p className="mt-1 text-sm text-ink-muted">or paste from the clipboard (Ctrl+V)</p>}
        </div>
        <Button variant={size === 'large' ? 'primary' : 'secondary'} size={size === 'large' ? 'lg' : 'sm'} disabled={busy} onClick={() => inputRef.current?.click()}>
          <Upload className="size-4" aria-hidden="true" />
          {multiple ? 'Browse files' : 'Browse'}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          multiple={multiple}
          className="sr-only"
          tabIndex={-1}
          aria-label="Choose image files"
          onChange={(e) => {
            void send([...(e.target.files ?? [])]);
            e.target.value = '';
          }}
        />
        {size === 'large' && (
          <div className="space-y-1 text-xs text-ink-muted">
            <p>
              {formats}
              {maxSize && <> · up to {maxSize} each</>}
              {config && multiple && <> · {config.limits.uploadMaxFiles} files at a time</>}
            </p>
            <p className="inline-flex items-center gap-1">
              <ShieldCheck className="size-3.5" aria-hidden="true" />
              Private to you. Deleted automatically after {config?.limits.retentionHours ?? 24} hours.
            </p>
          </div>
        )}
        {busy && (
          <div className="w-full max-w-xs">
            <ProgressBar value={progress} label="Upload progress" />
          </div>
        )}
      </div>

      {uploadError && (
        <Notice tone="error" action={<Button size="sm" variant="ghost" onClick={dismiss}>Dismiss</Button>}>
          {uploadError}
        </Notice>
      )}
      {rejections.length > 0 && (
        <Notice tone="warn" action={<Button size="sm" variant="ghost" onClick={dismiss}>Dismiss</Button>}>
          <p className="font-medium">{rejections.length === 1 ? 'One file was not added:' : `${rejections.length} files were not added:`}</p>
          <ul className="mt-1 space-y-0.5">
            {rejections.map((r, i) => (
              <li key={i}>
                <span className="font-medium">{r.name}</span>: {r.message}
              </li>
            ))}
          </ul>
        </Notice>
      )}
    </div>
  );
}
