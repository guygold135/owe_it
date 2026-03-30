import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';

type FeedbackRow = {
  id: string;
  user_id: string;
  user_email: string | null;
  category: string;
  message: string;
  created_at: string;
};

export default function AdminFeedback() {
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackRow[]>([]);

  const grouped = useMemo(() => {
    const map = new Map<string, FeedbackRow[]>();
    for (const f of feedback) {
      const key = f.category || 'Other';
      const list = map.get(key) ?? [];
      list.push(f);
      map.set(key, list);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [feedback]);

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-feedback', {
        body: {},
      });
      if (error) throw new Error(error.message || 'Could not load feedback.');
      if (data && typeof data === 'object' && 'error' in data && (data as any).error) {
        throw new Error(String((data as any).error));
      }
      setFeedback((data?.feedback as FeedbackRow[]) ?? []);
    } catch (err: any) {
      const msg = err?.message ?? 'Could not load feedback.';
      toast.error(msg);
      setFeedback([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-background pb-28">
      <div className="px-6 pt-12 pb-6">
        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-3xl font-display font-extrabold text-foreground tracking-tight"
        >
          Admin Feedback
        </motion.h1>
        <p className="text-sm text-muted-foreground mt-2">All feedback submitted by users.</p>
      </div>

      <div className="px-6 space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs text-muted-foreground">
            {loading ? 'Loading…' : `${feedback.length} total submissions`}
          </div>
          <Button variant="outline" disabled={loading} onClick={() => void load()}>
            Refresh
          </Button>
        </div>

        {loading && feedback.length === 0 ? (
          <div className="min-h-[160px] flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          </div>
        ) : null}

        {!loading && grouped.length === 0 ? (
          <div className="p-4 rounded-2xl border border-border bg-card/50 text-sm text-muted-foreground">
            No feedback yet.
          </div>
        ) : null}

        {grouped.map(([category, items]) => (
          <div key={category} className="p-4 rounded-2xl bg-card border border-border space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-foreground">{category}</div>
              <div className="text-xs text-muted-foreground">{items.length}</div>
            </div>

            <div className="space-y-4">
              {items.map((f) => (
                <div
                  key={f.id}
                  className="rounded-xl border border-border bg-background/50 p-3 space-y-2"
                >
                  <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-2">
                    <span className="font-medium text-foreground/90">
                      {f.user_email ?? f.user_id}
                    </span>
                    <span aria-hidden="true">•</span>
                    <span>{new Date(f.created_at).toLocaleString()}</span>
                  </div>
                  <div className="text-sm whitespace-pre-wrap">{f.message}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

