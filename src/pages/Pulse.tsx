import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { PulseCard } from '@/components/PulseCard';
import { Clock } from 'lucide-react';
import UserProfilePopover from '@/components/UserProfilePopover';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { PulseItem } from '@/lib/types';

export default function Pulse() {
  const { user } = useAuth();
  const [items, setItems] = useState<PulseItem[]>([]);

  const since = useMemo(() => new Date(Date.now() - 24 * 60 * 60 * 1000), []);

  useEffect(() => {
    if (!user?.id) return;

    const load = async () => {
      // Friends list
      const { data: edges, error: edgesError } = await supabase
        .from('friendships')
        .select('friend_user_id')
        .eq('user_id', user.id);

      if (edgesError) {
        console.error('Error loading friendships for pulse', edgesError);
        setItems([]);
        return;
      }

      const friendIds = (edges ?? []).map((e: any) => e.friend_user_id).filter(Boolean);
      if (friendIds.length === 0) {
        setItems([]);
        return;
      }

      const { data: events, error: eventsError } = await supabase
        .from('pulse_events')
        .select('id,user_id,action,goal_title,stake,created_at')
        .in('user_id', friendIds)
        .gte('created_at', since.toISOString())
        .order('created_at', { ascending: false })
        .limit(50);

      if (eventsError) {
        console.error('Error loading pulse events', eventsError);
        setItems([]);
        return;
      }

      const uniqueUserIds = Array.from(new Set((events ?? []).map((e: any) => e.user_id)));
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id,display_name,avatar_url')
        .in('id', uniqueUserIds);

      const nameById = new Map<string, { name: string; avatar: string }>();
      (profiles ?? []).forEach((p: any) => {
        nameById.set(p.id, { name: p.display_name ?? 'User', avatar: p.avatar_url ?? '' });
      });

      const mapped: PulseItem[] = (events ?? []).map((e: any) => {
        const profile = nameById.get(e.user_id);
        return {
          id: e.id,
          userId: e.user_id,
          userName: profile?.name ?? 'User',
          userAvatar: profile?.avatar ?? '',
          action: e.action,
          goalTitle: e.goal_title,
          stake: Number(e.stake ?? 0),
          timestamp: new Date(e.created_at),
        } as PulseItem;
      });

      setItems(mapped);
    };

    load();
  }, [since, user?.id]);

  return (
    <div className="min-h-screen bg-background pb-28">
      <div className="px-6 pt-12 pb-6 flex items-start justify-between gap-4">
        <div>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-xs uppercase tracking-widest text-muted-foreground"
          >
            Social Pulse
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-3xl font-display font-extrabold text-foreground mt-2 tracking-tight"
          >
            What's happening
          </motion.h1>
          <div className="flex items-center gap-2 mt-3">
            <Clock className="w-3 h-3 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">Last 24 hours</p>
          </div>
        </div>
        <UserProfilePopover />
      </div>

      <div className="px-6 space-y-4">
        {items.map((item, i) => (
          <PulseCard key={item.id} item={item} index={i} />
        ))}
      </div>
    </div>
  );
}
