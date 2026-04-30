import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useGoals } from '@/hooks/useGoals';
import {
  Calendar,
  Check,
  Eye,
  Lock,
  Plus,
  Target,
  Trophy,
  AlertTriangle,
  DollarSign,
} from 'lucide-react';
import UserProfilePopover from '@/components/UserProfilePopover';
import { GoalsListSkeleton } from '@/components/PageSkeletons';
import { formatStakeAmount } from '@/lib/currency';

function formatDate(d: Date) {
  try {
    return d.toLocaleString();
  } catch {
    return String(d);
  }
}

/** Same gavel glyph as StakeCard (self-judge row), sized to match inline meta icons */
function JudgeGavelIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 256 256"
      className={className}
      aria-hidden
    >
      <path
        fill="currentColor"
        d="M243.32,116.69l-16-16a16,16,0,0,0-20.84-1.53L156.84,49.52a16,16,0,0,0-1.52-20.84l-16-16a16,16,0,0,0-22.63,0l-64,64a16,16,0,0,0,0,22.63l16,16a16,16,0,0,0,20.83,1.52L96.69,124,31.31,189.38A25,25,0,0,0,66.63,224.7L132,159.32l7.17,7.16a16,16,0,0,0,1.52,20.84l16,16a16,16,0,0,0,22.63,0l64-64A16,16,0,0,0,243.32,116.69ZM80,104,64,88l64-64,16,16ZM55.32,213.38a9,9,0,0,1-12.69,0,9,9,0,0,1,0-12.68L108,135.32,120.69,148ZM101,105.66,145.66,61,195,110.34,150.35,155ZM168,192l-16-16,4-4h0l56-56h0l4-4,16,16Z"
      />
    </svg>
  );
}

export default function History() {
  const { goals, loading } = useGoals();

  const pastGoals = useMemo(() => {
    const now = Date.now();
    return goals
      .filter((g) => {
        if (g.status === 'completed' || g.status === 'failed') return true;
        // Edge case: deadline passed before auto-expire marks failed
        return Boolean(g.deadline?.getTime?.() && g.deadline.getTime() < now && g.status === 'active');
      })
      .sort((a, b) => (b.deadline?.getTime?.() ?? 0) - (a.deadline?.getTime?.() ?? 0));
  }, [goals]);

  return (
    <div className="min-h-screen bg-background pb-28">
      <div className="px-6 pt-12 pb-6 flex items-start justify-between gap-4">
        <div className="flex-1">
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-xs uppercase tracking-widest text-muted-foreground"
          >
            History
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-3xl font-display font-extrabold text-foreground mt-2 tracking-tight"
          >
            Past goals
          </motion.h1>
        </div>
        <UserProfilePopover />
      </div>

      <div className="px-6 space-y-4">
        {loading && <GoalsListSkeleton rows={4} />}

        {!loading && pastGoals.length === 0 && (
          <div className="p-5 rounded-[20px] bg-card border border-border">
            <p className="text-sm text-muted-foreground">No past goals yet.</p>
            <p className="text-xs text-muted-foreground mt-1">
              Completed and not completed goals appear here as soon as they are resolved.
            </p>
          </div>
        )}

        {pastGoals.map((g, i) => {
          const statusIcon =
            g.status === 'completed' ? Trophy : g.status === 'failed' ? AlertTriangle : Target;
          const StatusIcon = statusIcon;

          return (
            <motion.div
              key={g.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06, type: 'spring', stiffness: 300, damping: 30 }}
              className="p-5 rounded-[20px] bg-card border border-border"
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                    g.status === 'completed'
                      ? 'bg-primary/15'
                      : g.status === 'failed'
                        ? 'bg-warning/15'
                        : 'bg-muted'
                  }`}
                >
                  <StatusIcon
                    className={`w-4 h-4 shrink-0 ${
                      g.status === 'completed'
                        ? 'text-primary'
                        : g.status === 'failed'
                          ? 'text-warning'
                          : 'text-muted-foreground'
                    }`}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-display font-semibold text-foreground truncate leading-tight">{g.title}</p>
                  {g.description && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{g.description}</p>
                  )}
                </div>
              </div>

              {/* Top meta row: stake + visibility on left, created + completion on right */}
              <div className="grid grid-cols-[1fr_210px] gap-3 mt-3">
                <div className="flex flex-col gap-1 text-xs tabular-nums text-muted-foreground">
                  <span className="inline-flex items-center gap-2">
                    <DollarSign className="w-3.5 h-3.5" />
                    <span>{formatStakeAmount(g.stake, g.stakeCurrency)}</span>
                  </span>
                  <span className="inline-flex items-center gap-2 not-italic tabular-nums">
                    {g.isPrivate ? <Lock className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    <span className="not-italic">{g.isPrivate ? 'private' : 'public'}</span>
                  </span>
                </div>
                <div className="justify-self-end w-[210px] flex flex-col items-start gap-1 text-xs tabular-nums">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <Plus className="w-3.5 h-3.5 shrink-0" aria-hidden />
                    <span className="min-w-0 tabular-nums">
                      Created {formatDate(g.createdAt)}
                    </span>
                  </span>
                  {g.status === 'completed' ? (
                    <span className="flex items-center gap-1.5 text-emerald-400">
                      <Check className="w-3.5 h-3.5 shrink-0" aria-hidden />
                      <span className="min-w-0 tabular-nums">
                        Completed {formatDate(g.resolvedAt ?? g.deadline)}
                      </span>
                    </span>
                  ) : g.status === 'failed' ? (
                    <span className="text-warning">
                      Not completed
                      {g.resolvedAt ? ` (${formatDate(g.resolvedAt)})` : ''}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Deadline passed</span>
                  )}
                </div>
              </div>

              {/* Second section: judge on left, deadline on right (aligned with right column above) */}
              <div className="grid grid-cols-[1fr_210px] gap-3 mt-2 items-center">
                <div className="flex items-center gap-2 text-xs tabular-nums text-muted-foreground min-w-0">
                  <JudgeGavelIcon className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">{g.judge?.name ?? 'You'}</span>
                </div>
                <div className="justify-self-end w-[210px] flex items-center gap-2 text-xs tabular-nums text-muted-foreground">
                  <Calendar className="w-3.5 h-3.5 shrink-0" />
                  <span>deadline {formatDate(g.deadline)}</span>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

