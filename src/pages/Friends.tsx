import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { FriendCard } from '@/components/FriendCard';
import { supabase } from '@/integrations/supabase/client';
import UserProfilePopover from '@/components/UserProfilePopover';
import { useAuth } from '@/hooks/useAuth';
import { useFriendsData } from '@/hooks/useFriendsData';
import { queryKeys } from '@/lib/queryKeys';
import type { ProfileLite } from '@/lib/fetchers/tabData';
import { Check, Copy, Search, Share2, X } from 'lucide-react';
import { toast } from 'sonner';
import { FriendsPageSkeleton } from '@/components/PageSkeletons';

export default function Friends() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { friends, incoming, loading } = useFriendsData();
  const [searchCode, setSearchCode] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<ProfileLite | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [myFriendCode, setMyFriendCode] = useState<string | null>(null);
  const [friendCodeDbReady, setFriendCodeDbReady] = useState(true);

  useEffect(() => {
    if (!user?.id) {
      setMyFriendCode(null);
      return;
    }
    setFriendCodeDbReady(true);
    const localKey = `friend_code_${user.id}`;
    const cached = window.localStorage.getItem(localKey);
    if (cached && /^\d{11}$/.test(cached)) {
      setMyFriendCode(cached);
    }

    let cancelled = false;
    void supabase
      .from('profiles')
      .select('friend_code')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          const msg = String((error as { message?: string })?.message ?? '').toLowerCase();
          if (
            msg.includes('friend_code') &&
            (msg.includes('column') || msg.includes('schema') || msg.includes('does not exist'))
          ) {
            setFriendCodeDbReady(false);
          }
          return;
        }
        const code = (data as { friend_code?: string | null } | null)?.friend_code;
        const valid = typeof code === 'string' && /^\d{11}$/.test(code) ? code : null;
        setMyFriendCode(valid);
        if (valid) window.localStorage.setItem(localKey, valid);
      });

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const invalidateFriends = () => {
    if (user?.id) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.friends(user.id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.pulse(user.id) });
    }
  };

  const normalizedSearchCode = useMemo(() => searchCode.replace(/\D/g, '').slice(0, 11), [searchCode]);
  const inviteUrl = useMemo(() => `${window.location.origin}/auth`, []);

  const shareInviteLink = async () => {
    const text = myFriendCode
      ? `Join me on Owe It: ${inviteUrl}\nMy Friend ID: ${myFriendCode}`
      : `Join me on Owe It: ${inviteUrl}`;
    try {
      if (navigator.share) {
        await navigator.share({
          title: 'Join me on Owe It',
          text,
          url: inviteUrl,
        });
        return;
      }
    } catch (error) {
      // User cancelling the native share sheet is expected; only log unexpected errors.
      const msg = String((error as { message?: string })?.message ?? '').toLowerCase();
      if (msg.includes('abort') || msg.includes('cancel')) return;
      console.error('Invite share error', error);
    }

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        toast.success('Invite link copied.');
        return;
      }
    } catch (error) {
      console.error('Invite clipboard error', error);
    }

    toast.error('Could not share the invite link.');
  };

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
    invalidateFriends();
  };

  const accept = async (requestId: string) => {
    const { error } = await supabase.rpc('accept_friend_request', { p_request_id: requestId });
    if (error) {
      console.error('Accept request error', error);
      return;
    }
    invalidateFriends();
  };

  const ignore = async (requestId: string) => {
    const { error } = await supabase.rpc('ignore_friend_request', { p_request_id: requestId });
    if (error) {
      console.error('Ignore request error', error);
      return;
    }
    invalidateFriends();
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
        {loading ? (
          <FriendsPageSkeleton />
        ) : (
          <>
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.02 }}
          className="p-5 rounded-[20px] bg-card border border-border"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-widest text-muted-foreground">Your account ID</p>
              <p className="mt-2 font-display font-semibold text-foreground tabular-nums text-xl tracking-wide break-all">
                {friendCodeDbReady ? (myFriendCode ?? '…') : 'Unavailable'}
              </p>
            </div>
            <button
              type="button"
              disabled={!friendCodeDbReady || !myFriendCode}
              className="shrink-0 inline-flex items-center justify-center rounded-xl p-2.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-40 disabled:pointer-events-none"
              aria-label="Copy account ID"
              onClick={async () => {
                if (!myFriendCode) return;
                try {
                  if (navigator.clipboard?.writeText) {
                    await navigator.clipboard.writeText(myFriendCode);
                    toast.success('Account ID copied.');
                    return;
                  }
                } catch (e) {
                  console.error('Clipboard error', e);
                }
                try {
                  const ta = document.createElement('textarea');
                  ta.value = myFriendCode;
                  ta.style.position = 'fixed';
                  ta.style.left = '-9999px';
                  document.body.appendChild(ta);
                  ta.focus();
                  ta.select();
                  document.execCommand('copy');
                  document.body.removeChild(ta);
                  toast.success('Account ID copied.');
                } catch (e) {
                  console.error('Clipboard fallback error', e);
                  toast.error('Could not copy.');
                }
              }}
            >
              <Copy className="h-4 w-4" />
            </button>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.04 }}
          className="p-5 rounded-[20px] bg-card border border-border"
        >
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <h4 className="font-display font-semibold text-foreground">Invite by link</h4>
              <p className="text-xs text-muted-foreground mt-0.5">
                Send a signup link so your friends can create an Owe It account.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void shareInviteLink()}
              className="h-11 px-4 rounded-2xl bg-primary text-primary-foreground font-display font-bold inline-flex items-center gap-2 shrink-0"
            >
              <Share2 className="w-4 h-4" />
              Share link
            </button>
          </div>
        </motion.div>

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
          </>
        )}
      </div>
    </div>
  );
}
