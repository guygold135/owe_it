import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import UserProfilePopover from '@/components/UserProfilePopover';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { CheckCircle2, XCircle, Clock, DollarSign, Calendar, User, Eye, Lock } from 'lucide-react';
import { toast } from 'sonner';

type JudgedGoalRow = {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  stake: number;
  deadline: string;
  created_at: string;
  status: 'active' | 'completed' | 'failed';
  judge_user_id: string | null;
  is_private: boolean;
};

export default function MyJudges() {
  const { user } = useAuth();
  const [rows, setRows] = useState<JudgedGoalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [ownerNames, setOwnerNames] = useState<Map<string, string>>(new Map());

  const now = useMemo(() => Date.now(), []);

  useEffect(() => {
    if (!user?.id) return;
    const load = async () => {
      setLoading(true);
      setLoadError(null);
      const { data, error } = await supabase
        .from('goals')
        .select('id,user_id,title,description,stake,deadline,created_at,status,judge_user_id,is_private')
        .eq('judge_user_id', user.id)
        .order('deadline', { ascending: true });

      if (error) {
        console.error('Error loading judged goals', error);
        const msg = String((error as any)?.message ?? '').toLowerCase();
        if (msg.includes('judge_user_id') && (msg.includes('column') || msg.includes('does not exist') || msg.includes('schema'))) {
          setLoadError('my judges needs a db update');
        } else {
          setLoadError('could not load');
        }
        setRows([]);
        setLoading(false);
        return;
      }

      const list = (data ?? []) as any as JudgedGoalRow[];
      setRows(list);

      const ownerIds = Array.from(new Set(list.map((g) => g.user_id)));
      if (ownerIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id,display_name')
          .in('id', ownerIds);
        const map = new Map<string, string>();
        (profiles ?? []).forEach((p: any) => map.set(p.id, p.display_name ?? 'User'));
        setOwnerNames(map);
      }

      setLoading(false);
    };

    load();
  }, [user?.id]);

  // Auto-fail overdue goals if not marked completed (token-based, no JWT)
  useEffect(() => {
    if (!user?.id) return;
    if (loading) return;
    const overdue = rows.filter((g) => g.status === 'active' && Date.parse(g.deadline) <= Date.now());
    if (overdue.length === 0) return;

    let cancelled = false;
    const baseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    const apikey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
    if (!baseUrl || !apikey) return;

    (async () => {
      for (const g of overdue) {
        if (cancelled) return;
        try {
          const { data: tokenRow, error: insertErr } = await supabase
            .from('goal_resolve_tokens')
            .insert({ goal_id: g.id, outcome: 'failed' })
            .select('id')
            .single();
          if (insertErr || !tokenRow?.id) continue;
          const res = await fetch(`${baseUrl}/functions/v1/resolve-goal`, {
            method: 'POST',
            headers: { apikey, 'Content-Type': 'application/json' },
            body: JSON.stringify({ resolveTokenId: tokenRow.id }),
          });
          if (res.ok) setRows((prev) => prev.filter((r) => r.id !== g.id));
        } catch {
          // ignore
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loading, rows, user?.id]);

  const resolve = async (goalId: string, outcome: 'completed' | 'failed') => {
    if (!user?.id) return;
    setBusyId(goalId);
    try {
      const baseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
      const apikey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
      if (!baseUrl || !apikey) {
        toast.error('Not configured.');
        return;
      }

      const { data: tokenRow, error: insertErr } = await supabase
        .from('goal_resolve_tokens')
        .insert({ goal_id: goalId, outcome })
        .select('id')
        .single();

      if (insertErr || !tokenRow?.id) {
        toast.error(insertErr?.message ?? 'Could not create resolve request.');
        return;
      }

      const res = await fetch(`${baseUrl}/functions/v1/resolve-goal`, {
        method: 'POST',
        headers: { apikey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolveTokenId: tokenRow.id }),
      });

      const text = await res.text();
      if (!res.ok) {
        toast.error(`Could not resolve goal (${res.status})${text ? `: ${text}` : ''}`);
        return;
      }

      if (text) {
        try {
          const json = JSON.parse(text);
          if (json?.error) {
            toast.error(String(json.error));
            return;
          }
        } catch {
          // ignore non-json
        }
      }

      setRows((prev) => prev.filter((r) => r.id !== goalId));
      toast.success(outcome === 'completed' ? 'Marked completed.' : 'Marked uncompleted.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-28">
      <div className="px-6 pt-12 pb-6 flex items-start justify-between gap-4">
        <div>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-xs uppercase tracking-widest text-muted-foreground"
          >
            My Judges
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-3xl font-display font-extrabold text-foreground mt-2 tracking-tight"
          >
            Goals I judge
          </motion.h1>
          <div className="flex items-center gap-2 mt-3">
            <Clock className="w-3 h-3 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">Mark completed/uncompleted after deadline</p>
          </div>
        </div>
        <UserProfilePopover />
      </div>

      <div className="px-6 space-y-4">
        {loading && (
          <div className="p-5 rounded-[20px] bg-card border border-border">
            <p className="text-sm text-muted-foreground">Loading…</p>
          </div>
        )}

        {!loading && loadError && (
          <div className="p-5 rounded-[20px] bg-card border border-border">
            <p className="text-sm text-muted-foreground">{loadError}</p>
          </div>
        )}

        {!loading && rows.length === 0 && (
          <div className="p-5 rounded-[20px] bg-card border border-border">
            <p className="text-sm text-muted-foreground">No goals to judge yet.</p>
          </div>
        )}

        {rows.map((g, i) => {
          const deadlineTs = Date.parse(g.deadline);
          const deadlinePassed = Number.isFinite(deadlineTs) ? deadlineTs <= Date.now() : false;
          const owner = ownerNames.get(g.user_id) ?? 'User';
          const canResolve = g.status === 'active' && !deadlinePassed && busyId !== g.id;

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
                  <p className="text-sm">
                    <span className="font-semibold text-foreground">{owner}</span>{' '}
                    <span className="text-muted-foreground">—</span>{' '}
                    <span className="font-medium text-foreground">"{g.title}"</span>
                  </p>
                  {g.description && (
                    <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{g.description}</p>
                  )}
                </div>
                <div className="shrink-0 text-xs text-muted-foreground">
                  {g.status.toUpperCase()}
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 items-center">
                <div className="flex items-center gap-2 text-xs text-muted-foreground tabular-nums">
                  <DollarSign className="w-3.5 h-3.5" />
                  <span>${Number(g.stake ?? 0).toFixed(2)}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground justify-end tabular-nums">
                  <Calendar className="w-3.5 h-3.5" />
                  <span>deadline {new Date(g.deadline).toLocaleString()}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <User className="w-3.5 h-3.5" />
                  <span>judge: you</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground justify-end">
                  {g.is_private ? <Lock className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  <span>{g.is_private ? 'private' : 'public'}</span>
                </div>
              </div>

              {deadlinePassed && g.status === 'active' && (
                <p className="text-xs text-muted-foreground mt-4">
                  deadline passed — auto marking uncompleted…
                </p>
              )}

              <div className="mt-4 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  disabled={!canResolve}
                  onClick={() => void resolve(g.id, 'completed')}
                  className="w-full py-3 rounded-2xl bg-emerald-500/15 hover:bg-emerald-500/25 transition-colors text-emerald-400 font-display font-bold disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  define goal completed
                </button>
                <button
                  type="button"
                  disabled={!canResolve}
                  onClick={() => void resolve(g.id, 'failed')}
                  className="w-full py-3 rounded-2xl bg-warning/15 hover:bg-warning/25 transition-colors text-warning font-display font-bold disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <XCircle className="w-4 h-4" />
                  define goal uncompleted
                </button>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

