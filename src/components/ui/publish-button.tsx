import * as React from 'react';
import { Button } from '@/components/ui/button';
import { SuccessMorphIcon } from '@/components/ui/animated-state-icons';
import { cn } from '@/lib/utils';

export interface PublishButtonLabels {
  idle: string;
  holding: string;
}

export type PublishPhase = 'idle' | 'holding' | 'publishing' | 'success';

export interface PublishButtonProps {
  onPublish?: () => void | Promise<void>;
  /** Called after success animation + hold delay (e.g. close sheet). */
  onSuccess?: () => void;
  /** Fired when async work / success phases change (for full-sheet overlay). */
  onPhaseChange?: (phase: PublishPhase) => void;
  /** Return false to block starting the hold (e.g. validation). */
  onBeforeHold?: () => boolean;
  holdDuration?: number;
  /** Progress tick interval (ms); also used for horizontal fill transition. */
  progressTickMs?: number;
  /** `fill` = left-to-right bar (goal sign). `ring` = circular stroke. */
  progressStyle?: 'ring' | 'fill';
  /** Extra pause after API resolves before morphing (0 = same moment as confirmation toast). */
  successBeforeMorphMs?: number;
  /** How long to show success before `onSuccess`. */
  successHoldMs?: number;
  labels?: Partial<PublishButtonLabels>;
  className?: string;
}

const defaultLabels: PublishButtonLabels = {
  idle: 'Publish',
  holding: 'Sure?',
};

const SUCCESS_BEFORE_MORPH_MS = 0;
const SUCCESS_HOLD_MS = 1400;

export function PublishButton({
  onPublish,
  onSuccess,
  onPhaseChange,
  onBeforeHold,
  holdDuration = 2000,
  progressTickMs = 30,
  progressStyle = 'ring',
  successBeforeMorphMs = SUCCESS_BEFORE_MORPH_MS,
  successHoldMs = SUCCESS_HOLD_MS,
  labels: labelsProp,
  className,
}: PublishButtonProps) {
  const labels = { ...defaultLabels, ...labelsProp };
  const [state, setState] = React.useState<'idle' | 'holding' | 'publishing' | 'success'>('idle');
  const [progress, setProgress] = React.useState(0);
  const [animKey, setAnimKey] = React.useState(0);

  const progressIntervalRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = React.useRef<number>(0);
  const holdTriggeredRef = React.useRef(false);
  const mountedRef = React.useRef(true);

  const clearTimers = React.useCallback(() => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
  }, []);

  const startHolding = () => {
    if (state !== 'idle') return;
    if (onBeforeHold && !onBeforeHold()) return;

    setState('holding');
    setProgress(0);
    setAnimKey((k) => k + 1);
    onPhaseChange?.('holding');
    startTimeRef.current = Date.now();
    holdTriggeredRef.current = false;

    progressIntervalRef.current = window.setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      const pct = Math.min((elapsed / holdDuration) * 100, 100);
      setProgress(pct);
      if (pct >= 100 && !holdTriggeredRef.current) {
        holdTriggeredRef.current = true;
        if (progressIntervalRef.current) {
          clearInterval(progressIntervalRef.current);
          progressIntervalRef.current = null;
        }
        void confirmPublish();
      }
    }, progressTickMs);
  };

  const cancelHolding = () => {
    if (state !== 'holding') return;
    clearTimers();
    setProgress(0);
    setState('idle');
    setAnimKey((k) => k + 1);
    onPhaseChange?.('idle');
  };

  const confirmPublish = async () => {
    clearTimers();
    setState('publishing');
    setAnimKey((k) => k + 1);
    setProgress(100);
    onPhaseChange?.('publishing');
    try {
      await onPublish?.();
      if (successBeforeMorphMs > 0) {
        await new Promise((r) => setTimeout(r, successBeforeMorphMs));
      }
      if (!mountedRef.current) return;
      setState('success');
      setAnimKey((k) => k + 1);
      onPhaseChange?.('success');
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate?.(60);
      }
      await new Promise((r) => setTimeout(r, successHoldMs));
      if (!mountedRef.current) return;
      onSuccess?.();
      onPhaseChange?.('idle');
      setState('idle');
      setProgress(0);
      setAnimKey((k) => k + 1);
    } catch {
      onPhaseChange?.('idle');
      setState('idle');
      setProgress(0);
      setAnimKey((k) => k + 1);
    }
  };

  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearTimers();
    };
  }, [clearTimers]);

  const showHoldUi = state === 'idle' || state === 'holding';
  const showMorphInButton = state === 'publishing' || state === 'success';

  return (
    <Button
      type="button"
      variant={state === 'success' ? 'secondary' : 'default'}
      className={cn(
        'relative flex h-auto min-h-[56px] min-w-0 flex-1 select-none items-center justify-center gap-2 overflow-hidden py-4 font-display text-base font-bold transition-all duration-300 ease-in-out',
        'rounded-2xl glow-primary',
        state === 'holding' && 'scale-[0.98] cursor-grabbing',
        state === 'success' &&
          'bg-[hsl(var(--success))] text-[hsl(var(--success-foreground))] hover:bg-[hsl(var(--success))]',
        className,
      )}
      onMouseDown={startHolding}
      onMouseUp={cancelHolding}
      onMouseLeave={cancelHolding}
      onTouchStart={startHolding}
      onTouchEnd={cancelHolding}
      disabled={state === 'publishing' || state === 'success'}
    >
      {progressStyle === 'fill' && (state === 'holding' || state === 'publishing') && (
        <div
          key={`fill-${animKey}`}
          className="absolute inset-0 bg-primary-foreground/20"
          style={{
            width: `${progress}%`,
            transition: `width ${progressTickMs}ms linear`,
          }}
        />
      )}

      {progressStyle === 'ring' && state === 'holding' && (
        <svg
          key={`progress-${animKey}`}
          className="animate-in fade-in absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2"
          viewBox="0 0 36 36"
          aria-hidden
        >
          <path
            strokeWidth="3"
            fill="none"
            strokeLinecap="round"
            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            style={{
              stroke: 'hsl(var(--muted-foreground))',
              opacity: 0.3,
              transition: 'stroke 0.2s ease',
            }}
          />
          <path
            strokeWidth="3"
            fill="none"
            strokeLinecap="round"
            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            style={{
              stroke: 'hsl(var(--destructive))',
              strokeDasharray: `${progress}, 100`,
              transition: 'stroke-dasharray 0.08s linear, stroke 0.3s ease',
            }}
          />
        </svg>
      )}

      {showMorphInButton && (
        <SuccessMorphIcon
          key={`morph-${animKey}`}
          phase={state === 'publishing' ? 'loading' : 'success'}
          size={28}
          className={cn(
            'relative z-10 shrink-0',
            state === 'success'
              ? 'text-[hsl(var(--success-foreground))]'
              : 'text-primary-foreground',
          )}
        />
      )}

      <span
        key={`label-${animKey}`}
        className={cn(
          'relative z-10 px-1 text-center leading-tight transition-all duration-300 ease-in-out',
          showMorphInButton && 'sr-only',
          showHoldUi && 'animate-in fade-in slide-in-from-bottom-1',
        )}
      >
        {state === 'holding' ? labels.holding : labels.idle}
      </span>
    </Button>
  );
}
