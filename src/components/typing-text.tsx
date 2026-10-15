'use client';

import { useEffect, useState } from 'react';

export function TypingText({ text, speed = 10 }: { text: string; speed?: number }): JSX.Element {
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

  return <>{text.slice(0, count)}</>;
}
