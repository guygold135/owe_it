import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { FriendCard } from '@/components/FriendCard';
import { supabase } from '@/integrations/supabase/client';
import UserProfilePopover from '@/components/UserProfilePopover';
import { useAuth } from '@/hooks/useAuth';
import { useFriendsData } from '@/hooks/useFriendsData';
import { useGoals } from '@/hooks/useGoals';
import { queryKeys } from '@/lib/queryKeys';
import type { FriendsBundle, ProfileLite } from '@/lib/fetchers/tabData';
import { formatStakeAmount } from '@/lib/currency';
import { Check, Copy, Search, Share2, X } from 'lucide-react';
import { toast } from 'sonner';
import { FriendsPageSkeleton } from '@/components/PageSkeletons';
import { HoldToConfirmButton } from '@/components/ui/hold-to-confirm-button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export default function Friends() {
  const { user } = useAuth();
  const { goals } = useGoals();
  const queryClient = useQueryClient();
  const { friends, incoming, loading } = useFriendsData();
  const [searchCode, setSearchCode] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<ProfileLite | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [friendToRemove, setFriendToRemove] = useState<(typeof friends)[number] | null>(null);
  const [removingFriendId, setRemovingFriendId] = useState<string | null>(null);
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

  const normalizedSearchQuery = useMemo(() => searchCode.trim(), [searchCode]);
  const inviteUrl = useMemo(() => `${window.location.origin}/auth`, []);
  const searchResultAlreadyFriend = useMemo(
    () => (searchResult ? friends.some((friend) => friend.id === searchResult.id) : false),
    [friends, searchResult],
  );
  const activeGoalsJudgedByFriend = useMemo(() => {
    if (!friendToRemove) return [];
    return goals.filter(
      (goal) =>
        goal.status === 'active' &&
        !goal.judge?.isSelf &&
        goal.judge?.id === friendToRemove.id,
    );
  }, [friendToRemove, goals]);
  const activeStakedGoalsJudgedByFriend = useMemo(() => {
    if (!friendToRemove) return [];
    return goals.filter(
      (goal) =>
        goal.status === 'active' &&
        goal.stake > 0 &&
        !goal.judge?.isSelf &&
        goal.judge?.id === friendToRemove.id,
    );
  }, [friendToRemove, goals]);
  const activeGoalsJudgedByFriendCount = activeGoalsJudgedByFriend.length;
  const activeStakedGoalsJudgedByFriendCount = activeStakedGoalsJudgedByFriend.length;
  const judgedGoalTitlesText = useMemo(() => {
    if (activeGoalsJudgedByFriendCount === 0) return '';
    return activeGoalsJudgedByFriend.map((goal) => `"${goal.title}"`).join(', ');
  }, [activeGoalsJudgedByFriend, activeGoalsJudgedByFriendCount]);
  const stakedGoalsDetailsText = useMemo(() => {
    if (activeStakedGoalsJudgedByFriendCount === 0) return '';
    return activeStakedGoalsJudgedByFriend
      .map((goal) => `${goal.title} (${formatStakeAmount(goal.stake, goal.stakeCurrency)})`)
      .join(', ');
  }, [activeStakedGoalsJudgedByFriend, activeStakedGoalsJudgedByFriendCount]);

  const shareInviteLink = async () => {
    const shareText = myFriendCode
      ? `Join me on Owe It: ${inviteUrl}\nMy Account ID: ${myFriendCode}`
      : `Join me on Owe It: ${inviteUrl}`;
    try {
      if (navigator.share) {
        // Send a single text payload so targets like WhatsApp don't split/reformat
        // title/url into separate lines.
        await navigator.share({
          text: shareText,
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
        await navigator.clipboard.writeText(shareText);
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
    if (!normalizedSearchQuery) {
      setSearchError('Enter an Account ID or username.');
      return;
    }
    setSearching(true);
    const isAccountId = /^\d{11}$/.test(normalizedSearchQuery);
    const query = supabase
      .from('profiles')
      .select('id, display_name, avatar_url, friend_code')
      .limit(1);
    const { data, error } = isAccountId
      ? await query.eq('friend_code', normalizedSearchQuery).maybeSingle()
      : await query.ilike('display_name', normalizedSearchQuery).maybeSingle();
    setSearching(false);

    if (error) {
      console.error('Friend search error', error);
      const msg = String((error as any)?.message ?? '').toLowerCase();
      if (msg.includes('friend_code') && (msg.includes('column') || msg.includes('schema') || msg.includes('does not exist'))) {
        setSearchError('account id is not enabled yet (db update needed)');
      } else {
        setSearchError('account not found');
      }
      return;
    }
    if (!data) {
      setSearchError(isAccountId ? 'No user found with that Account ID.' : 'No user found with that username.');
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
    if (!searchResult?.id || searchResultAlreadyFriend) return;
    setSending(true);
    setSearchError(null);
    const { error } = await supabase.rpc('send_friend_request_to_user', { p_to_user_id: searchResult.id });
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
    if (user?.id) {
      const request = incoming.find((r) => r.id === requestId);
      if (request) {
        queryClient.setQueryData<FriendsBundle>(queryKeys.friends(user.id), (prev) => {
          if (!prev) return prev;
          const requestName = request.fromProfile?.display_name?.trim() || 'Friend';
          const nextFriend = {
            id: request.from_user_id,
            name: requestName,
            avatar: request.fromProfile?.avatar_url ?? '',
            activeGoals: 0,
            completedGoals: 0,
            totalStaked: 0,
          };
          const alreadyPresent = prev.friends.some((friend) => friend.id === nextFriend.id);
          const friendsNext = alreadyPresent ? prev.friends : [...prev.friends, nextFriend].sort((a, b) => a.name.localeCompare(b.name));
          return {
            ...prev,
            incoming: prev.incoming.filter((r) => r.id !== requestId),
            friends: friendsNext,
          };
        });
      }
    }

    const { error } = await supabase.rpc('accept_friend_request', { p_request_id: requestId });
    if (error) {
      console.error('Accept request error', error);
      invalidateFriends();
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

  const removeFriend = async () => {
    if (!friendToRemove || !user?.id) return;

    const removingId = friendToRemove.id;
    setRemovingFriendId(removingId);
    queryClient.setQueryData<FriendsBundle>(queryKeys.friends(user.id), (prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        friends: prev.friends.filter((friend) => friend.id !== removingId),
      };
    });

    const { error } = await supabase.rpc('remove_friend', { p_friend_user_id: removingId });
    setRemovingFriendId(null);
    setFriendToRemove(null);

    if (error) {
      console.error('Remove friend error', error);
      toast.error(error.message || 'Could not remove friend.');
      invalidateFriends();
      return;
    }

    if (searchResult?.id === removingId) {
      setSearchResult((prev) => prev);
    }
    toast.success('Friend removed.');
    invalidateFriends();
  };

  return (
    <div className="min-h-screen bg-background pb-28">
      <div className="px-6 pt-12 pb-6 flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
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
            className="mt-2 pr-4 text-base sm:text-xl font-display font-extrabold leading-snug tracking-tight text-balance text-foreground"
          >
            <span className="block whitespace-nowrap">Progress grows better with people.</span>
            <span className="block whitespace-nowrap">Choose your circle wisely.</span>
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
        <div className="mx-1 h-px bg-border/70" aria-hidden />

        {/* Add a friend by Account ID */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="p-5 rounded-[20px] bg-card border border-border"
        >
          <div className="flex items-center justify-between gap-4">
            <div>
              <h4 className="font-display font-semibold text-foreground">Add a friend</h4>
              <p className="text-xs text-muted-foreground mt-0.5">search by account id or username</p>
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
                placeholder="Account ID or username"
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
              <Avatar className="h-11 w-11 bg-background">
                <AvatarImage src={searchResult.avatar_url || ''} alt={searchResult.display_name || 'User'} className="object-cover" />
                <AvatarFallback className="bg-background font-display font-bold text-muted-foreground">
                  {(searchResult.display_name || 'U').charAt(0)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <p className="font-display font-semibold text-foreground">
                  {searchResult.display_name || 'User'}
                </p>
                <p className="text-xs text-muted-foreground tabular-nums">{searchResult.friend_code}</p>
              </div>
              <button
                type="button"
                onClick={() => void sendRequest()}
                disabled={sending || searchResultAlreadyFriend}
                className="px-4 py-2 rounded-xl bg-[#4ade80] text-[#022c22] font-display font-bold disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {searchResultAlreadyFriend ? 'Already friends' : sending ? 'Sending…' : 'Send request'}
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
                  <Avatar className="h-10 w-10">
                    <AvatarImage
                      src={r.fromProfile?.avatar_url || ''}
                      alt={r.fromProfile?.display_name || 'User'}
                      className="object-cover"
                    />
                    <AvatarFallback className="font-display font-bold text-muted-foreground">
                      {(r.fromProfile?.display_name || 'U').charAt(0)}
                    </AvatarFallback>
                  </Avatar>
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

        {friends.length > 0 && (
          <p className="px-1 text-xs uppercase tracking-widest text-muted-foreground">My friends</p>
        )}
        {friends.map((friend, i) => (
          <FriendCard
            key={friend.id}
            friend={friend}
            index={i}
            removing={removingFriendId === friend.id}
            onRemove={setFriendToRemove}
          />
        ))}
        <div className="mx-1 h-px bg-border/70" aria-hidden />
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
                Send a signup link so your friends can create an Owe It account and join you.
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
          </>
        )}
      </div>
      <AlertDialog open={friendToRemove !== null} onOpenChange={(open) => !open && !removingFriendId && setFriendToRemove(null)}>
        <AlertDialogContent className="max-w-md rounded-2xl border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display">Remove friend?</AlertDialogTitle>
            <AlertDialogDescription className="text-left text-muted-foreground space-y-2">
              <p>
                {friendToRemove
                  ? `${friendToRemove.name} will be removed from your friends list.`
                  : 'This friend will be removed.'}
              </p>
              {activeGoalsJudgedByFriendCount > 0 ? (
                <div className="space-y-2">
                  <p className="text-destructive font-semibold">
                    They are currently judging {activeGoalsJudgedByFriendCount} active goal
                    {activeGoalsJudgedByFriendCount === 1 ? '' : 's'}:
                    {' '}
                    {judgedGoalTitlesText}.
                    Removing them will mark those goal
                    {activeGoalsJudgedByFriendCount === 1 ? '' : 's'} as uncompleted.
                  </p>
                  {activeStakedGoalsJudgedByFriendCount > 0 ? (
                    <p className="text-destructive/90 text-sm">
                      Stakes that will be charged: {stakedGoalsDetailsText}.
                    </p>
                  ) : null}
                </div>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <p className="text-center text-xs font-medium uppercase tracking-widest text-muted-foreground/80">
            Hold to accept
          </p>
          <AlertDialogFooter className="gap-2 sm:gap-2">
            <AlertDialogCancel className="rounded-xl font-display font-semibold mt-0 sm:mt-0" disabled={Boolean(removingFriendId)}>
              Cancel
            </AlertDialogCancel>
            <HoldToConfirmButton
              variant="destructive"
              className="w-full sm:w-auto rounded-xl font-display font-bold"
              disabled={Boolean(removingFriendId)}
              idleLabel={removingFriendId ? 'Removing…' : 'Remove friend'}
              holdingLabel="Sure?"
              onConfirm={() => removeFriend()}
            />
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
