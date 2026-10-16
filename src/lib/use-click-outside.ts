'use client';

import { useEffect, useRef, type RefObject } from 'react';

export function useClickOutside<T extends HTMLElement>(
  ref: RefObject<T>,
  handler: () => void,
  active = true
): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!active) return;

    const onPointerDown = (event: MouseEvent | TouchEvent): void => {
      const node = ref.current;
      if (node && !node.contains(event.target as Node)) handlerRef.current();
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') handlerRef.current();
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [ref, active]);
}
