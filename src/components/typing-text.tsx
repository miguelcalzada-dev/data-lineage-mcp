'use client';

import { useEffect, useState, type ReactNode } from 'react';

export function TypingText({
  text,
  speed = 10,
  render,
}: {
  text: string;
  speed?: number;
  render?: (partial: string) => ReactNode;
}): JSX.Element {
  const [count, setCount] = useState(0);

  useEffect(() => {
    setCount(0);
    if (!text) return;
    const interval = setInterval(() => {
      setCount((c) => {
        if (c >= text.length) {
          clearInterval(interval);
          return c;
        }
        return c + 1;
      });
    }, speed);
    return () => clearInterval(interval);
  }, [text, speed]);

  const partial = text.slice(0, count);
  return <>{render ? render(partial) : partial}</>;
}
