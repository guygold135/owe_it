import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { FriendCard } from '@/components/FriendCard';
import { Friend } from '@/lib/types';
import { supabase } from '@/integrations/supabase/client';
import UserProfilePopover from '@/components/UserProfilePopover';
import { useAuth } from '@/hooks/useAuth';
import { Check, Search, X } from 'lucide-react';

type ProfileLite = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  friend_code: string | null;
};

type IncomingRequest = {
  id: string;
  from_user_id: string;
  created_at: string;
  fromProfile?: ProfileLite | null;
};

type JudgeRequest = {
  id: string;
  requester_user_id: string;
  created_at: string;
  goal_payload: any;
  requesterProfile?: ProfileLite | null;
};

export default function Friends() {
  const { user } = useAuth();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [incoming, setIncoming] = useState<IncomingRequest[]>([]);
  const [judgeRequests, setJudgeRequests] = useState<JudgeRequest[]>([]);
  const [searchCode, setSearchCode] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<ProfileLite | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!user?.id) return;

    const load = async () => {
      // Friendships -> profiles
      const { data: edges, error: edgesError } = await supabase
        .from('friendships')
        .select('friend_user_id, created_at')
        .eq('user_id', user.id);

      if (edgesError) {
        console.error('Error loading friendships', edgesError);
        setFriends([]);
      } else {
        const friendIds = (edges ?? []).map((e: any) => e.friend_user_id).filter(Boolean);
        if (friendIds.length === 0) {
          setFriends([]);
        } else {
          const { data: profiles, error: profilesError } = await supabase
            .from('profiles')
            .select('id, display_name, avatar_url')
            .in('id', friendIds);

          if (profilesError) {
            console.error('Error loading friend profiles', profilesError);
            setFriends([]);
          } else {
            const mapped: Friend[] = (profiles ?? []).map((p: any) => ({
              id: p.id,
              name: p.display_name ?? 'Friend',
              avatar: p.avatar_url ?? '',
              activeGoals: 0,
              completedGoals: 0,
              totalStaked: 0,
            }));
            mapped.sort((a, b) => a.name.localeCompare(b.name));
            setFriends(mapped);
          }
        }
      }

      // Incoming friend requests
      const { data: reqs, error: reqsError } = await supabase
        .from('friend_requests')
        .select('id, from_user_id, created_at, status')
        .eq('to_user_id', user.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (reqsError) {
        console.error('Error loading friend requests', reqsError);
        setIncoming([]);
      } else {
        const fromIds = Array.from(new Set((reqs ?? []).map((r: any) => r.from_user_id).filter(Boolean)));
        let profilesById = new Map<string, ProfileLite>();
        if (fromIds.length > 0) {
          const { data: fromProfiles } = await supabase
            .from('profiles')
            .select('id, display_name, avatar_url, friend_code')
            .in('id', fromIds);
          (fromProfiles ?? []).forEach((p: any) => {
            profilesById.set(p.id, {
              id: p.id,
              display_name: p.display_name ?? '',
              avatar_url: p.avatar_url ?? null,
              friend_code: p.friend_code ?? null,
            });
          });
        }

        setIncoming(
          (reqs ?? []).map((r: any) => ({
            id: r.id,
            from_user_id: r.from_user_id,
            created_at: r.created_at,
            fromProfile: profilesById.get(r.from_user_id) ?? null,
          }))
        );
      }

      // Incoming judge requests
      const { data: jreqs, error: jreqsError } = await supabase
        .from('judge_requests')
        .select('id, requester_user_id, created_at, goal_payload, status')
        .eq('judge_user_id', user.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (jreqsError) {
        console.error('Error loading judge requests', jreqsError);
        setJudgeRequests([]);
      } else {
        const requesterIds = Array.from(new Set((jreqs ?? []).map((r: any) => r.requester_user_id).filter(Boolean)));
        let profilesById = new Map<string, ProfileLite>();
        if (requesterIds.length > 0) {
          const { data: fromProfiles } = await supabase
            .from('profiles')
            .select('id, display_name, avatar_url, friend_code')
            .in('id', requesterIds);
          (fromProfiles ?? []).forEach((p: any) => {
            profilesById.set(p.id, {
              id: p.id,
              display_name: p.display_name ?? '',
              avatar_url: p.avatar_url ?? null,
              friend_code: p.friend_code ?? null,
            });
          });
        }
        setJudgeRequests(
          (jreqs ?? []).map((r: any) => ({
            id: r.id,
            requester_user_id: r.requester_user_id,
            created_at: r.created_at,
            goal_payload: r.goal_payload,
            requesterProfile: profilesById.get(r.requester_user_id) ?? null,
          }))
        );
      }
    };

    load();
  }, [user?.id]);

  const normalizedSearchCode = useMemo(() => searchCode.replace(/\D/g, '').slice(0, 11), [searchCode]);

  const doSearch = async () => {
    setSearchError(null);
    setSearchResult(null);
    if (normalizedSearchCode.length !== 11) {
      setSearchError('Enter an 11-digit Friend ID.');
      return;
    }
    setSearching(true);
    const { data, error } = await supabase
      .from('profiles')
      .select('id, display_name, avatar_url, friend_code')
      .eq('friend_code', normalizedSearchCode)
      .maybeSingle();
    setSearching(false);

    if (error) {
      console.error('Friend search error', error);
      const msg = String((error as any)?.message ?? '').toLowerCase();
      if (msg.includes('friend_code') && (msg.includes('column') || msg.includes('schema') || msg.includes('does not exist'))) {
        setSearchError('friend id is not enabled yet (db update needed)');
      } else {
        setSearchError('account not found');
      }
      return;
    }
    if (!data) {
      setSearchError('No user found with that Friend ID.');
      return;
    }
    setSearchResult({
      id: (data as any).id,
      display_name: (data as any).display_name ?? '',
      avatar_url: (data as any).avatar_url ?? null,
      friend_code: (data as any).friend_code ?? null,
    });
  };

  const sendRequest = async () => {
    if (!normalizedSearchCode || normalizedSearchCode.length !== 11) return;
    setSending(true);
    setSearchError(null);
    const { error } = await supabase.rpc('send_friend_request_by_code', { p_to_friend_code: normalizedSearchCode });
    setSending(false);
    if (error) {
      setSearchError(error.message || 'Could not send request.');
      return;
    }
    setSearchResult(null);
    setSearchCode('');
  };

  const accept = async (requestId: string) => {
    const { error } = await supabase.rpc('accept_friend_request', { p_request_id: requestId });
    if (error) {
      console.error('Accept request error', error);
      return;
    }
    setIncoming((prev) => prev.filter((r) => r.id !== requestId));
    // Reload friends quickly by refetching friendships
    if (user?.id) {
      const { data: edges } = await supabase
        .from('friendships')
        .select('friend_user_id')
        .eq('user_id', user.id);
      const friendIds = (edges ?? []).map((e: any) => e.friend_user_id).filter(Boolean);
      if (friendIds.length === 0) {
        setFriends([]);
      } else {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, display_name, avatar_url')
          .in('id', friendIds);
        const mapped: Friend[] = (profiles ?? []).map((p: any) => ({
          id: p.id,
          name: p.display_name ?? 'Friend',
          avatar: p.avatar_url ?? '',
          activeGoals: 0,
          completedGoals: 0,
          totalStaked: 0,
        }));
        mapped.sort((a, b) => a.name.localeCompare(b.name));
        setFriends(mapped);
      }
    }
  };

  const ignore = async (requestId: string) => {
    const { error } = await supabase.rpc('ignore_friend_request', { p_request_id: requestId });
    if (error) {
      console.error('Ignore request error', error);
      return;
    }
    setIncoming((prev) => prev.filter((r) => r.id !== requestId));
  };

  const acceptJudge = async (requestId: string) => {
    const { error } = await supabase.rpc('accept_judge_request', { p_request_id: requestId });
    if (error) {
      console.error('Accept judge request error', error);
      return;
    }
    setJudgeRequests((prev) => prev.filter((r) => r.id !== requestId));
  };

  const ignoreJudge = async (requestId: string) => {
    const { error } = await supabase.rpc('ignore_judge_request', { p_request_id: requestId });
    if (error) {
      console.error('Ignore judge request error', error);
      return;
    }
    setJudgeRequests((prev) => prev.filter((r) => r.id !== requestId));
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
            Your Circle
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-3xl font-display font-extrabold text-foreground mt-2 tracking-tight"
          >
            Accountability Partners
          </motion.h1>
        </div>
        <UserProfilePopover />
      </div>

      <div className="px-6 space-y-4">
        {/* Judge requests */}
        {judgeRequests.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-5 rounded-[20px] bg-[#0f0f0f] border border-border"
          >
            <p className="text-xs uppercase tracking-widest text-muted-foreground">Judge requests</p>
            <div className="mt-3 space-y-3">
              {judgeRequests.map((r) => {
                const payload = r.goal_payload ?? {};
                const requesterName = r.requesterProfile?.display_name || 'Friend';
                return (
                  <div key={r.id} className="p-4 rounded-2xl bg-card border border-border">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm">
                          <span className="font-semibold text-foreground">{requesterName}</span>{' '}
                          <span className="text-muted-foreground">wants you to judge</span>{' '}
                          <span className="font-medium text-foreground">"{payload.title ?? 'a goal'}"</span>
                        </p>
                        {payload.deadline && (
                          <p className="text-xs text-muted-foreground mt-2 tabular-nums">
                            deadline {new Date(payload.deadline).toLocaleString()}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground mt-1 tabular-nums">
                          stake ${Number(payload.stake ?? 0).toFixed(2)} · {payload.isPrivate ? 'private' : 'public'}
                        </p>
                        {payload.description && (
                          <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{payload.description}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => void acceptJudge(r.id)}
                          className="h-10 px-4 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 transition-colors text-emerald-400 font-display font-bold"
                        >
                          Accept
                        </button>
                        <button
                          type="button"
                          onClick={() => void ignoreJudge(r.id)}
                          className="h-10 px-4 rounded-xl bg-muted hover:bg-muted/80 transition-colors text-muted-foreground font-display font-bold"
                        >
                          Ignore
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* Add a friend by Friend ID */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="p-5 rounded-[20px] bg-card border border-border"
        >
          <div className="flex items-center justify-between gap-4">
            <div>
              <h4 className="font-display font-semibold text-foreground">Add a friend</h4>
              <p className="text-xs text-muted-foreground mt-0.5">search by friend id</p>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <div className="flex-1 relative">
              <Search className="w-4 h-4 text-muted-foreground absolute left-4 top-1/2 -translate-y-1/2" />
              <input
                value={searchCode}
                onChange={(e) => setSearchCode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void doSearch();
                }}
                inputMode="numeric"
                placeholder=""
                className="w-full bg-muted rounded-2xl pl-11 pr-4 py-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary [color-scheme:dark]"
              />
            </div>
            <button
              type="button"
              disabled={searching}
              onClick={() => void doSearch()}
              className="h-12 px-5 rounded-2xl bg-primary text-primary-foreground font-display font-bold disabled:opacity-50"
            >
              {searching ? 'Searching…' : 'Search'}
            </button>
          </div>

          {searchError && <p className="text-xs text-destructive mt-3">{searchError}</p>}

          {searchResult && (
            <div className="mt-4 p-4 rounded-2xl bg-muted border border-border flex items-center gap-4">
              <div className="w-11 h-11 rounded-full bg-background flex items-center justify-center font-display font-bold text-muted-foreground">
                {(searchResult.display_name || 'U').charAt(0)}
              </div>
              <div className="flex-1">
                <p className="font-display font-semibold text-foreground">
                  {searchResult.display_name || 'User'}
                </p>
                <p className="text-xs text-muted-foreground tabular-nums">{searchResult.friend_code}</p>
              </div>
              <button
                type="button"
                onClick={() => void sendRequest()}
                disabled={sending}
                className="px-4 py-2 rounded-xl bg-[#4ade80] text-[#022c22] font-display font-bold disabled:opacity-60"
              >
                {sending ? 'Sending…' : 'Send request'}
              </button>
            </div>
          )}
        </motion.div>

        {/* Incoming requests */}
        {incoming.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="p-5 rounded-[20px] bg-[#0f0f0f] border border-border"
          >
            <p className="text-xs uppercase tracking-widest text-muted-foreground">Friend requests</p>
            <div className="mt-3 space-y-3">
              {incoming.map((r) => (
                <div
                  key={r.id}
                  className="p-4 rounded-2xl bg-card border border-border flex items-center gap-3"
                >
                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center font-display font-bold text-muted-foreground">
                    {(r.fromProfile?.display_name || 'U').charAt(0)}
                  </div>
                  <div className="flex-1">
                    <p className="font-display font-semibold text-foreground">
                      {r.fromProfile?.display_name || 'User'}
                    </p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {r.fromProfile?.friend_code || ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void accept(r.id)}
                      className="h-10 w-10 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 transition-colors flex items-center justify-center"
                      aria-label="Accept"
                    >
                      <Check className="w-4 h-4 text-emerald-400" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void ignore(r.id)}
                      className="h-10 w-10 rounded-xl bg-muted hover:bg-muted/80 transition-colors flex items-center justify-center"
                      aria-label="Ignore"
                    >
                      <X className="w-4 h-4 text-muted-foreground" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {friends.map((friend, i) => (
          <FriendCard key={friend.id} friend={friend} index={i} />
        ))}
      </div>
    </div>
  );
}
