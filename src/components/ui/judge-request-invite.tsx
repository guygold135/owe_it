import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Check, X } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export interface JudgeRequestInviteCardProps {
  /** `toast` = compact floating card (bottom-right, like Sonner). */
  appearance?: 'default' | 'toast';
  requesterName: string;
  requesterAvatarUrl?: string | null;
  goalTitle: string;
  /** Shown after goal title, e.g. "public" / "private" */
  visibility?: 'public' | 'private';
  /** Date/time string (label "Deadline" added in UI) */
  deadlineFormatted?: string;
  /** Formatted amount, e.g. "$10.00" / "€10.00" */
  stakeFormatted?: string;
  /** Optional goal description */
  description?: string;
  /** e.g. "Invited 5 minutes ago" */
  timeLine?: string;
  onAccept: () => void | Promise<void>;
  onIgnore: () => void | Promise<void>;
  busy?: boolean;
  className?: string;
}

export function JudgeRequestInviteCard({
  appearance = 'default',
  requesterName,
  requesterAvatarUrl,
  goalTitle,
  visibility,
  deadlineFormatted,
  stakeFormatted,
  description,
  timeLine,
  onAccept,
  onIgnore,
  busy,
  className,
}: JudgeRequestInviteCardProps) {
  const [confirmKind, setConfirmKind] = useState<'accept' | 'ignore' | null>(null);
  const initial = (requesterName || 'U').charAt(0).toUpperCase();

  const isToast = appearance === 'toast';

  const runConfirmed = () => {
    const k = confirmKind;
    setConfirmKind(null);
    if (k === 'accept') void onAccept();
    if (k === 'ignore') void onIgnore();
  };

  const textMain = isToast ? 'text-[12px] leading-tight' : 'text-[13px] leading-snug';
  const textMeta = isToast ? 'text-[11px] leading-tight' : 'text-xs leading-snug';
  const textTiny = isToast ? 'text-[10px] leading-tight' : 'text-[11px]';
  const labelSize = isToast ? 'text-[10px] leading-none' : 'text-xs';

  const hasStake = stakeFormatted != null;

  return (
    <>
      <AlertDialog
        open={confirmKind !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmKind(null);
        }}
      >
        <AlertDialogContent className="z-[200] max-w-md rounded-2xl border-border sm:rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display">
              {confirmKind === 'accept' ? 'Accept this judge request?' : 'Ignore this judge request?'}
            </AlertDialogTitle>
            {confirmKind === 'accept' && (
              <AlertDialogDescription className="text-left text-muted-foreground">
                {hasStake ? (
                  <>
                    You&apos;ll become the only judge of {requesterName}&apos;s goal &ndash; &ldquo;{goalTitle}&rdquo; and
                    determine if the goal is completed or not, by that you&apos;ll be the only one able to determine if
                    the goal&apos;s stake (
                    <span className="font-bold tabular-nums text-primary">{stakeFormatted}</span>) will be charged or not.
                    This can&apos;t be undone.
                  </>
                ) : (
                  <>
                    You&apos;ll become the only judge of {requesterName}&apos;s goal &ndash; &ldquo;{goalTitle}&rdquo; and
                    determine if the goal is completed or not. This can&apos;t be undone.
                  </>
                )}
              </AlertDialogDescription>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel className="mt-0 rounded-xl font-display font-semibold">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                runConfirmed();
              }}
              className={cn(
                'rounded-xl font-display font-bold',
                confirmKind === 'ignore' && 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
                confirmKind === 'accept' && 'bg-primary text-primary-foreground',
              )}
            >
              {confirmKind === 'accept' ? 'Accept' : 'Ignore'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className={cn(isToast ? 'w-full max-w-[min(100vw-2rem,22rem)]' : 'w-full max-w-xl', className)}>
      <div
        className={cn(
          'relative border border-border bg-background text-foreground',
          isToast
            ? 'animate-in fade-in slide-in-from-bottom-4 rounded-lg p-2.5 shadow-lg duration-300'
            : 'rounded-xl bg-card p-4 shadow-sm shadow-[0_1px_6px_0_rgba(0,0,0,0.08)] dark:shadow-[0_1px_6px_0_rgba(0,0,0,0.25)]',
        )}
      >
        <div className="flex items-start gap-2">
          <div
            className={cn(
              'relative shrink-0 self-start overflow-hidden rounded-full bg-muted',
              isToast ? 'h-8 w-8' : 'h-10 w-10',
            )}
          >
            {requesterAvatarUrl ? (
              <img src={requesterAvatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <div
                className={cn(
                  'flex h-full w-full items-center justify-center font-display font-bold text-muted-foreground',
                  isToast ? 'text-xs' : 'text-sm',
                )}
              >
                {initial}
              </div>
            )}
            <div className="absolute bottom-0 right-0 h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-background" />
          </div>

          <div className="min-w-0 flex-1 space-y-0.5">
            <p className={cn('font-medium uppercase tracking-wide text-muted-foreground', labelSize)}>
              Judge request
            </p>
            <div className={cn('space-y-0.5 text-muted-foreground', textMain)}>
              <p>
                <span className="font-bold text-foreground">{requesterName}</span>
                {' wants you to judge their goal:'}
              </p>
              <p>
                <span className="font-bold text-foreground">&ldquo;{goalTitle}&rdquo;</span>
                {visibility != null && (
                  <>
                    {' · '}
                    <span className="font-medium capitalize text-muted-foreground">{visibility}</span>
                  </>
                )}
              </p>
            </div>
            {description && (
              <p className={cn('line-clamp-2 text-muted-foreground', textMeta)}>
                <span className="font-bold text-foreground">Description: </span>
                {description}
              </p>
            )}
            {deadlineFormatted && (
              <p className={cn('text-muted-foreground', textMeta)}>
                <span className="font-bold text-foreground">Deadline </span>
                <span className="tabular-nums">{deadlineFormatted}</span>
              </p>
            )}
            {stakeFormatted != null && (
              <p className={cn('text-muted-foreground', textMeta)}>
                <span className="font-bold text-foreground">Stake </span>
                <span className="font-bold tabular-nums text-primary">{stakeFormatted}</span>
              </p>
            )}
            {timeLine && <p className={cn('text-muted-foreground', textTiny)}>{timeLine}</p>}
          </div>

          <div className={cn('flex shrink-0 items-start pt-0.5', isToast ? 'gap-1' : 'gap-1.5')}>
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirmKind('ignore')}
              className={cn(
                'flex items-center justify-center rounded-lg p-0 transition-colors',
                isToast ? 'h-7 w-7' : 'h-8 w-8',
                'text-muted-foreground hover:bg-destructive/10 hover:text-destructive',
                'disabled:opacity-50',
              )}
              aria-label="Ignore"
            >
              <X className="h-4 w-4" />
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirmKind('accept')}
              className={cn(
                'flex items-center justify-center rounded-lg p-0 transition-colors',
                isToast ? 'h-7 w-7' : 'h-8 w-8',
                'text-muted-foreground hover:bg-emerald-500/15 hover:text-emerald-400',
                'disabled:opacity-50',
              )}
              aria-label="Accept"
            >
              <Check className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
    </>
  );
}
