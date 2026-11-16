'use client';

import { create } from 'zustand';
import { api, errorMessage } from '@/lib/api';
import type { Asset, UploadRejection } from '@/lib/types';

/**
 * The visitor's uploaded images, shared by every tool page: upload once,
 * then resize, compress or convert without uploading again. The server is
 * the source of truth (files are tied to the visitor's cookie), so the list
 * is restored from the API on page load.
 */
interface UploadTask {
  id: string;
  names: string[];
  progress: number;
}

interface WorkspaceState {
  images: Asset[];
  selectedIds: string[];
  loaded: boolean;
  loadError: string | null;
  uploads: UploadTask[];
  rejections: UploadRejection[];
  uploadError: string | null;

  load: () => Promise<void>;
  upload: (files: File[], opts?: { selectNew?: 'replace' | 'add' }) => Promise<Asset[]>;
  remove: (id: string) => Promise<void>;
  toggle: (id: string) => void;
  select: (ids: string[]) => void;
  dismissRejections: () => void;
}

let loading: Promise<void> | null = null;

export const useWorkspace = create<WorkspaceState>((set, get) => ({
  images: [],
  selectedIds: [],
  loaded: false,
  loadError: null,
  uploads: [],
  rejections: [],
  uploadError: null,

  load: () => {
    if (get().loaded) return Promise.resolve();
    loading ??= api
      .listImages('ORIGINAL')
      .then((images) => {
        set((s) => {
          const known = new Set(s.images.map((i) => i.id));
          const merged = [...s.images, ...images.filter((i) => !known.has(i.id))];
          return { images: merged, loaded: true, loadError: null, selectedIds: s.selectedIds.length ? s.selectedIds : merged.slice(0, 1).map((i) => i.id) };
        });
      })
      .catch((err: unknown) => set({ loadError: errorMessage(err), loaded: true }))
      .finally(() => {
        loading = null;
      });
    return loading;
  },

  upload: async (files, opts = {}) => {
    if (files.length === 0) return [];
    const taskId = crypto.randomUUID();
    set((s) => ({ uploads: [...s.uploads, { id: taskId, names: files.map((f) => f.name), progress: 0 }], uploadError: null }));
    try {
      const result = await api.upload(files, (p) =>
        set((s) => ({ uploads: s.uploads.map((u) => (u.id === taskId ? { ...u, progress: p } : u)) })),
      );
      set((s) => {
        const newIds = result.uploaded.map((a) => a.id);
        return {
          images: [...result.uploaded, ...s.images.filter((i) => !newIds.includes(i.id))],
          rejections: result.rejected,
          selectedIds: newIds.length === 0 ? s.selectedIds : opts.selectNew === 'add' ? [...new Set([...s.selectedIds, ...newIds])] : newIds,
        };
      });
      return result.uploaded;
    } catch (err) {
      set({ uploadError: errorMessage(err) });
      return [];
    } finally {
      set((s) => ({ uploads: s.uploads.filter((u) => u.id !== taskId) }));
    }
  },

  remove: async (id) => {
    const prev = get();
    set({ images: prev.images.filter((i) => i.id !== id), selectedIds: prev.selectedIds.filter((s) => s !== id) });
    try {
      await api.deleteImage(id);
    } catch (err) {
      // 404/410: already gone on the server, which is what the user wanted.
      if (!(err instanceof Error && /not found|expired|deleted/i.test(err.message))) {
        set({ images: prev.images, selectedIds: prev.selectedIds, uploadError: errorMessage(err) });
      }
    }
  },

  toggle: (id) =>
    set((s) => ({ selectedIds: s.selectedIds.includes(id) ? s.selectedIds.filter((x) => x !== id) : [...s.selectedIds, id] })),

  select: (ids) => set({ selectedIds: ids }),

  dismissRejections: () => set({ rejections: [], uploadError: null }),
}));

/** Selected images in display order. */
export function useSelectedImages(): Asset[] {
  const images = useWorkspace((s) => s.images);
  const selected = useWorkspace((s) => s.selectedIds);
  return images.filter((i) => selected.includes(i.id));
}
