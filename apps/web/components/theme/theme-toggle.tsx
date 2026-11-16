'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useSyncExternalStore } from 'react';

const options = [
  { value: 'light', label: 'Light theme', Icon: Sun },
  { value: 'system', label: 'System theme', Icon: Monitor },
  { value: 'dark', label: 'Dark theme', Icon: Moon },
] as const;

// True only after hydration, so the server and first client render match.
const useHydrated = () =>
  useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const hydrated = useHydrated();

  return (
    <div role="radiogroup" aria-label="Colour theme" className="inline-flex rounded-ctl border border-line bg-surface p-0.5">
      {options.map(({ value, label, Icon }) => {
        const active = hydrated && theme === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            onClick={() => setTheme(value)}
            className={`grid size-8 place-items-center rounded-[0.375rem] transition-colors ${
              active ? 'bg-surface-2 text-ink' : 'text-ink-muted hover:text-ink'
            }`}
          >
            <Icon className="size-4" strokeWidth={2} />
          </button>
        );
      })}
    </div>
  );
}
