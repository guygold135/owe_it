import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { AlertTriangle, Calendar, Eye, Lock, Trophy } from 'lucide-react';
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
  const isFailedSpotlight = goals.length === 1 && goals[0].status === 'failed';
  const wrapperClass = isFailedSpotlight
    ? 'mb-4 rounded-[24px] border border-orange-400/30 bg-orange-500/10 p-5 shadow-sm'
    : 'mb-4 rounded-[24px] border border-primary/25 bg-primary/5 p-5 shadow-sm';
  const headingClass = isFailedSpotlight
    ? 'text-xs uppercase tracking-widest text-orange-500 font-medium mb-3'
    : 'text-xs uppercase tracking-widest text-primary font-medium mb-3';
  const headingText = isFailedSpotlight ? 'Just resolved - uncompleted' : 'Just resolved';

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className={wrapperClass}
    >
      <p className={headingClass}>{headingText}</p>
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
                    <span className="text-orange-500">Uncompleted</span>
                  )}
                  <span className="text-muted-foreground"> · {formatStakeAmount(g.stake, g.stakeCurrency)}</span>
                </p>
                {g.description ? (
                  <p className="text-xs text-muted-foreground mt-2 line-clamp-3">{g.description}</p>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 256 256"
                      className="w-3.5 h-3.5 shrink-0"
                      aria-hidden
                    >
                      <path
                        fill="currentColor"
                        d="M243.32,116.69l-16-16a16,16,0,0,0-20.84-1.53L156.84,49.52a16,16,0,0,0-1.52-20.84l-16-16a16,16,0,0,0-22.63,0l-64,64a16,16,0,0,0,0,22.63l16,16a16,16,0,0,0,20.83,1.52L96.69,124,31.31,189.38A25,25,0,0,0,66.63,224.7L132,159.32l7.17,7.16a16,16,0,0,0,1.52,20.84l16,16a16,16,0,0,0,22.63,0l64-64A16,16,0,0,0,243.32,116.69ZM80,104,64,88l64-64,16,16ZM55.32,213.38a9,9,0,0,1-12.69,0,9,9,0,0,1,0-12.68L108,135.32,120.69,148ZM101,105.66,145.66,61,195,110.34,150.35,155ZM168,192l-16-16,4-4h0l56-56h0l4-4,16,16Z"
                      />
                    </svg>
                    {g.judge?.name ?? 'Judge'}
                  </span>
                  <span aria-hidden className="text-muted-foreground">
                    ·
                  </span>
                  <span className="inline-flex items-center gap-1.5 tabular-nums">
                    <Calendar className="w-3.5 h-3.5" />
                    Deadline {formatWhen(g.deadline)}
                  </span>
                  <span aria-hidden className="text-muted-foreground">
                    ·
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
