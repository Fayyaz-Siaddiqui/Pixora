'use client';

import { ChevronDown } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { cx } from '@/lib/format';
import { ToolMenuList } from './tool-menu-list';

/** Grace period so the menu doesn't vanish while the pointer moves onto it. */
const CLOSE_DELAY_MS = 150;

/**
 * "All tools" dropdown: opens on hover for mouse users, and on click / Enter /
 * Space for touch and keyboard users. Escape and clicking outside close it.
 */
export function ToolsMenu() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // A mouse click right after hover-open should keep the menu open, not toggle it shut.
  const hoverOpened = useRef(false);
  const panelId = useId();

  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
  };

  useEffect(() => {
    if (!open) {
      hoverOpened.current = false;
      return;
    }
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => cancelClose, []);

  return (
    <div
      ref={rootRef}
      className="relative"
      onPointerEnter={(e) => {
        if (e.pointerType !== 'mouse') return;
        cancelClose();
        if (!open) hoverOpened.current = true;
        setOpen(true);
      }}
      onPointerLeave={(e) => {
        if (e.pointerType === 'mouse') scheduleClose();
      }}
      onBlur={(e) => {
        if (!rootRef.current?.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          if (hoverOpened.current) {
            hoverOpened.current = false;
            setOpen(true);
          } else setOpen((o) => !o);
        }}
        className="flex items-center gap-1 rounded-ctl px-3 py-2 text-sm font-medium hover:bg-surface-2"
      >
        All tools <ChevronDown className={cx('size-4 transition-transform', open && 'rotate-180')} aria-hidden="true" />
      </button>
      {/* pt-2 (not mt-2) keeps the gap inside the hover area. */}
      <div id={panelId} hidden={!open} className="absolute left-1/2 top-full w-[34rem] -translate-x-1/2 pt-2">
        <div className="rounded-card border border-line bg-surface p-2 shadow-lg">
          <ToolMenuList onNavigate={() => setOpen(false)} />
        </div>
      </div>
    </div>
  );
}
