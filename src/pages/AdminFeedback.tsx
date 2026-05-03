import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type FeedbackRow = {
  id: string;
  user_id: string;
  user_email: string | null;
  category: string;
  message: string;
  created_at: string;
};

type SortMode = 'date_newest' | 'date_oldest' | 'category_az' | 'category_za';

function sortRowsByDate(rows: FeedbackRow[], direction: 'asc' | 'desc'): FeedbackRow[] {
  const mult = direction === 'desc' ? -1 : 1;
  return [...rows].sort(
    (a, b) => mult * (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
  );
}

export default function AdminFeedback() {
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackRow[]>([]);
  const [sortMode, setSortMode] = useState<SortMode>('date_newest');

  const grouped = useMemo(() => {
    const map = new Map<string, FeedbackRow[]>();
    for (const f of feedback) {
      const key = f.category || 'Other';
      const list = map.get(key) ?? [];
      list.push(f);
      map.set(key, list);
    }
    for (const [, list] of map) {
      list.sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
    }
    const entries = Array.from(map.entries());
    entries.sort(([a], [b]) =>
      sortMode === 'category_za' ? b.localeCompare(a) : a.localeCompare(b),
    );
    return entries;
  }, [feedback, sortMode]);

  const flatByDate = useMemo(() => {
    if (sortMode === 'date_newest') return sortRowsByDate(feedback, 'desc');
    if (sortMode === 'date_oldest') return sortRowsByDate(feedback, 'asc');
    return [];
  }, [feedback, sortMode]);

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-feedback', {
        body: {},
      });
      if (error) throw new Error(error.message || 'Could not load feedback.');
      if (data && typeof data === 'object' && 'error' in data) {
        const errVal = (data as { error?: unknown }).error;
        if (errVal) throw new Error(String(errVal));
      }
      setFeedback((data?.feedback as FeedbackRow[]) ?? []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not load feedback.';
      toast.error(msg);
      setFeedback([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
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
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2 flex-1 min-w-0 max-w-sm">
            <label htmlFor="admin-feedback-sort" className="text-xs font-medium text-muted-foreground">
              Sort by
            </label>
            <Select
              value={sortMode}
              onValueChange={(v) => setSortMode(v as SortMode)}
            >
              <SelectTrigger id="admin-feedback-sort" className="rounded-xl">
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="date_newest">Date — newest first</SelectItem>
                <SelectItem value="date_oldest">Date — oldest first</SelectItem>
                <SelectItem value="category_az">Category — A to Z</SelectItem>
                <SelectItem value="category_za">Category — Z to A</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between gap-3 sm:justify-end">
            <div className="text-xs text-muted-foreground">
              {loading ? 'Loading…' : `${feedback.length} total submissions`}
            </div>
            <Button variant="outline" disabled={loading} onClick={() => void load()}>
              Refresh
            </Button>
          </div>
        </div>

        {loading && feedback.length === 0 ? (
          <div className="min-h-[160px] flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          </div>
        ) : null}

        {!loading && feedback.length === 0 ? (
          <div className="p-4 rounded-2xl border border-border bg-card/50 text-sm text-muted-foreground">
            No feedback yet.
          </div>
        ) : null}

        {(sortMode === 'date_newest' || sortMode === 'date_oldest') && feedback.length > 0 ? (
          <div className="space-y-4">
            {flatByDate.map((f) => (
              <div
                key={f.id}
                className="rounded-2xl border border-border bg-card p-4 space-y-2"
              >
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded-full bg-muted px-2 py-0.5 font-medium text-foreground">
                    {f.category || 'Other'}
                  </span>
                  <span className="text-muted-foreground">
                    {new Date(f.created_at).toLocaleString()}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground/90">{f.user_email ?? f.user_id}</span>
                </div>
                <div className="text-sm whitespace-pre-wrap">{f.message}</div>
              </div>
            ))}
          </div>
        ) : null}

        {(sortMode === 'category_az' || sortMode === 'category_za') && grouped.length > 0
          ? grouped.map(([category, items]) => (
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
            ))
          : null}
      </div>
    </div>
  );
}

