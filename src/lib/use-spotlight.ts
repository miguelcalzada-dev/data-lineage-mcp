'use client';

import { useRef, useState, type CSSProperties, type MouseEvent } from 'react';

export interface Spotlight {
  ref: React.RefObject<HTMLDivElement>;
  overlayStyle: CSSProperties;
  handlers: {
    onMouseMove: (event: MouseEvent<HTMLDivElement>) => void;
    onMouseEnter: () => void;
    onMouseLeave: () => void;
  };
}

export function useSpotlight(color = 'rgba(249, 115, 22, 0.09)'): Spotlight {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [opacity, setOpacity] = useState<number>(0);

  return {
    ref,
    overlayStyle: {
      opacity,
      background: `radial-gradient(420px circle at ${position.x}px ${position.y}px, ${color}, transparent 45%)`,
    },
    handlers: {
      onMouseMove: (event: MouseEvent<HTMLDivElement>) => {
        const rect = ref.current?.getBoundingClientRect();
        if (!rect) return;
        setPosition({ x: event.clientX - rect.left, y: event.clientY - rect.top });
      },
      onMouseEnter: () => setOpacity(1),
      onMouseLeave: () => setOpacity(0),
    },
  };
}
