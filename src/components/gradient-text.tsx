'use client';

import { motion } from 'framer-motion';

export function GradientText({
  text,
  className = '',
}: {
  text: string;
  className?: string;
}): JSX.Element {
  return (
    <motion.span
      className={`bg-gradient-to-r from-orange-600 via-amber-500 to-orange-600 bg-clip-text text-transparent ${className}`}
      style={{ backgroundSize: '200% auto' }}
      animate={{ backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'] }}
      transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
    >
      {text}
    </motion.span>
  );
}
