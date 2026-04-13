import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export function TutorialStepDots({
  current,
  total,
  className,
  thick,
}: {
  current: number;
  total: number;
  className?: string;
  thick?: boolean;
}) {
  return (
    <div className={cn('mb-4 flex gap-2', thick && 'gap-2.5', className)} aria-hidden>
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={cn(
            thick ? 'h-2' : 'h-1.5',
            'flex-1 rounded-full transition-colors',
            i < current ? 'bg-emerald-400' : thick ? 'bg-emerald-400/45' : 'bg-emerald-400/20',
          )}
        />
      ))}
    </div>
  );
}

export function TutorialCard({
  title,
  body,
  primaryLabel,
  onPrimary,
  onExit,
  onGoBack,
  /** Shown above Go back when using top-right exit (e.g. acknowledge and use the form). */
  onContinue,
  continueLabel = 'Continue',
  exitPlacement = 'bottom',
  progressCurrent,
  progressTotal,
  secondaryHint,
  className,
  bodyClassName,
  /** Dark sheet-style shell; matches create-goal tutorial callout. */
  variant = 'default',
}: {
  title?: string;
  body: ReactNode;
  primaryLabel?: string;
  onPrimary?: () => void;
  onExit: () => void;
  onGoBack?: () => void;
  onContinue?: () => void;
  continueLabel?: string;
  exitPlacement?: 'bottom' | 'top-right';
  progressCurrent: number;
  progressTotal: number;
  secondaryHint?: ReactNode;
  className?: string;
  bodyClassName?: string;
  variant?: 'default' | 'chrome';
}) {
  const exitInCorner = exitPlacement === 'top-right';
  const chrome = variant === 'chrome';
  const showInlineBackAndPrimary = Boolean(onGoBack && primaryLabel && onPrimary);

  return (
    <div
      className={cn(
        chrome
          ? 'relative rounded-3xl border border-white/10 bg-[#141414] p-6 pt-5 shadow-xl sm:p-7 sm:pt-6'
          : 'relative rounded-2xl border border-border bg-card p-5 pt-4 shadow-xl',
        className,
      )}
    >
      {exitInCorner ? (
        <div className="absolute right-2 top-2 z-10">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn(
              'h-8 px-2.5 text-xs font-medium',
              chrome
                ? 'text-zinc-400 hover:bg-white/5 hover:text-white'
                : 'text-muted-foreground hover:text-foreground',
            )}
            onClick={onExit}
          >
            Exit tutorial
          </Button>
        </div>
      ) : null}
      <div className={exitInCorner ? 'pr-[7.25rem]' : undefined}>
        <TutorialStepDots current={progressCurrent} total={progressTotal} thick={chrome} />
      </div>
      {title ? (
        <h3
          className={cn(
            'font-display font-bold text-foreground mb-2',
            chrome ? 'text-xl' : 'text-lg',
          )}
        >
          {title}
        </h3>
      ) : null}
      <div
        className={cn(
          'space-y-3 leading-relaxed',
          chrome
            ? 'text-base font-medium text-foreground sm:text-lg'
            : 'text-sm text-muted-foreground',
          bodyClassName,
        )}
      >
        {body}
      </div>
      {secondaryHint ? (
        <div
          className={cn(
            'mt-3',
            chrome ? 'text-sm font-medium leading-relaxed text-zinc-400 sm:text-base' : 'text-xs text-muted-foreground',
          )}
        >
          {secondaryHint}
        </div>
      ) : null}
      <div className={cn('flex flex-col gap-2', chrome ? 'mt-6' : 'mt-5')}>
        {showInlineBackAndPrimary ? (
          <div className="flex gap-2">
            <Button
              variant="outline"
              className={cn(
                'flex-1 rounded-xl font-display font-semibold',
                chrome && 'h-11 border-white/15 bg-transparent text-base text-foreground hover:bg-white/10',
              )}
              onClick={onGoBack}
            >
              Go back
            </Button>
            <Button
              className={cn(
                'flex-1 rounded-xl font-display font-bold',
                chrome && 'h-11 text-base',
              )}
              onClick={onPrimary}
            >
              {primaryLabel}
            </Button>
          </div>
        ) : null}
        {!showInlineBackAndPrimary && primaryLabel && onPrimary ? (
          <Button
            className={cn(
              'w-full rounded-xl font-display font-bold',
              chrome && 'h-11 text-base',
            )}
            onClick={onPrimary}
          >
            {primaryLabel}
          </Button>
        ) : null}
        {exitInCorner && onContinue ? (
          <Button
            variant="outline"
            className={cn(
              'w-full rounded-xl font-display font-semibold',
              chrome && 'h-11 border-white/15 bg-transparent text-base text-foreground hover:bg-white/10',
            )}
            onClick={onContinue}
          >
            {continueLabel}
          </Button>
        ) : null}
        {!showInlineBackAndPrimary && onGoBack ? (
          <Button
            variant="outline"
            className={cn(
              'w-full rounded-xl font-display font-semibold',
              chrome && 'h-11 border-white/15 bg-transparent text-base text-foreground hover:bg-white/10',
            )}
            onClick={onGoBack}
          >
            Go back
          </Button>
        ) : null}
        {!exitInCorner ? (
          <Button variant="ghost" className="w-full rounded-xl text-muted-foreground" onClick={onExit}>
            Exit tutorial
          </Button>
        ) : null}
      </div>
    </div>
  );
}
