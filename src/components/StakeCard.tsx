import type { CSSProperties } from 'react';
import { motion } from 'framer-motion';
import { Goal } from '@/lib/types';
import { useCountdown } from '@/hooks/useCountdown';
import { Lock, Palette, Trash2, TriangleAlert } from 'lucide-react';
import { formatStakeAmount } from '@/lib/currency';
import {
  GOAL_ACCENT_PRESETS,
  type GoalAccentPreset,
  type GoalOrganizerRow,
} from '@/lib/dashboardGoalOrganizer';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

const springTransition = { type: 'spring' as const, stiffness: 300, damping: 30 };

const ACCENT_DOT: Record<Exclude<GoalAccentPreset, 'default'>, string> = {
  primary: 'bg-primary',
  warning: 'bg-warning',
  sky: 'bg-sky-400',
  violet: 'bg-violet-400',
  rose: 'bg-rose-400',
  emerald: 'bg-emerald-400',
  orange: 'bg-orange-400',
};

export function StakeCard({
  goal,
  onClick,
  tutorialCreated,
  onDeleteTutorialGoal,
  organizerEditMode,
  goalOrganizer,
  onOrganizerAccentChange,
  accentPickerOpen,
  onAccentPickerOpenChange,
}: {
  goal: Goal;
  onClick?: () => void;
  tutorialCreated?: boolean;
  onDeleteTutorialGoal?: (goalId: string) => void;
  organizerEditMode?: boolean;
  goalOrganizer?: GoalOrganizerRow | null;
  onOrganizerAccentChange?: (goalId: string, accent: GoalAccentPreset) => void;
  accentPickerOpen?: boolean;
  onAccentPickerOpenChange?: (open: boolean) => void;
}) {
  const { days, hours, minutes, seconds, isUrgent, isExpired, urgency } = useCountdown(goal.deadline);

  const customAccent =
    goal.status === 'active' &&
    goalOrganizer?.accent &&
    goalOrganizer.accent !== 'default';

  const borderClass = goal.status === 'active'
    ? customAccent
      ? 'border animate-pulse-border-accent'
      : isUrgent
        ? 'animate-pulse-border-warning'
        : 'animate-pulse-border'
    : 'border-border';

  const accentHsl = customAccent
    ? GOAL_ACCENT_PRESETS.find((p) => p.id === goalOrganizer?.accent)?.hsl ??
      GOAL_ACCENT_PRESETS.find((p) => p.id === 'primary')!.hsl
    : undefined;

  /** Stake amount stays mint/primary (or urgent) — not recolored by organizer accent. */
  const stakeAmountClass =
    goal.status === 'completed'
      ? 'text-emerald-500'
      : goal.status === 'failed'
        ? 'text-warning'
        : goal.status === 'active' && !isExpired && isUrgent
          ? 'text-warning'
          : 'text-primary';

  const dotColor =
    goal.status === 'completed'
      ? 'bg-primary'
      : goal.status === 'failed'
        ? 'bg-warning'
        : customAccent && goalOrganizer!.accent !== 'default'
          ? ACCENT_DOT[goalOrganizer.accent as Exclude<GoalAccentPreset, 'default'>]
          : isUrgent
            ? 'bg-warning'
            : 'bg-primary';

  const timePart = `${days > 0 ? `${days}d ` : ''}${hours}h ${minutes}m ${seconds}s`;
  const statusLabel =
    goal.status === 'active' && !isExpired
      ? urgency === 'within6h'
        ? `Urgent · ${timePart}`
        : urgency === 'within24h'
          ? `Due soon · ${timePart}`
          : timePart
      : goal.status === 'completed'
        ? 'Completed'
        : goal.status === 'failed'
          ? 'Uncompleted'
          : 'Expired';

  const statusLabelClass =
    goal.status === 'completed'
      ? 'text-emerald-500'
      : goal.status === 'failed'
        ? 'text-warning'
        : goal.status === 'active' && !isExpired && urgency === 'within6h'
          ? 'text-warning'
          : goal.status === 'active' && !isExpired && urgency === 'within24h'
            ? 'text-amber-500'
            : 'text-muted-foreground';

  const showDeadlineRowAlert =
    goal.status === 'active' && !isExpired && (urgency === 'within6h' || urgency === 'within24h');
  const deadlineAlertIconClass =
    urgency === 'within6h' ? 'text-warning' : 'text-amber-500';

  const cardStyle: CSSProperties | undefined =
    customAccent && accentHsl
      ? { ['--goal-border-accent' as string]: accentHsl }
      : undefined;

  /** Remount border layer when accent changes so `pulse-border-accent` picks up new `--goal-border-accent`. */
  const accentSurfaceKey = goalOrganizer?.accent ?? 'default';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={springTransition}
      whileHover={organizerEditMode ? { scale: 1 } : { scale: 1.01 }}
      whileTap={organizerEditMode ? { scale: 1 } : { scale: 0.99 }}
      onClick={onClick}
      className="relative rounded-[24px]"
    >
      <div
        key={accentSurfaceKey}
        style={cardStyle}
        className={`p-6 rounded-[24px] bg-card border ${borderClass} relative cursor-pointer overflow-hidden`}
      >
      {/* Top row */}
      <div className="flex justify-between items-start gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-1.5">
          {showDeadlineRowAlert ? (
            <TriangleAlert
              className={`h-4 w-4 shrink-0 translate-y-px ${deadlineAlertIconClass}`}
              aria-hidden
            />
          ) : null}
          <span className={`min-w-0 text-xs tracking-widest uppercase tabular-nums font-medium ${statusLabelClass}`}>
            {statusLabel}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {onOrganizerAccentChange && onAccentPickerOpenChange ? (
            <div className="flex h-7 w-7 shrink-0 items-center justify-center">
              {organizerEditMode ? (
                <Popover modal={false} open={accentPickerOpen} onOpenChange={onAccentPickerOpenChange}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      aria-label="Choose outline and dot color"
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Palette className="h-3.5 w-3.5" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent
                    align="end"
                    side="bottom"
                    sideOffset={6}
                    className="w-auto border-border p-3"
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    <p className="mb-2 text-xs font-medium text-muted-foreground">Outline & status dot</p>
                    <div className="flex flex-wrap gap-2">
                      {GOAL_ACCENT_PRESETS.filter((p) => p.id !== 'default').map((p) => {
                        const selected = (goalOrganizer?.accent ?? 'default') === p.id;
                        return (
                          <button
                            key={p.id}
                            type="button"
                            title={p.label}
                            onClick={() => {
                              onOrganizerAccentChange(goal.id, p.id);
                              queueMicrotask(() => onAccentPickerOpenChange?.(false));
                            }}
                            className={`h-8 w-8 rounded-full border-2 transition-transform hover:scale-105 ${
                              selected
                                ? 'border-foreground ring-2 ring-primary ring-offset-2 ring-offset-popover'
                                : 'border-border/80'
                            }`}
                            style={{ background: `hsl(${p.hsl})` }}
                          />
                        );
                      })}
                    </div>
                  </PopoverContent>
                </Popover>
              ) : (
                <span className="block h-7 w-7 shrink-0" aria-hidden />
              )}
            </div>
          ) : null}
          {goal.isPrivate && <Lock className="w-3 h-3 text-muted-foreground" />}
          <div className={`h-2 w-2 shrink-0 rounded-full ${dotColor} ${goal.status === 'active' ? 'animate-pulse' : ''}`} />
        </div>
      </div>
      {tutorialCreated ? (
        <div className="mt-2 flex items-center justify-between gap-3">
          <span className="inline-flex rounded-full border border-warning/40 bg-warning/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-warning">
            Tutorial goal
          </span>
          {onDeleteTutorialGoal ? (
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onDeleteTutorialGoal(goal.id);
              }}
              className="inline-flex items-center gap-1 rounded-lg border border-destructive/40 bg-destructive/10 px-2 py-1 text-xs font-semibold text-destructive hover:bg-destructive/20"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </button>
          ) : null}
        </div>
      ) : null}

      {/* Title */}
      <h3 className="text-xl font-display font-bold mt-3 tracking-tight text-foreground text-balance">
        {goal.title}
      </h3>
      {goal.description ? (
        <p className="mt-2 text-sm text-muted-foreground whitespace-pre-line break-words">
          {goal.description}
        </p>
      ) : null}

      {/* Stake amount */}
      {goal.stake > 0 && (
        <div className={`mt-3 text-3xl font-display font-extrabold tabular-nums ${stakeAmountClass}`}>
          {formatStakeAmount(goal.stake, goal.stakeCurrency)}
        </div>
      )}

      {/* Bottom row */}
      <div className="mt-6 flex items-center gap-3">
        <div className="mb-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-muted">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 256 256"
            className="h-5 w-5 shrink-0 text-muted-foreground"
            aria-hidden
          >
            <path
              fill="currentColor"
              d="M243.32,116.69l-16-16a16,16,0,0,0-20.84-1.53L156.84,49.52a16,16,0,0,0-1.52-20.84l-16-16a16,16,0,0,0-22.63,0l-64,64a16,16,0,0,0,0,22.63l16,16a16,16,0,0,0,20.83,1.52L96.69,124,31.31,189.38A25,25,0,0,0,66.63,224.7L132,159.32l7.17,7.16a16,16,0,0,0,1.52,20.84l16,16a16,16,0,0,0,22.63,0l64-64A16,16,0,0,0,243.32,116.69ZM80,104,64,88l64-64,16,16ZM55.32,213.38a9,9,0,0,1-12.69,0,9,9,0,0,1,0-12.68L108,135.32,120.69,148ZM101,105.66,145.66,61,195,110.34,150.35,155ZM168,192l-16-16,4-4h0l56-56h0l4-4,16,16Z"
            />
          </svg>
        </div>
        {goal.judge.isSelf ? (
          <span className="text-sm text-muted-foreground">
            Self-judged <span className="text-warning text-xs">(risky)</span>
          </span>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Judged by</span>
            <div className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted">
              {goal.judge.avatar ? (
                <img src={goal.judge.avatar} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="text-[10px] font-semibold uppercase text-muted-foreground">
                  {(goal.judge.name || 'J').charAt(0)}
                </span>
              )}
            </div>
            <span className="text-sm font-semibold text-foreground">{goal.judge.name}</span>
          </div>
        )}
      </div>

      {/* Inner glow for active stakes */}
      {goal.status === 'active' && goal.stake > 0 && (
        <div className={`absolute inset-0 pointer-events-none rounded-[24px] ${isUrgent ? 'shadow-[inset_0_1px_2px_rgba(255,140,50,0.1)]' : 'shadow-[inset_0_1px_2px_rgba(100,255,150,0.08)]'}`} />
      )}
      </div>
    </motion.div>
  );
}
