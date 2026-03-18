import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useGoals } from '@/hooks/useGoals';
import { ArrowLeft, Calendar, Eye, Lock, Target, Trophy, AlertTriangle, DollarSign, User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import UserProfilePopover from '@/components/UserProfilePopover';

function formatDate(d: Date) {
  try {
    return d.toLocaleString();
  } catch {
    return String(d);
  }
}

export default function History() {
  const navigate = useNavigate();
  const { goals, loading } = useGoals();

  const pastGoals = useMemo(() => {
    const now = Date.now();
    return goals
      .filter((g) => g.deadline?.getTime?.() ? g.deadline.getTime() < now : false)
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
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="mt-4 inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back
          </button>
        </div>
        <UserProfilePopover />
      </div>

      <div className="px-6 space-y-4">
        {loading && (
          <div className="p-5 rounded-[20px] bg-card border border-border">
            <p className="text-sm text-muted-foreground">Loading…</p>
          </div>
        )}

        {!loading && pastGoals.length === 0 && (
          <div className="p-5 rounded-[20px] bg-card border border-border">
            <p className="text-sm text-muted-foreground">No past goals yet.</p>
            <p className="text-xs text-muted-foreground mt-1">Only goals with a passed deadline show here.</p>
          </div>
        )}

        {pastGoals.map((g, i) => {
          const statusIcon =
            g.status === 'completed' ? Trophy : g.status === 'failed' ? AlertTriangle : Target;
          const StatusIcon = statusIcon;
          const statusColor =
            g.status === 'completed' ? 'text-primary' : g.status === 'failed' ? 'text-warning' : 'text-muted-foreground';

          return (
            <motion.div
              key={g.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06, type: 'spring', stiffness: 300, damping: 30 }}
              className="p-5 rounded-[20px] bg-card border border-border"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-display font-semibold text-foreground truncate">{g.title}</p>
                  {g.description && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{g.description}</p>
                  )}
                </div>
              </div>

              {/* Top meta row: stake + visibility on left, created + completion on right */}
              <div className="grid grid-cols-[1fr_210px] gap-3 mt-3">
                <div className="flex flex-col gap-1 text-xs text-muted-foreground tabular-nums">
                  <span className="inline-flex items-center gap-2">
                    <DollarSign className="w-3.5 h-3.5" />
                    <span>${g.stake.toFixed(2)}</span>
                  </span>
                  <span className="inline-flex items-center gap-2 not-italic tabular-nums">
                    {g.isPrivate ? <Lock className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    <span className="not-italic">{g.isPrivate ? 'private' : 'public'}</span>
                  </span>
                </div>
                <div className="justify-self-end w-[210px] flex flex-col items-start gap-1">
                  <span className="text-[11px] text-muted-foreground tabular-nums">
                    Created {formatDate(g.createdAt)}
                  </span>
                  <span className="text-xs">
                    {g.status === 'completed' ? (
                      <span className="text-emerald-400 tabular-nums">
                        completed {formatDate(g.deadline)}
                      </span>
                    ) : (
                      <span className="text-warning">was not completed</span>
                    )}
                  </span>
                </div>
              </div>

              {/* Second section: judge on left, deadline on right (aligned with right column above) */}
              <div className="grid grid-cols-[1fr_210px] gap-3 mt-2 items-center">
                <div className="flex items-center gap-2 text-xs text-muted-foreground min-w-0">
                  <User className="w-3.5 h-3.5" />
                  <span className="truncate">{g.judge?.name ?? 'You'}</span>
                </div>
                <div className="justify-self-end w-[210px] flex items-center gap-2 text-xs text-muted-foreground">
                  <Calendar className="w-3.5 h-3.5" />
                  <span className="tabular-nums">deadline {formatDate(g.deadline)}</span>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

