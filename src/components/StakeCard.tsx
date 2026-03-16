import { motion } from 'framer-motion';
import { Goal } from '@/lib/types';
import { useCountdown } from '@/hooks/useCountdown';
import { Lock, Eye, User } from 'lucide-react';

const springTransition = { type: 'spring' as const, stiffness: 300, damping: 30 };

export function StakeCard({ goal, onClick }: { goal: Goal; onClick?: () => void }) {
  const { days, hours, minutes, seconds, isUrgent, isExpired } = useCountdown(goal.deadline);

  const borderClass = goal.status === 'active'
    ? isUrgent ? 'animate-pulse-border-warning' : 'animate-pulse-border'
    : 'border-border';

  const accentColor = isUrgent ? 'text-warning' : 'text-primary';
  const dotColor = isUrgent ? 'bg-warning' : 'bg-primary';

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
        <span className="text-xs tracking-widest text-muted-foreground uppercase tabular-nums">
          {goal.status === 'active' && !isExpired
            ? `${days > 0 ? `${days}d ` : ''}${hours}h ${minutes}m ${seconds}s`
            : goal.status === 'completed' ? 'Completed' : 'Expired'}
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

      {/* Stake amount */}
      {goal.stake > 0 && (
        <div className={`mt-3 text-3xl font-display font-extrabold tabular-nums ${accentColor}`}>
          ${goal.stake.toFixed(2)}
        </div>
      )}

      {/* Bottom row */}
      <div className="mt-6 flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
          <User className="w-4 h-4 text-muted-foreground" />
        </div>
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
