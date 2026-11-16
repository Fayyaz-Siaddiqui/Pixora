export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 2 : 1)} MB`;
}

export const formatDims = (w: number, h: number) => `${w.toLocaleString()} × ${h.toLocaleString()}`;

const FORMAT_LABELS: Record<string, string> = { jpeg: 'JPG', png: 'PNG', webp: 'WebP', avif: 'AVIF', gif: 'GIF', tiff: 'TIFF' };
export const formatLabel = (f: string) => FORMAT_LABELS[f] ?? f.toUpperCase();

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}
