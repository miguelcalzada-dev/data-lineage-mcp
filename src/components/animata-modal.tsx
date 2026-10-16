'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

export interface AnimataModalProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  size?: 'sm' | 'lg';
  className?: string;
  labelledBy?: string;
}

const SPRING = { type: 'spring' as const, stiffness: 320, damping: 30 };

export function AnimataModal({
  open,
  onClose,
  children,
  size = 'lg',
  className = '',
  labelledBy,
}: AnimataModalProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    containerRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.button
            type="button"
            aria-label="Cerrar"
            className="absolute inset-0 cursor-default border-0 bg-stone-900/40 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            ref={containerRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby={labelledBy}
            initial={{ scale: 0.96, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0, y: 10 }}
            transition={SPRING}
            className={`relative z-10 w-full ${
              size === 'sm' ? 'max-w-sm' : 'max-w-lg'
            } rounded-2xl border border-stone-200 bg-white p-6 shadow-2xl focus:outline-none dark:border-night-700 dark:bg-night-900 ${className}`}
          >
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
