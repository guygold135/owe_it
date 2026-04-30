import { useEffect, useRef, useState } from "react";

const BASE_Z_INDEX = 90;
const ELEVATED_Z_INDEX = 110;

function nodeMatchesToast(node: Node, toastSelector: string): boolean {
  if (!(node instanceof Element)) return false;
  if (node.matches(toastSelector)) return true;
  return node.querySelector(toastSelector) !== null;
}

export function useRaiseNotificationsOverOpenWindows(
  toastSelector: string,
  holdMs = 4500,
): { zIndex: number } {
  const [elevated, setElevated] = useState(false);
  const resetTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof document === "undefined") return;

    const clearResetTimer = () => {
      if (resetTimerRef.current !== null) {
        window.clearTimeout(resetTimerRef.current);
        resetTimerRef.current = null;
      }
    };

    const raiseTemporarily = () => {
      setElevated(true);
      clearResetTimer();
      resetTimerRef.current = window.setTimeout(() => {
        setElevated(false);
        resetTimerRef.current = null;
      }, holdMs);
    };

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const addedNode of mutation.addedNodes) {
          if (nodeMatchesToast(addedNode, toastSelector)) {
            raiseTemporarily();
            return;
          }
        }
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      clearResetTimer();
    };
  }, [holdMs, toastSelector]);

  return { zIndex: elevated ? ELEVATED_Z_INDEX : BASE_Z_INDEX };
}
