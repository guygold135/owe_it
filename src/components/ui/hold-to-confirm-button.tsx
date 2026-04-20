import * as React from 'react';
import { Button, type ButtonProps } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type HoldToConfirmButtonProps = Omit<ButtonProps, 'onClick'> & {
  idleLabel: React.ReactNode;
  holdingLabel?: React.ReactNode;
  holdDuration?: number;
  onConfirm: () => void | Promise<void>;
};

export function HoldToConfirmButton({
  idleLabel,
  holdingLabel = 'Sure?',
  holdDuration = 2000,
  onConfirm,
  disabled,
  className,
  ...props
}: HoldToConfirmButtonProps) {
  const buttonRef = React.useRef<HTMLButtonElement | null>(null);
  const [holding, setHolding] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [lockedWidth, setLockedWidth] = React.useState<number | null>(null);
  const timerRef = React.useRef<number | null>(null);
  const progressIntervalRef = React.useRef<number | null>(null);
  const confirmedRef = React.useRef(false);
  const holdStartedAtRef = React.useRef(0);

  const clearHold = React.useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (progressIntervalRef.current !== null) {
      window.clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
  }, []);

  const cancelHold = React.useCallback(() => {
    if (!holding) return;
    clearHold();
    setHolding(false);
    setProgress(0);
    setLockedWidth(null);
  }, [clearHold, holding]);

  const startHold = React.useCallback(() => {
    if (disabled || confirming || holding) return;
    if (buttonRef.current) {
      setLockedWidth(buttonRef.current.offsetWidth);
    }
    confirmedRef.current = false;
    setHolding(true);
    setProgress(0);
    holdStartedAtRef.current = Date.now();
    progressIntervalRef.current = window.setInterval(() => {
      const elapsed = Date.now() - holdStartedAtRef.current;
      setProgress(Math.min((elapsed / holdDuration) * 100, 100));
    }, 30);
    timerRef.current = window.setTimeout(() => {
      confirmedRef.current = true;
      clearHold();
      setHolding(false);
      setProgress(100);
      setConfirming(true);
      Promise.resolve(onConfirm()).finally(() => {
        setProgress(0);
        setConfirming(false);
        setLockedWidth(null);
      });
    }, holdDuration);
  }, [clearHold, confirming, disabled, holdDuration, holding, onConfirm]);

  const releaseHold = React.useCallback(() => {
    if (confirmedRef.current) return;
    cancelHold();
  }, [cancelHold]);

  React.useEffect(() => {
    return () => {
      clearHold();
    };
  }, [clearHold]);

  return (
    <Button
      ref={buttonRef}
      type="button"
      disabled={disabled || confirming}
      className={cn('relative overflow-hidden transition-all duration-300 ease-in-out', holding && 'scale-[0.98]', className)}
      style={lockedWidth ? { width: `${lockedWidth}px` } : undefined}
      onMouseDown={startHold}
      onMouseUp={releaseHold}
      onMouseLeave={releaseHold}
      onTouchStart={startHold}
      onTouchEnd={releaseHold}
      onTouchCancel={releaseHold}
      {...props}
    >
      {holding && (
        <div
          className="absolute inset-0 bg-primary-foreground/20"
          style={{
            width: `${progress}%`,
            transition: 'width 30ms linear',
          }}
        />
      )}
      <span className="relative z-10">{holding ? holdingLabel : idleLabel}</span>
    </Button>
  );
}
