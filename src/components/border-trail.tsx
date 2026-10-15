'use client';

import { motion } from 'framer-motion';

export function BorderTrail(): JSX.Element {
  return (
    <motion.div
      className="pointer-events-none absolute inset-0 z-0 rounded-[inherit]"
      style={{
        background: 'linear-gradient(90deg, transparent, rgba(249, 115, 22, 0.22), transparent)',
        backgroundSize: '200% 100%',
      }}
      animate={{ backgroundPosition: ['200% 0%', '-200% 0%'] }}
      transition={{ duration: 2.5, repeat: Infinity, ease: 'linear' }}
      aria-hidden
    />
  );
}
