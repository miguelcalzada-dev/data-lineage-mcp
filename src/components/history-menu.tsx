'use client';

import { useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { History, ChevronDown } from 'lucide-react';
import { useClickOutside } from '@/lib/use-click-outside';

export interface HistoryEntry {
  id: string;
  label: string;
}

export interface HistoryMenuProps {
  entries: HistoryEntry[];
  onSelect: (id: string) => void;
}

export function HistoryMenu({ entries, onSelect }: HistoryMenuProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false), open);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-stone-500 transition hover:bg-stone-100 hover:text-stone-700 dark:text-night-400 dark:hover:bg-night-700 dark:hover:text-night-100"
      >
        <History className="h-3.5 w-3.5" />
        Historial
        {entries.length > 0 && (
          <span className="rounded-full bg-stone-200 px-1.5 text-[10px] text-stone-600 dark:bg-night-700 dark:text-night-200">
            {entries.length}
          </span>
        )}
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
            className="absolute left-0 top-full z-30 mt-1 w-64 origin-top overflow-hidden rounded-xl border border-stone-200 bg-white p-1 shadow-lg dark:border-night-700 dark:bg-night-800"
          >
            {entries.length === 0 ? (
              <p className="px-3 py-4 text-xs text-stone-400">Todavía no hay análisis.</p>
            ) : (
              <div className="max-h-72 overflow-y-auto">
                {entries.map((entry, index) => (
                  <motion.button
                    key={entry.id}
                    type="button"
                    role="menuitem"
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: Math.min(index * 0.025, 0.2), duration: 0.15 }}
                    onClick={() => {
                      onSelect(entry.id);
                      setOpen(false);
                    }}
                    title={entry.label}
                    className="block w-full truncate rounded-lg px-3 py-1.5 text-left text-xs text-stone-600 transition hover:bg-stone-100 hover:text-stone-900 dark:text-night-300 dark:hover:bg-night-700 dark:hover:text-night-100"
                  >
                    {entry.label}
                  </motion.button>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
