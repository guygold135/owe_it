import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { AlertTriangle, Calendar, Eye, Lock, Trophy, User } from 'lucide-react';
import type { Goal } from '@/lib/types';
import { formatStakeAmount } from '@/lib/currency';

function formatWhen(d: Date) {
  try {
    return d.toLocaleString();
  } catch {
    return String(d);
  }
}

export function ResolvedGoalSpotlight({ goals }: { goals: Goal[] }) {
  if (goals.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-4 rounded-[24px] border border-primary/25 bg-primary/5 p-5 shadow-sm"
    >
      <p className="text-xs uppercase tracking-widest text-primary font-medium mb-3">Just resolved</p>
      <div className="space-y-4">
        {goals.map((g) => (
          <div key={g.id} className="rounded-2xl bg-background/80 border border-border/80 p-4">
            <div className="flex items-start gap-3">
              {g.status === 'completed' ? (
                <Trophy className="w-5 h-5 text-primary shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
              )}
              <div className="min-w-0 flex-1">
                <p className="font-display font-bold text-foreground leading-tight">{g.title}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {g.status === 'completed' ? (
                    <span className="text-emerald-500">Completed</span>
                  ) : (
                    <span className="text-warning">Not completed</span>
                  )}
                  <span className="text-muted-foreground"> · {formatStakeAmount(g.stake, g.stakeCurrency)}</span>
                </p>
                {g.description ? (
                  <p className="text-xs text-muted-foreground mt-2 line-clamp-3">{g.description}</p>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5" />
                    {g.judge?.name ?? 'Judge'}
                  </span>
                  <span className="inline-flex items-center gap-1.5 tabular-nums">
                    <Calendar className="w-3.5 h-3.5" />
                    Deadline {formatWhen(g.deadline)}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    {g.isPrivate ? <Lock className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    {g.isPrivate ? 'Private' : 'Public'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground mt-3">
        Will be removed soon. Full details are always available in{' '}
        <Link to="/history" className="text-primary font-medium underline-offset-2 hover:underline">
          History
        </Link>
        .
      </p>
    </motion.div>
  );
}
