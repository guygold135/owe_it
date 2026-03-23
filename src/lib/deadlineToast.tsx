import { toast } from 'sonner';
import { TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

export type DeadlineReminderKind = 'deadline_24h' | 'deadline_6h';

/** Same id for realtime + local so only one toast per goal + threshold. */
export function deadlineToastId(kind: DeadlineReminderKind, goalId: string) {
  return `${kind}-${goalId}`;
}

export function deadlineDismissStorageKey(toastId: string) {
  return `oweit_deadline_dismissed_${toastId}`;
}

export function isDeadlineWarningDismissed(toastId: string): boolean {
  try {
    return localStorage.getItem(deadlineDismissStorageKey(toastId)) === '1';
  } catch {
    return false;
  }
}

export function showDeadlineWarningToast(opts: {
  id: string;
  title: string;
  description: ReactNode;
  kind: DeadlineReminderKind;
  /** Extra handler after persisted dismiss (e.g. realtime dedupe). */
  onDismiss?: () => void;
}) {
  const { id, title, description, kind, onDismiss } = opts;
  const urgent = kind === 'deadline_6h';

  toast.warning(title, {
    id,
    description,
    duration: Infinity,
    closeButton: true,
    dismissible: true,
    onDismiss: () => {
      try {
        localStorage.setItem(deadlineDismissStorageKey(id), '1');
      } catch {
        /* ignore quota / private mode */
      }
      onDismiss?.();
    },
    classNames: {
      toast: cn(
        'border-2 shadow-lg ring-1 ring-warning/20',
        urgent ? 'border-warning/80 bg-warning/20' : 'border-warning/50 bg-warning/12',
      ),
      title: 'font-display font-semibold text-foreground',
      description: 'text-muted-foreground text-[13px] leading-snug',
    },
    icon: (
      <TriangleAlert
        className="w-5 h-5 shrink-0 text-warning"
        strokeWidth={2}
        aria-hidden
      />
    ),
  });
}

export function buildDeadlineToastDescription(opts: {
  title: string;
  kind: DeadlineReminderKind;
  stakeFormatted?: string | null;
}) {
  const { title, kind, stakeFormatted } = opts;
  const timeLabel = kind === 'deadline_6h' ? 'less than 6 hours' : 'less than 24 hours';

  return (
    <span>
      <span className="text-foreground">"{title}"</span>
      {' is due in '}
      <span className="font-semibold text-warning">{timeLabel}</span>
      {stakeFormatted ? (
        <>
          {' · stake '}
          <span className="font-semibold text-primary">{stakeFormatted}</span>
        </>
      ) : null}
      .
    </span>
  );
}
