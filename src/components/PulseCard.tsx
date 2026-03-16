import { motion } from 'framer-motion';
import { PulseItem } from '@/lib/types';
import { Zap, Trophy, AlertTriangle, Plus, Bell } from 'lucide-react';

const icons = {
  created: Plus,
  completed: Trophy,
  failed: AlertTriangle,
  staked: Zap,
};

const labels = {
  created: 'set a new goal',
  completed: 'completed',
  failed: 'lost stake on',
  staked: 'is risking',
};

function timeAgo(date: Date) {
  const mins = Math.floor((Date.now() - date.getTime()) / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function PulseCard({ item, index }: { item: PulseItem; index: number }) {
  const Icon = icons[item.action];
  const isFailure = item.action === 'failed';
  const isSuccess = item.action === 'completed';

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08, type: 'spring', stiffness: 300, damping: 30 }}
      className="p-5 rounded-[20px] bg-card border border-border"
    >
      <div className="flex items-start gap-4">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
          isFailure ? 'bg-warning/15' : isSuccess ? 'bg-primary/15' : 'bg-muted'
        }`}>
          <Icon className={`w-5 h-5 ${
            isFailure ? 'text-warning' : isSuccess ? 'text-primary' : 'text-muted-foreground'
          }`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm">
            <span className="font-semibold text-foreground">{item.userName}</span>{' '}
            <span className="text-muted-foreground">{labels[item.action]}</span>{' '}
            <span className="font-medium text-foreground">"{item.goalTitle}"</span>
          </p>
          {item.action === 'staked' && (
            <p className="text-primary font-display font-bold text-lg mt-1 tabular-nums">
              ${item.stake.toFixed(2)}
            </p>
          )}
          {item.action === 'failed' && (
            <p className="text-warning font-display font-bold text-lg mt-1 tabular-nums">
              -${item.stake.toFixed(2)}
            </p>
          )}
          <p className="text-xs text-muted-foreground mt-2">{timeAgo(item.timestamp)}</p>
        </div>
        <button className="p-2 rounded-xl hover:bg-muted transition-colors shrink-0" title="Nudge">
          <Bell className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>
    </motion.div>
  );
}
