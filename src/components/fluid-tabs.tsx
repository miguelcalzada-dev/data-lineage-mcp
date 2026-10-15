'use client';

import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { motion } from 'framer-motion';

const SPRING = { type: 'spring' as const, stiffness: 380, damping: 34, mass: 0.75 };

export interface FluidTab {
  id: string;
  label: string;
  icon?: ReactNode;
}

export interface FluidTabsProps {
  tabs: FluidTab[];
  active: string;
  onChange: (id: string) => void;
  layoutId?: string;
  ariaLabel?: string;
}

export function FluidTabs({
  tabs,
  active,
  onChange,
  layoutId = 'fluid-tabs-pill',
  ariaLabel,
}: FluidTabsProps): JSX.Element {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number): void {
    const last = tabs.length - 1;
    let next = index;

    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      next = index === last ? 0 : index + 1;
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      next = index === 0 ? last : index - 1;
    } else if (event.key === 'Home') {
      next = 0;
    } else if (event.key === 'End') {
      next = last;
    } else {
      return;
    }

    event.preventDefault();
    const target = tabs[next];
    if (!target) return;
    onChange(target.id);
    refs.current[next]?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="relative flex items-center gap-1 rounded-full bg-stone-100 p-1 dark:bg-night-800"
    >
      {tabs.map((tab, index) => {
        const isActive = active === tab.id;
        return (
          <button
            key={tab.id}
            ref={(el) => {
              refs.current[index] = el;
            }}
            type="button"
            role="tab"
            id={`fluid-tab-${layoutId}-${tab.id}`}
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className="relative flex flex-1 items-center justify-center rounded-full px-4 py-2 text-sm font-semibold text-stone-500 transition-colors hover:text-stone-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 dark:text-night-400 dark:hover:text-night-200"
          >
            {isActive && (
              <motion.span
                layoutId={layoutId}
                className="absolute inset-0 rounded-full bg-white shadow-sm dark:bg-night-700"
                transition={SPRING}
                aria-hidden
              />
            )}
            <span
              className={`relative z-10 inline-flex items-center justify-center gap-2 ${
                isActive ? 'text-stone-900 dark:text-night-100' : ''
              }`}
            >
              {tab.icon}
              {tab.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
