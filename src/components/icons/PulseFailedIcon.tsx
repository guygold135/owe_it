import { useId, useMemo } from 'react';

import rawSvg from './pulse-failed-icon.svg?raw';

const CLIP_IDS = ['db1190224c', 'b20e4ce566', 'f5de8f9a2e', '53af22cc96'] as const;

/** Pulse "failed" row icon (custom artwork); clip-path ids are scoped for multiple instances. */
export function PulseFailedIcon({ className }: { className?: string }) {
  const uid = useId().replaceAll(':', '');
  const markup = useMemo(() => {
    let s = rawSvg;
    CLIP_IDS.forEach((id, i) => {
      const next = `${uid}_clip${i}`;
      s = s.split(id).join(next);
    });
    return s;
  }, [uid]);

  return (
    <span
      className={`inline-flex h-5 w-5 shrink-0 items-center justify-center text-warning ${className ?? ''}`}
      dangerouslySetInnerHTML={{ __html: markup }}
      aria-hidden
    />
  );
}
