'use client';

import { type ReactNode } from 'react';
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
}

export function FluidTabs({
  tabs,
  active,
  onChange,
  layoutId = 'fluid-tabs-pill',
}: FluidTabsProps): JSX.Element {
  return (
    <div className="relative flex items-center gap-1 rounded-full bg-stone-100 p-1">
      {tabs.map((tab) => {
        const isActive = active === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.id)}
            className="relative flex flex-1 items-center justify-center rounded-full px-4 py-2 text-sm font-semibold text-stone-500 transition-colors hover:text-stone-700"
          >
            {isActive && (
              <motion.span
                layoutId={layoutId}
                className="absolute inset-0 rounded-full bg-white shadow-sm"
                transition={SPRING}
                aria-hidden
              />
            )}
            <span
              className={`relative z-10 inline-flex items-center justify-center gap-2 ${
                isActive ? 'text-stone-900' : ''
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
