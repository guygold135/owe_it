import { motion } from 'framer-motion';
import { Goal } from '@/lib/types';
import { useCountdown } from '@/hooks/useCountdown';
import { Lock, Eye, User } from 'lucide-react';
import { formatStakeAmount } from '@/lib/currency';

const springTransition = { type: 'spring' as const, stiffness: 300, damping: 30 };

export function StakeCard({ goal, onClick }: { goal: Goal; onClick?: () => void }) {
  const { days, hours, minutes, seconds, isUrgent, isExpired, urgency } = useCountdown(goal.deadline);

  const borderClass = goal.status === 'active'
    ? isUrgent ? 'animate-pulse-border-warning' : 'animate-pulse-border'
    : 'border-border';

  const accentColor = isUrgent ? 'text-warning' : 'text-primary';
  const dotColor =
    goal.status === 'completed'
      ? 'bg-primary'
      : goal.status === 'failed'
        ? 'bg-warning'
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

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={springTransition}
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
      onClick={onClick}
      className={`p-6 rounded-[24px] bg-card border ${borderClass} relative overflow-hidden cursor-pointer`}
    >
      {/* Top row */}
      <div className="flex justify-between items-start">
        <span className={`text-xs tracking-widest uppercase tabular-nums font-medium ${statusLabelClass}`}>
          {statusLabel}
        </span>
        <div className="flex items-center gap-2">
          {goal.isPrivate && <Lock className="w-3 h-3 text-muted-foreground" />}
          <div className={`h-2 w-2 rounded-full ${dotColor} ${goal.status === 'active' ? 'animate-pulse' : ''}`} />
        </div>
      </div>

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
        <div className="mt-3">
          <div className={`text-3xl font-display font-extrabold tabular-nums ${accentColor}`}>
            {formatStakeAmount(goal.stake, goal.stakeCurrency)}
          </div>
          {goal.stakeCharityName ? (
            <p className="mt-1 text-xs text-muted-foreground">
              If uncompleted → <span className="text-foreground font-medium">{goal.stakeCharityName}</span>{' '}
              <span className="text-muted-foreground/80">(charity)</span>
            </p>
          ) : goal.stakeRecipientName ? (
            <p className="mt-1 text-xs text-muted-foreground">
              If uncompleted → <span className="text-foreground font-medium">{goal.stakeRecipientName}</span>
            </p>
          ) : null}
        </div>
      )}

      {/* Bottom row */}
      <div className="mt-6 flex items-center gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted">
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
        {!goal.judge.isSelf && (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted">
            {goal.judge.avatar ? (
              <img src={goal.judge.avatar} alt="" className="h-full w-full object-cover" />
            ) : (
              <User className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        )}
        <span className="text-sm text-muted-foreground">
          {goal.judge.isSelf ? (
            <span>Self-judged <span className="text-warning text-xs">(risky)</span></span>
          ) : (
            <>Judged by <span className="text-foreground font-medium">{goal.judge.name}</span></>
          )}
        </span>
      </div>

      {/* Inner glow for active stakes */}
      {goal.status === 'active' && goal.stake > 0 && (
        <div className={`absolute inset-0 pointer-events-none rounded-[24px] ${isUrgent ? 'shadow-[inset_0_1px_2px_rgba(255,140,50,0.1)]' : 'shadow-[inset_0_1px_2px_rgba(100,255,150,0.08)]'}`} />
      )}
    </motion.div>
  );
}
