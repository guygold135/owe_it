import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { TutorialCard } from '@/components/TutorialCard';
import { useAppTutorial } from '@/hooks/useAppTutorial';
import { APP_TUTORIAL_SHEET_STEP_TO_PHASE, isAppTutorialSheetPhase } from '@/lib/appTutorial';
import { flushSync } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronRight, AlertTriangle, User, Users, Lock, Eye, Calendar, UserPlus } from 'lucide-react';
import type { BraintreePaymentInstance } from '@/components/braintree/braintreePayment';
import { useGoals } from '@/hooks/useGoals';
import { useAuth } from '@/hooks/useAuth';
import { Goal, Judge, Friend } from '@/lib/types';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { toast } from 'sonner';
import { formatStakeAmount } from '@/lib/currency';
import { stakeMajorToStripeUnits } from '@/lib/stripeCurrency';
import { useStakeCurrencyPreference } from '@/hooks/useStakeCurrencyPreference';
import { useMinimumStakeMajor } from '@/hooks/useMinimumStakeMajor';
import { CHARITY_OPTIONS, DEFAULT_CHARITY_ID, getCharityOptionById } from '@/lib/charities';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { PublishButton, type PublishPhase } from '@/components/ui/publish-button';
import { SuccessMorphIcon } from '@/components/ui/animated-state-icons';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import type { ProfileLite } from '@/lib/fetchers/tabData';
import {
  PROFILE_AVATAR_UPDATED_EVENT,
  readProfileAvatarFromStorage,
  writeProfileAvatarToStorage,
} from '@/lib/profileAvatarEvents';
import {
  buildPresetStakesForCurrency,
  formatStakePresetAmount,
  clampDeadlineDatetimeLocal,
  getDeadlineValidationError,
  getDefaultDeadlineDatetimeLocal,
  getEarliestSelectableDeadline,
  isRequirementsContentEmpty,
  parseDatetimeLocal,
  normalizeRequirementLines,
  REQUIREMENT_BULLET,
  roundStakeMajor,
  steps,
  toDatetimeLocalString,
} from '@/components/create-goal-sheet/helpers';
import { notifyJudgeRequestByEmail } from '@/lib/notifyJudgeRequestEmail';
import { CardStepContinueButton, CardStepFields } from '@/components/create-goal-sheet/CardStep';
import { PaymentMethodConsentNotice } from '@/components/PaymentMethodConsentNotice';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type CloseConfirmKind = 'judge-wait' | 'card' | 'sign' | 'tutorial-exit';

async function getFunctionInvokeErrorMessage(error: unknown, fallback: string): Promise<string> {
  if (error && typeof error === 'object') {
    const maybeContext = (error as { context?: Response }).context;
    if (maybeContext instanceof Response) {
      try {
        const payload = await maybeContext.clone().json() as { error?: unknown; stage?: unknown };
        const message = typeof payload.error === 'string' && payload.error.trim() ? payload.error.trim() : null;
        const stage = typeof payload.stage === 'string' && payload.stage.trim() ? payload.stage.trim() : null;
        if (message && stage) return `${message} (${stage})`;
        if (message) return message;
      } catch {
        try {
          const text = await maybeContext.clone().text();
          if (text.trim()) return text.trim();
        } catch {
          // ignore
        }
      }
    }

    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message.trim();
  }

  return fallback;
}

async function callCreateCheckoutWithSession(body: Record<string, unknown>) {
  const { error: userError } = await supabase.auth.getUser();
  if (userError) {
    throw new Error(userError.message ?? 'Not authenticated.');
  }

  const {
    data: { session: initialSession },
    error: sessionError,
  } = await supabase.auth.getSession();
  let session = initialSession;
  if (sessionError) {
    console.error('Could not read auth session before create-checkout', sessionError);
  }
  if (!session?.access_token) {
    const refreshResult = await supabase.auth.refreshSession();
    session = refreshResult.data.session;
    if (refreshResult.error) {
      console.error('Could not refresh auth session before create-checkout', refreshResult.error);
    }
  }

  const accessToken = String(session?.access_token ?? '').trim().replace(/^Bearer\s+/i, '');
  if (!accessToken) {
    throw new Error('Your session expired. Please sign in again and try creating the goal.');
  }
  if (!accessToken.includes('.')) {
    throw new Error('Your auth token is invalid. Please sign out and sign in again.');
  }

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const apikey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
  if (!supabaseUrl || !apikey) {
    throw new Error('Supabase environment is missing in the app.');
  }

  const res = await fetch(`${supabaseUrl.replace(/\/$/, '')}/functions/v1/create-checkout`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const raw = await res.text();
  let parsed: { success?: boolean; error?: string; goalId?: string } | null = null;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    parsed = null;
  }

  if (!res.ok) {
    throw new Error(parsed?.error ?? raw?.trim() ?? `create-checkout failed with status ${res.status}.`);
  }

  return parsed;
}

export function CreateGoalSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const {
    tutorialActive,
    sheetCloseLocked,
    phase: tutorialPhase,
    onCreateSheetStep,
    registerStakeChoice,
    exitTutorial,
    goBackToFabFromSheet,
    progressCurrent,
    progressTotal,
    onGoalCreatedInTutorial,
  } = useAppTutorial();
  const tutorialSheetStepRef = useRef<number | null>(null);
  const { addGoal, loadGoals, goals } = useGoals();
  const { user } = useAuth();
  const [selfAvatarUrl, setSelfAvatarUrl] = useState<string | null>(() => readProfileAvatarFromStorage(user?.id));
  const { currency: stakeCurrency } = useStakeCurrencyPreference();
  const { minimumStake } = useMinimumStakeMajor(stakeCurrency);
  const allowShortDeadlines = false;
  const deadlineInputRef = useRef<HTMLInputElement | null>(null);
  const goalTitleInputRef = useRef<HTMLInputElement | null>(null);
  const requirementsTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [step, setStep] = useState(0);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [stake, setStake] = useState(0);
  const [deadline, setDeadline] = useState('');
  const [judge, setJudge] = useState<Judge | null>(null);
  const [isPrivate, setIsPrivate] = useState(false);
  const [braintreePaymentMethodToken, setBraintreePaymentMethodToken] = useState<string | null>(null);
  const [braintreeCustomerId, setBraintreeCustomerId] = useState<string | null>(null);
  const [braintreeDropinInstance, setBraintreeDropinInstance] = useState<BraintreePaymentInstance | null>(null);
  const [cardFieldsComplete, setCardFieldsComplete] = useState(false);
  const [cardStepSubmitting, setCardStepSubmitting] = useState(false);
  const [paymentMethodConsent, setPaymentMethodConsent] = useState(false);
  const [customStakeError, setCustomStakeError] = useState(false);
  const [customStakeInput, setCustomStakeInput] = useState('');
  const [selectedCharityId, setSelectedCharityId] = useState(DEFAULT_CHARITY_ID);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [showAddFriendPanel, setShowAddFriendPanel] = useState(false);
  const addFriendPanelRef = useRef<HTMLDivElement>(null);
  const addFriendInputRef = useRef<HTMLInputElement>(null);
  const [judgeByIdInput, setJudgeByIdInput] = useState('');
  const [judgeByIdSearching, setJudgeByIdSearching] = useState(false);
  const [judgeByIdError, setJudgeByIdError] = useState<string | null>(null);
  const [judgeByIdResult, setJudgeByIdResult] = useState<ProfileLite | null>(null);
  const [judgeByIdSending, setJudgeByIdSending] = useState(false);
  const [judgeRequestId, setJudgeRequestId] = useState<string | null>(null);
  const [waitingJudgeName, setWaitingJudgeName] = useState<string | null>(null);
  const [confirmCloseKind, setConfirmCloseKind] = useState<CloseConfirmKind | null>(null);
  /** Full-sheet overlay on sign step: spinner until API done, then success morph. */
  const [signOverlayPhase, setSignOverlayPhase] = useState<'idle' | 'loading' | 'success'>('idle');
  const judgeRequestIdRef = useRef<string | null>(null);
  const judgeRequestRowSeenRef = useRef(false);
  const stakeRef = useRef(stake);
  const createdGoalIdRef = useRef<string | null>(null);
  const preserveDraftOnNextCloseRef = useRef(false);
  /** judge-wait dialog: full sheet close (X/backdrop) vs return to judge picker (Back button) */
  const judgeWaitDismissRef = useRef<'sheet' | 'back-to-picker'>('sheet');

  useLayoutEffect(() => {
    if (!showAddFriendPanel) return;
    addFriendPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    addFriendInputRef.current?.focus();
  }, [showAddFriendPanel]);

  useEffect(() => {
    judgeRequestIdRef.current = judgeRequestId;
  }, [judgeRequestId]);

  useEffect(() => {
    judgeRequestRowSeenRef.current = false;
  }, [judgeRequestId]);

  useEffect(() => {
    stakeRef.current = stake;
  }, [stake]);

  useEffect(() => {
    setSelfAvatarUrl(readProfileAvatarFromStorage(user?.id));
    if (!user?.id) return;

    let cancelled = false;
    void supabase
      .from('profiles')
      .select('avatar_url')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled || error) return;
        const row = data as { avatar_url?: string | null } | null;
        const nextAvatar = row?.avatar_url?.trim() || null;
        setSelfAvatarUrl(nextAvatar);
        writeProfileAvatarToStorage(user.id, nextAvatar);
      });

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    const refreshAvatar = () => {
      setSelfAvatarUrl(readProfileAvatarFromStorage(user?.id));
    };
    window.addEventListener(PROFILE_AVATAR_UPDATED_EVENT, refreshAvatar);
    return () => window.removeEventListener(PROFILE_AVATAR_UPDATED_EVENT, refreshAvatar);
  }, [user?.id]);

  useEffect(() => {
    if (!open) {
      tutorialSheetStepRef.current = null;
      return;
    }
    if (!tutorialActive) return;
    if (tutorialSheetStepRef.current === step) return;
    tutorialSheetStepRef.current = step;
    onCreateSheetStep(step);
  }, [open, step, tutorialActive, onCreateSheetStep]);

  useEffect(() => {
    if (step !== 4) setSignOverlayPhase('idle');
  }, [step]);

  useEffect(() => {
    if (!open || step !== 0) return;
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        goalTitleInputRef.current?.focus();
      });
    });
    return () => cancelAnimationFrame(id);
  }, [open, step]);

  const deadlineDate = useMemo(() => {
    if (!deadline) return null;
    return parseDatetimeLocal(deadline);
  }, [deadline]);

  const deadlineIssue = useMemo(
    () => getDeadlineValidationError(deadlineDate, deadline.length > 0, allowShortDeadlines),
    [deadline, deadlineDate, allowShortDeadlines],
  );

  /** Recomputed each render so `min` stays current while the sheet is open (native pickers ignore stale `min`). */
  const minDeadlineInput = toDatetimeLocalString(getEarliestSelectableDeadline(allowShortDeadlines));

  const applyDeadlinePick = useCallback(
    (value: string) => {
      setDeadline(clampDeadlineDatetimeLocal(value, allowShortDeadlines));
    },
    [allowShortDeadlines],
  );

  /** Default deadline = earliest allowed; clamp anything earlier (native `min` is not enforced everywhere). */
  useEffect(() => {
    if (!open) return;
    setDeadline((prev) => clampDeadlineDatetimeLocal(prev, allowShortDeadlines));
  }, [open, allowShortDeadlines]);

  /** Keep value ≥ min whenever the sheet is open (picker UI can still show earlier times). */
  useLayoutEffect(() => {
    if (!open || !deadline) return;
    const clamped = clampDeadlineDatetimeLocal(deadline, allowShortDeadlines);
    if (clamped !== deadline) setDeadline(clamped);
  }, [open, deadline, minDeadlineInput, allowShortDeadlines]);

  /** If the user keeps the sheet open, bump the value when it falls below the moving 24h floor. */
  useEffect(() => {
    if (!open) return;
    const id = window.setInterval(() => {
      setDeadline((prev) => clampDeadlineDatetimeLocal(prev, allowShortDeadlines));
    }, 15_000);
    return () => window.clearInterval(id);
  }, [open, allowShortDeadlines]);

  /** Keep native `min` in sync — React props alone are ignored by some picker UIs. */
  useLayoutEffect(() => {
    if (!open) return;
    const el = deadlineInputRef.current;
    if (el) el.min = minDeadlineInput;
  }, [open, minDeadlineInput]);

  const openDeadlinePicker = useCallback(() => {
    const minStr = toDatetimeLocalString(getEarliestSelectableDeadline(allowShortDeadlines));
    const clamped = clampDeadlineDatetimeLocal(deadline, allowShortDeadlines);
    if (clamped !== deadline) {
      flushSync(() => setDeadline(clamped));
    }
    const el = deadlineInputRef.current;
    if (!el) return;
    // Native pickers often ignore a stale `min`; sync right before opening.
    el.min = minStr;
    (el as HTMLInputElement & { showPicker?: () => void }).showPicker?.();
    el.focus();
  }, [deadline, allowShortDeadlines]);

  /** Same title as another active goal (same account), case-insensitive, trimmed */
  const duplicateActiveTitle = useMemo(() => {
    const t = title.trim().toLowerCase();
    if (!t) return false;
    return goals.some((g) => g.status === 'active' && g.title.trim().toLowerCase() === t);
  }, [title, goals]);

  const presetStakes = useMemo(
    () => buildPresetStakesForCurrency(stakeCurrency),
    [stakeCurrency],
  );

  /** Stake shown on card step — includes custom amount even if step 1 Continue was pressed before blur. */
  const cardStepStakeMajor = useMemo(() => {
    const raw = customStakeInput.trim();
    if (raw !== '') {
      const num = Number(raw);
      if (Number.isFinite(num) && num > 0) {
        return roundStakeMajor(num, stakeCurrency);
      }
    }
    return stake;
  }, [stake, customStakeInput, stakeCurrency]);

  const loadFriends = useCallback(async () => {
    if (!user?.id) return;
    const { data: edges, error: edgesError } = await supabase
      .from('friendships')
      .select('friend_user_id')
      .eq('user_id', user.id);

    if (edgesError) {
      console.error('Error loading friendships', edgesError);
      setFriends([]);
      return;
    }

    const friendIds = (edges ?? [])
      .map((e: { friend_user_id: string }) => e.friend_user_id)
      .filter(Boolean);
    if (friendIds.length === 0) {
      setFriends([]);
      return;
    }

    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, display_name, avatar_url')
      .in('id', friendIds);

    if (profilesError) {
      console.error('Error loading friend profiles', profilesError);
      setFriends([]);
      return;
    }

    const mapped: Friend[] = (profiles ?? []).map((p: { id: string; display_name: string | null; avatar_url: string | null }) => ({
      id: p.id,
      name: p.display_name ?? 'Friend',
      avatar: p.avatar_url ?? '',
      activeGoals: 0,
      completedGoals: 0,
      totalStaked: 0,
    }));
    mapped.sort((a, b) => String(a.name).localeCompare(String(b.name)));
    setFriends(mapped);
  }, [user?.id]);

  useEffect(() => {
    void loadFriends();
  }, [loadFriends]);

  useEffect(() => {
    if (!open || !user?.id) return;

    const tick = () => {
      if (document.visibilityState === 'visible') void loadFriends();
    };
    const intervalId = window.setInterval(tick, 5000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [open, user?.id, loadFriends]);

  useEffect(() => {
    if (!open || !user?.id) return;

    const refreshFriends = () => {
      void loadFriends();
    };

    const channel = supabase
      .channel(`create_goal_sheet_friends_${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'friendships' },
        refreshFriends,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'friend_requests' },
        refreshFriends,
      )
      .subscribe((status, err) => {
        if (status === 'CHANNEL_ERROR' && err) {
          console.warn('Create goal sheet friends realtime error', err);
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [open, user?.id, loadFriends]);

  const normalizedJudgeLookup = useMemo(() => judgeByIdInput.trim(), [judgeByIdInput]);

  const searchJudgeByFriendId = useCallback(async () => {
    setJudgeByIdError(null);
    setJudgeByIdResult(null);
    if (!user?.id) return;
    if (!normalizedJudgeLookup) {
      setJudgeByIdError('Enter an Account ID or username.');
      return;
    }
    setJudgeByIdSearching(true);
    const isAccountId = /^\d{11}$/.test(normalizedJudgeLookup);
    const query = supabase
      .from('profiles')
      .select('id, display_name, avatar_url, friend_code')
      .limit(1);
    const { data, error } = isAccountId
      ? await query.eq('friend_code', normalizedJudgeLookup).maybeSingle()
      : await query.ilike('display_name', normalizedJudgeLookup).maybeSingle();
    setJudgeByIdSearching(false);

    if (error) {
      console.error('Friend search error', error);
      const msg = String('message' in error ? error.message : '').toLowerCase();
      if (msg.includes('friend_code') && (msg.includes('column') || msg.includes('schema') || msg.includes('does not exist'))) {
        setJudgeByIdError('Account ID is not available yet.');
      } else {
        setJudgeByIdError('Could not look up this ID.');
      }
      return;
    }
    if (!data) {
      setJudgeByIdError(isAccountId ? 'No user found with that Account ID.' : 'No user found with that username.');
      return;
    }
    const row = data as {
      id: string;
      display_name: string | null;
      avatar_url: string | null;
      friend_code: string | null;
    };
    if (row.id === user.id) {
      setJudgeByIdError('That’s your Account ID. Pick someone else.');
      return;
    }
    setJudgeByIdResult({
      id: row.id,
      display_name: row.display_name ?? '',
      avatar_url: row.avatar_url ?? null,
      friend_code: row.friend_code ?? null,
    });
  }, [normalizedJudgeLookup, user?.id]);

  const sendJudgeByIdFriendRequest = useCallback(async () => {
    if (!judgeByIdResult?.id) return;
    setJudgeByIdSending(true);
    setJudgeByIdError(null);
    const { error } = await supabase.rpc('send_friend_request_to_user', { p_to_user_id: judgeByIdResult.id });
    setJudgeByIdSending(false);
    if (error) {
      setJudgeByIdError(error.message || 'Could not send request.');
      return;
    }
    setJudgeByIdResult(null);
    setJudgeByIdInput('');
    toast.success('Friend request sent. Once they accept, they’ll appear in your list.');
    void loadFriends();
  }, [judgeByIdResult?.id, loadFriends]);

  const selectJudgeFromLookup = useCallback((profile: ProfileLite) => {
    setJudge({
      id: profile.id,
      name: profile.display_name || 'Friend',
      avatar: profile.avatar_url || '',
      isSelf: false,
    });
    setJudgeByIdResult(null);
    setJudgeByIdInput('');
    setJudgeByIdError(null);
  }, []);

  useEffect(() => {
    if (!judgeRequestId) return;

    const finishJudgeWait = (status: 'accepted' | 'ignored' | 'cancelled' | 'missing') => {
      setJudgeRequestId(null);
      setWaitingJudgeName(null);

      if (status === 'accepted' || status === 'missing') {
        setStep(stakeRef.current > 0 ? 3 : 4);
        return;
      }

      if (status === 'ignored') {
        toast.error('Judge request was ignored.');
        return;
      }
    };

    const checkJudgeRequestStatus = async () => {
      try {
        const { data, error } = await supabase
          .from('judge_requests')
          .select('status')
          .eq('id', judgeRequestIdRef.current)
          .maybeSingle();

        if (error) return;
        if (!data) {
          // Some backend flows remove the row before the requester receives the final
          // accepted update. If we previously saw the row, treat disappearance as the
          // successful path instead of trapping the user on this screen.
          if (judgeRequestRowSeenRef.current) finishJudgeWait('missing');
          return;
        }

        judgeRequestRowSeenRef.current = true;
        const status = (data as { status?: string })?.status;
        if (status === 'accepted') {
          finishJudgeWait('accepted');
          return;
        }
        if (status === 'ignored') {
          finishJudgeWait('ignored');
          return;
        }
        if (status === 'cancelled') {
          finishJudgeWait('cancelled');
        }
      } catch {
        // ignore
      }
    };

    /**
     * Poll: never clear state on !data — that races realtime and tears down the channel before
     * UPDATE/DELETE events arrive (accept used to be UPDATE+DELETE in one tx; poll saw the row gone first).
     * Unfiltered postgres_changes + client filter: filtered UUID subscriptions are unreliable in Supabase.
     */
    void checkJudgeRequestStatus();
    const poll = window.setInterval(() => {
      void checkJudgeRequestStatus();
    }, 1500);

    const channel = supabase
      .channel(`judge_request_${judgeRequestId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'judge_requests',
        },
        (payload) => {
          const row = payload.new as { id?: string; status?: string };
          if (row.id !== judgeRequestIdRef.current) return;
          const status = row.status;
          if (status === 'accepted') {
            finishJudgeWait('accepted');
            return;
          }
          if (status === 'ignored') {
            finishJudgeWait('ignored');
            return;
          }
          if (status === 'cancelled') {
            finishJudgeWait('cancelled');
          }
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'judge_requests',
        },
        (payload) => {
          const oldRow = payload.old as { id?: string; status?: string } | undefined;
          if (oldRow?.id !== judgeRequestIdRef.current) return;
          if (oldRow.status === 'accepted') {
            finishJudgeWait('accepted');
            return;
          }
          if (oldRow.status === 'pending') {
            finishJudgeWait('cancelled');
          }
        },
      )
      .subscribe((status, err) => {
        if (status === 'CHANNEL_ERROR' && err) {
          console.warn('Judge request realtime channel error', err);
        }
      });

    return () => {
      window.clearInterval(poll);
      void supabase.removeChannel(channel);
    };
  }, [judgeRequestId]);

  const reset = () => {
    setStep(0); setTitle(''); setDescription(''); setStake(0);
    setDeadline(getDefaultDeadlineDatetimeLocal(allowShortDeadlines));
    setJudge(null); setIsPrivate(false);
    setBraintreePaymentMethodToken(null); setBraintreeCustomerId(null); setBraintreeDropinInstance(null);
    setCardFieldsComplete(false);
    setCardStepSubmitting(false);
    setPaymentMethodConsent(false);
    setCustomStakeInput(''); setCustomStakeError(false);
    setSelectedCharityId(DEFAULT_CHARITY_ID);
    setJudgeRequestId(null); setWaitingJudgeName(null);
    setConfirmCloseKind(null);
    setSignOverlayPhase('idle');
    setJudgeByIdInput('');
    setJudgeByIdError(null);
    setJudgeByIdResult(null);
    setJudgeByIdSearching(false);
    setJudgeByIdSending(false);
  };

  /** Closing the sheet = abandoning goal creation → cancel pending judge request for the judge */
  useEffect(() => {
    if (open) return;
    const preserveDraft = preserveDraftOnNextCloseRef.current;
    preserveDraftOnNextCloseRef.current = false;
    const pendingId = judgeRequestIdRef.current;
    if (pendingId) {
      void supabase.rpc('cancel_judge_request', { p_request_id: pendingId }).then(({ error }) => {
        if (error) console.error('Cancel judge request on close', error);
      });
    }
    if (!preserveDraft) {
      reset();
    }
  }, [open]);

  const handleClose = () => {
    onClose();
  };

  /** Close / backdrop: confirm first on judge wait, card step, or sign step */
  const requestClose = () => {
    if (sheetCloseLocked) return;
    if (confirmCloseKind !== null) return;
    if (judgeRequestId) {
      judgeWaitDismissRef.current = 'sheet';
      setConfirmCloseKind('judge-wait');
      return;
    }
    if (step === 3) {
      setConfirmCloseKind('card');
      return;
    }
    if (step === 4) {
      setConfirmCloseKind('sign');
      return;
    }
    onClose();
  };

  const confirmCloseDialog = () => {
    if (confirmCloseKind === 'tutorial-exit') {
      flushSync(() => setConfirmCloseKind(null));
      void (async () => {
        await exitTutorial();
        onClose();
      })();
      return;
    }
    if (confirmCloseKind === 'judge-wait' && judgeWaitDismissRef.current === 'back-to-picker') {
      flushSync(() => setConfirmCloseKind(null));
      const id = judgeRequestIdRef.current;
      if (id) {
        void supabase.rpc('cancel_judge_request', { p_request_id: id }).then(({ error }) => {
          if (error) console.error('Cancel judge request error', error);
        });
      }
      setJudgeRequestId(null);
      setWaitingJudgeName(null);
      return;
    }
    flushSync(() => setConfirmCloseKind(null));
    onClose();
  };

  const canNext = () => {
    if (step === 0) {
      return title.length > 0 && deadline.length > 0 && !duplicateActiveTitle && !deadlineIssue;
    }
    if (step === 1) {
      if (customStakeInput.trim() !== '' && customStakeError) return false;
      return true;
    }
    if (step === 2) return judge !== null; // Judge step
    if (step === 3) return true; // Card step: "Continue" handles validation
    return true;
  };

  const goNext = () => {
    if (step === 0) {
      const err = getDeadlineValidationError(deadlineDate, deadline.length > 0, allowShortDeadlines);
      if (err) {
        toast.error(err);
        return;
      }
      const t = title.trim().toLowerCase();
      if (goals.some((g) => g.status === 'active' && g.title.trim().toLowerCase() === t)) {
        toast.error('You already have an active goal with this name. Use a different title.');
        return;
      }
    }
    if (step === 1) {
      let resolvedStake = stake;
      const raw = customStakeInput.trim();
      if (raw !== '') {
        const num = Number(raw);
        if (!Number.isFinite(num) || num < 0 || (num > 0 && num < minimumStake)) {
          setCustomStakeError(true);
          return;
        }
        setCustomStakeError(false);
        resolvedStake = num === 0 ? 0 : roundStakeMajor(num, stakeCurrency);
        setStake(resolvedStake);
        setCustomStakeInput(
          resolvedStake === 0
            ? ''
            : resolvedStake === Math.floor(resolvedStake)
              ? String(resolvedStake)
              : resolvedStake.toFixed(2),
        );
      }
      registerStakeChoice(resolvedStake > 0);
      // After stake, always choose judge next
      setStep(2);
      return;
    }
    // After judge: go to card only if stake > 0, otherwise skip to confirm
    if (step === 2) {
      if (judge && !judge.isSelf) {
        // Send judge request and wait for acceptance
        (async () => {
          if (!user?.id) return;
          const deadlineErr = getDeadlineValidationError(deadlineDate, deadline.length > 0, allowShortDeadlines);
          if (deadlineErr) {
            toast.error(deadlineErr);
            return;
          }
          try {
            setWaitingJudgeName(judge.name);
            const payload = {
              title,
              description,
              stake,
              stakeCurrency,
              deadline: deadlineDate.toISOString(),
              isPrivate,
              charityId: selectedCharityId,
            };
            const { data, error } = await supabase.rpc('create_judge_request', {
              p_judge_user_id: judge.id,
              p_goal_payload: payload as Json,
            });
            if (error) {
              console.error('Error creating judge request', error);
              toast.error(error.message ?? 'Could not send judge request.');
              setWaitingJudgeName(null);
              return;
            }
            const requestId = typeof data === 'string' ? data : null;
            setJudgeRequestId(requestId);
            if (requestId) {
              const emailed = await notifyJudgeRequestByEmail(requestId);
              if (emailed) {
                toast.success(`Invite email sent to ${judge.name}.`);
              }
            }
          } catch (e: unknown) {
            console.error('Unexpected judge request error', e);
            toast.error(e instanceof Error ? e.message : 'Could not send judge request.');
            setWaitingJudgeName(null);
          }
        })();
        return;
      }

      setStep(tutorialActive && isAppTutorialSheetPhase(tutorialPhase) ? 3 : stake > 0 ? 3 : 4);
      return;
    }
    setStep((s) => s + 1);
  };

  const goBack = () => {
    if (step === 4) {
      setStep(tutorialActive && isAppTutorialSheetPhase(tutorialPhase) ? 3 : stake > 0 ? 3 : 2);
      return;
    }
    // From card go back to judge
    if (step === 3) {
      setStep(2);
      return;
    }
    setStep((s) => s - 1);
  };

  const handleTutorialSheetGoBack = () => {
    if (step > 0) {
      goBack();
      return;
    }
    goBackToFabFromSheet();
    onClose();
  };

  const tutorialSheetOverlayBody = useMemo(() => {
    const p = APP_TUTORIAL_SHEET_STEP_TO_PHASE[step];
    switch (p) {
      case 'sheet_goal':
        return (
          <p className="text-pretty">
            On this page you define your goal&apos;s name, requirements, deadline - everything that defines what
            &quot;done&quot; means, and visibility for your friends.
          </p>
        );
      case 'sheet_stake':
        return (
          <>
            <p className="text-pretty font-display font-semibold text-foreground">Here&apos;s where the magic happens.</p>
            <p className="text-pretty">
              Choose what you&apos;re willing to put on the line. If you won&apos;t complete the goal in time your stake
              will be charged and transferred to your selected charity. If you complete it in time, nothing will be
              charged.
            </p>
            <p className="text-pretty">
              For the tutorial we will choose no stake ({formatStakeAmount(0, stakeCurrency)}).
            </p>
          </>
        );
      case 'sheet_judge':
        return (
          <>
            <p className="text-pretty">
              Here you choose your judge—a trusted friend who decides whether you completed the goal. That decision
              determines whether your stake is charged. A judge can only be someone you&apos;re friends with on Owe It.
            </p>
            <p className="text-pretty">
              For now choose yourself. For future goals, it&apos;s extremely recommended to choose an honest friend.
            </p>
          </>
        );
      case 'sheet_card':
        return (
          <p className="text-pretty">
            This is where you will enter your card details and make the stake real, for this example there is no stake so
            you can continue.
          </p>
        );
      case 'sheet_confirm':
        return (
          <p className="text-pretty">
            Make sure every detail is correct. To create your goal, <span className="text-zinc-200">press and hold</span> the{' '}
            <span className="text-zinc-200">Create goal</span> button until it completes.
          </p>
        );
      default:
        return null;
    }
  }, [step, stakeCurrency]);

  const sheetTutorialCalloutActive = useMemo(
    () =>
      tutorialActive &&
      sheetCloseLocked &&
      isAppTutorialSheetPhase(tutorialPhase) &&
      signOverlayPhase === 'idle' &&
      !(step === 2 && judgeRequestId),
    [tutorialActive, sheetCloseLocked, tutorialPhase, signOverlayPhase, step, judgeRequestId],
  );
  const tutorialCreateFlowActive = tutorialActive && isAppTutorialSheetPhase(tutorialPhase);

  useEffect(() => {
    if (!tutorialCreateFlowActive || step !== 1) return;
    if (stake !== 0) setStake(0);
    if (customStakeInput !== '') setCustomStakeInput('');
    if (customStakeError) setCustomStakeError(false);
  }, [tutorialCreateFlowActive, step, stake, customStakeInput, customStakeError]);

  const performSign = async () => {
    createdGoalIdRef.current = null;
    const signDeadlineErr = getDeadlineValidationError(deadlineDate, deadline.length > 0, allowShortDeadlines);
    if (signDeadlineErr) {
      toast.error(signDeadlineErr);
      throw new Error(signDeadlineErr);
    }

    const amountStripeUnits = stakeMajorToStripeUnits(stake, stakeCurrency);

    if (stake === 0) {
      const newGoal: Goal = {
        id: Date.now().toString(),
        title,
        description,
        stake: 0,
        stakeCurrency,
        charityId: null,
        deadline: deadlineDate!,
        createdAt: new Date(),
        resolvedAt: null,
        status: 'active',
        judge: judge!,
        isPrivate,
        ...(tutorialCreateFlowActive ? { createdDuringAppTutorial: true } : {}),
      };
      createdGoalIdRef.current = await addGoal(newGoal);
      return;
    }

    if (!braintreePaymentMethodToken || !user?.id) {
      toast.error('Payment method or user missing.');
      throw new Error('Payment method or user missing.');
    }

    const requestBody = {
      braintreePaymentMethodToken,
      braintreeCustomerId,
      userId: user.id,
      goalTitle: title,
      description,
      deadline: deadlineDate!.toISOString(),
      judgeName: judge?.isSelf ? null : judge?.name,
      judgeUserId: judge?.isSelf ? user.id : judge?.id,
      isPrivate,
      amount: amountStripeUnits,
      currency: stakeCurrency,
      charityId: selectedCharityId,
    };

    let payload: { success?: boolean; error?: string; goalId?: string } | null = null;
    let checkoutError: unknown = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        payload = await callCreateCheckoutWithSession(requestBody);
        checkoutError = null;
        break;
      } catch (error) {
        checkoutError = error;
        if (attempt === 0) {
          console.warn('create-checkout failed, retrying once', error);
          await new Promise((resolve) => window.setTimeout(resolve, 350));
        }
      }
    }

    if (checkoutError) {
      console.error('Error charging card', checkoutError);
      toast.error(await getFunctionInvokeErrorMessage(checkoutError, 'Could not save payment method. Goal was not created.'));
      throw new Error('checkout');
    }

    if (!payload?.success) {
      toast.error(payload?.error ?? 'Could not prepare payment for later charge. Goal was not created.');
      throw new Error('payment failed');
    }

    // Best effort: make sure currency is persisted on the created goal, even if
    // edge function deployment lags behind frontend changes.
    if (payload.goalId) {
      createdGoalIdRef.current = payload.goalId;
      const { error: currencyError } = await supabase
        .from('goals')
        .update({ stake_currency: stakeCurrency })
        .eq('id', payload.goalId)
        .eq('user_id', user.id);
      if (currencyError) {
        const message = String((currencyError as { message?: unknown })?.message ?? '').toLowerCase();
        if (!message.includes('stake_currency')) {
          console.error('Error saving goal currency', currencyError);
        }
      }
    }

    try {
      if (!isPrivate) {
        await supabase.from('pulse_events').insert({
          user_id: user.id,
          action: stake > 0 ? 'staked' : 'created',
          goal_title: title,
          stake,
        });
      }
    } catch (e) {
      console.error('Error inserting pulse event', e);
    }
    await loadGoals();
    toast.success('Goal created. Card will be charged only if the goal is uncompleted.');
  };

  return (
    <>
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40"
              onClick={() => {
                if (sheetCloseLocked) return;
                requestClose();
              }}
            />
            <AlertDialog
              open={confirmCloseKind !== null}
              onOpenChange={(next) => {
                if (!next) setConfirmCloseKind(null);
              }}
            >
              <AlertDialogContent className="max-w-md mx-4 rounded-2xl border-border">
                <AlertDialogHeader>
                  <AlertDialogTitle className="font-display">
                    {confirmCloseKind === 'judge-wait' && 'Cancel this judge request?'}
                    {confirmCloseKind === 'card' && 'Leave card details?'}
                    {confirmCloseKind === 'sign' && 'Leave before signing?'}
                    {confirmCloseKind === 'tutorial-exit' && 'Exit the tutorial?'}
                  </AlertDialogTitle>
                  <AlertDialogDescription className="text-left text-muted-foreground">
                    {confirmCloseKind === 'tutorial-exit' && (
                      <>
                        You&apos;ll leave the guided tour and close the goal creator. You can use the app as usual, but the
                        walkthrough won&apos;t resume from this step.
                      </>
                    )}
                    {confirmCloseKind === 'judge-wait' && (
                      <>
                        {waitingJudgeName
                          ? `${waitingJudgeName} hasn’t responded yet. `
                          : 'Your friend hasn’t responded yet. '}
                        If you leave now, the request will be cancelled and they won’t see it anymore.
                      </>
                    )}
                    {confirmCloseKind === 'card' && (
                      <>
                        Your card will be charged only if you complete the goal by the deadline—but you haven’t finished this step yet.
                        If you leave now, you’ll need to add your payment method again to create this goal.
                      </>
                    )}
                    {confirmCloseKind === 'sign' && (
                      <>
                        You haven’t signed the contract yet. If you leave now, this goal won’t be created and you’ll lose this
                        progress.
                      </>
                    )}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter className="gap-2 sm:gap-0">
                  <AlertDialogCancel className="rounded-xl font-display font-semibold mt-0">
                    {confirmCloseKind === 'judge-wait' && 'Keep waiting'}
                    {confirmCloseKind === 'card' && 'Keep card step'}
                    {confirmCloseKind === 'sign' && 'Keep signing'}
                    {confirmCloseKind === 'tutorial-exit' && 'Keep tutorial'}
                  </AlertDialogCancel>
                  <AlertDialogAction
                    onClick={confirmCloseDialog}
                    className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90 font-display font-bold"
                  >
                    {confirmCloseKind === 'judge-wait' && 'Yes, cancel request'}
                    {confirmCloseKind === 'card' && 'Yes, leave'}
                    {confirmCloseKind === 'sign' && 'Yes, leave'}
                    {confirmCloseKind === 'tutorial-exit' && 'Yes, exit tutorial'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 300, damping: 35 }}
              className="fixed bottom-0 left-0 right-0 z-50 bg-[#0f0f0f] border-t border-border rounded-t-[32px] h-[640px] max-h-[90vh] overflow-y-visible overflow-x-hidden [color-scheme:dark]"
              style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
            >
            <div className="relative h-full flex flex-col p-6">
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-display font-bold text-foreground">
                  {step === 0 && 'Define Your Goal'}
                  {step === 1 && 'Set Your Stake'}
                  {step === 2 && 'Choose Your Judge'}
                  {step === 3 && 'Secure payment'}
                  {step === 4 && 'Sign the Contract'}
                </h2>
                {!sheetCloseLocked ? (
                  <button
                    type="button"
                    onClick={requestClose}
                    className="p-2 rounded-xl hover:bg-muted transition-colors"
                    aria-label="Close"
                  >
                    <X className="w-5 h-5 text-muted-foreground" />
                  </button>
                ) : (
                  <div className="w-9 h-9 shrink-0" aria-hidden />
                )}
              </div>

              {/* Step indicators */}
              <div className="flex gap-2 mb-6">
                {steps.map((_, i) => {
                  const isCompleted = i <= step;
                  return (
                    <div
                      key={i}
                      className={`h-1.5 flex-1 rounded-full transition-colors ${
                        isCompleted ? 'bg-emerald-400' : 'bg-emerald-400/20'
                      }`}
                    />
                  );
                })}
              </div>

              {/* Step 0: Goal */}
              {step === 0 && (
                <div className="flex flex-col gap-5 flex-1">
                  <div>
                    <label className="text-xs uppercase tracking-widest text-muted-foreground mb-2 block">Goal Title</label>
                    <input
                      ref={goalTitleInputRef}
                      type="text"
                      value={title}
                      onChange={e => setTitle(e.target.value)}
                      placeholder="what is the goal?"
                      className="block w-full bg-muted rounded-2xl px-5 py-4 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary font-display text-lg"
                    />
                    {duplicateActiveTitle && (
                      <p className="text-xs text-destructive mt-2">
                        You already have an active goal with this name. Choose a different title to continue.
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="text-xs uppercase tracking-widest text-muted-foreground mb-2 block">
                      Requirements (optional)
                    </label>
                    <textarea
                      ref={requirementsTextareaRef}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      onFocus={() => {
                        if (description !== '') return;
                        const prefix = `${REQUIREMENT_BULLET} `;
                        setDescription(prefix);
                        requestAnimationFrame(() => {
                          const el = requirementsTextareaRef.current;
                          if (!el) return;
                          const pos = prefix.length;
                          el.setSelectionRange(pos, pos);
                        });
                      }}
                      onKeyDown={(e) => {
                        if (e.key !== 'Enter') return;
                        e.preventDefault();
                        const el = e.currentTarget;
                        const v = el.value;
                        const start = el.selectionStart;
                        const end = el.selectionEnd;
                        const ins = `\n${REQUIREMENT_BULLET} `;
                        const next = v.slice(0, start) + ins + v.slice(end);
                        setDescription(next);
                        const pos = start + ins.length;
                        requestAnimationFrame(() => {
                          const ta = requirementsTextareaRef.current;
                          if (!ta) return;
                          ta.setSelectionRange(pos, pos);
                        });
                      }}
                      onBlur={() => {
                        setDescription((d) => {
                          const n = normalizeRequirementLines(d);
                          return isRequirementsContentEmpty(n) ? '' : n;
                        });
                      }}
                      placeholder={`${REQUIREMENT_BULLET} One clear requirement per line`}
                      rows={2}
                      className="block w-full min-h-[3.75rem] bg-muted rounded-2xl px-5 py-4 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none leading-relaxed font-display text-lg"
                    />
                  </div>
                  <div>
                    <label className="text-xs uppercase tracking-widest text-muted-foreground mb-2 block">Deadline</label>
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={openDeadlinePicker}
                      onKeyDown={(e) => {
                        if (e.key !== 'Enter' && e.key !== ' ') return;
                        e.preventDefault();
                        openDeadlinePicker();
                      }}
                      className={`relative w-full max-w-full bg-muted rounded-2xl ${
                        deadlineIssue ? 'ring-2 ring-destructive' : ''
                      }`}
                    >
                      {/* Visible UI (works consistently on iOS Safari). */}
                      <div
                        className={`flex items-center justify-between gap-3 w-full min-w-0 rounded-2xl pl-5 pr-4 py-4 font-display text-lg ${
                          deadline ? 'text-foreground' : 'text-muted-foreground'
                        }`}
                      >
                        <span className="truncate">
                          {deadlineDate ? deadlineDate.toLocaleString() : 'Select a deadline'}
                        </span>
                        <Calendar className="w-5 h-5 shrink-0 text-muted-foreground" />
                      </div>

                      {/* Native input kept for actual picking + validation/min. */}
                      <input
                        ref={deadlineInputRef}
                        type="datetime-local"
                        value={deadline}
                        min={minDeadlineInput}
                        step={60}
                        onChange={(e) => applyDeadlinePick(e.target.value)}
                        onInput={(e) => applyDeadlinePick(e.currentTarget.value)}
                        onBlur={(e) => applyDeadlinePick(e.target.value)}
                        aria-invalid={deadlineIssue ? true : undefined}
                        className="absolute inset-0 top-0 left-0 z-10 h-full w-full max-w-full cursor-pointer bg-transparent text-transparent caret-transparent opacity-[0.01] appearance-none [color-scheme:dark]"
                      />
                    </div>
                    {deadlineIssue && (
                      <p className="text-xs text-destructive mt-2">{deadlineIssue}</p>
                    )}
                  </div>
                  <div className="flex items-center justify-between p-4 bg-muted rounded-2xl">
                    <div className="flex items-center gap-3">
                      {isPrivate ? <Lock className="w-4 h-4 text-muted-foreground" /> : <Eye className="w-4 h-4 text-muted-foreground" />}
                      <span className="text-sm text-foreground">{isPrivate ? 'Private goal' : 'Goal visible to friends'}</span>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={!isPrivate}
                      aria-label={isPrivate ? 'Private goal' : 'Goal visible to friends'}
                      onClick={() => setIsPrivate(!isPrivate)}
                      className={`w-12 h-7 rounded-full transition-colors relative ${isPrivate ? 'bg-border' : 'bg-primary'}`}
                    >
                      <div className={`w-5 h-5 rounded-full bg-foreground absolute top-1 transition-transform ${isPrivate ? 'translate-x-1' : 'translate-x-6'}`} />
                    </button>
                  </div>
                </div>
              )}

              {/* Step 1: Stake */}
              {step === 1 && (
                <div className="flex flex-1 flex-col gap-5">
                  <div className="text-center">
                    <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Your Stake</p>
                    <motion.div
                      key={stake}
                      initial={{ scale: 1 }}
                      animate={{ scale: [1, 1.05, 1] }}
                      transition={{ duration: 0.2 }}
                      className="text-5xl font-display font-extrabold text-primary tabular-nums tracking-tighter leading-none"
                    >
                      {formatStakeAmount(stake, stakeCurrency)}
                    </motion.div>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {presetStakes.map(amount => (
                      <button
                        key={amount}
                        type="button"
                        disabled={tutorialCreateFlowActive}
                        onClick={() => {
                          setStake(amount);
                          setCustomStakeInput('');
                        }}
                        className={`py-2 rounded-xl font-display font-bold text-xs transition-all sm:text-sm ${
                          customStakeInput === '' && stake === amount
                            ? 'bg-primary text-primary-foreground glow-primary'
                            : 'bg-muted text-muted-foreground hover:bg-muted/80'
                        } ${tutorialCreateFlowActive ? 'opacity-60 cursor-not-allowed hover:bg-muted' : ''}
                        `}
                      >
                        {amount === 0 ? 'Free' : formatStakePresetAmount(amount, stakeCurrency)}
                      </button>
                    ))}
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs uppercase tracking-widest text-muted-foreground">
                      If you fail, stake goes to
                    </p>
                    {stake > 0 ? (
                      <div className="flex flex-col gap-1">
                        <Select value={selectedCharityId} onValueChange={setSelectedCharityId}>
                          <SelectTrigger className="h-auto w-full rounded-xl border border-primary bg-primary/10 px-3 py-2 text-left font-display font-semibold text-sm text-foreground ring-1 ring-primary/30 hover:bg-primary/15 focus:ring-primary/30">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="rounded-xl">
                            {CHARITY_OPTIONS.map((c) => (
                              <SelectItem key={c.id} value={c.id} className="rounded-lg font-display">
                                {c.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {getCharityOptionById(selectedCharityId)?.subtitle ? (
                          <p className="px-0.5 text-[11px] text-muted-foreground leading-snug">
                            {getCharityOptionById(selectedCharityId)?.subtitle}
                          </p>
                        ) : null}
                      </div>
                    ) : (
                      <p className="text-[11px] text-muted-foreground rounded-xl border border-border bg-muted/30 px-3 py-2 leading-snug">
                        Pick a paid stake above to choose a charity. Free goals are not charged.
                      </p>
                    )}
                  </div>
                  <div className="space-y-2 pb-0.5">
                    <label className="text-xs uppercase tracking-widest text-muted-foreground mb-2 block">
                      Or custom amount
                    </label>
                    <div className="flex items-center gap-1.5">
                      <span className="text-muted-foreground font-display text-sm">{stakeCurrency.toUpperCase()}</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        disabled={tutorialCreateFlowActive}
                        value={customStakeInput || (presetStakes.includes(stake) ? '' : stake.toString())}
                        onChange={(e) => {
                          const v = e.target.value;
                          setCustomStakeInput(v);
                          if (v === '') {
                            setCustomStakeError(false);
                            setStake(0);
                            return;
                          }
                          // Allow only digits and at most one dot
                          const numericPattern = /^\d*\.?\d*$/;
                          if (!numericPattern.test(v)) {
                            setCustomStakeError(true);
                            return;
                          }
                          setCustomStakeError(false);
                          const num = Number(v);
                          if (num >= 0) {
                            if (num === 0 || num >= minimumStake) {
                              setStake(roundStakeMajor(num, stakeCurrency));
                            }
                          }
                        }}
                        onBlur={() => {
                          const raw = customStakeInput.trim();
                          if (raw === '') return;
                          if (customStakeError) return;
                          const num = parseFloat(raw);
                          if (Number.isNaN(num) || num < 0) {
                            setCustomStakeInput('');
                            setStake(0);
                            return;
                          }
                          if (num > 0 && num < minimumStake) {
                            toast.error(
                              `Minimum stake is ${formatStakeAmount(minimumStake, stakeCurrency)} (at least US$1 at the current rate).`,
                            );
                            setCustomStakeInput('');
                            setStake(0);
                            return;
                          }
                          const rounded = roundStakeMajor(num, stakeCurrency);
                          setStake(rounded);
                          setCustomStakeInput(
                            rounded === Math.floor(rounded) ? rounded.toString() : rounded.toFixed(2)
                          );
                        }}
                        className={`flex-1 bg-muted rounded-xl px-3 py-2 text-sm text-foreground font-display font-semibold tabular-nums placeholder:text-muted-foreground focus:outline-none focus:ring-2 [color-scheme:dark] border ${
                          customStakeError ? 'border-destructive ring-destructive' : 'border-transparent focus:ring-primary'
                        } ${tutorialCreateFlowActive ? 'opacity-60 cursor-not-allowed' : ''}`}
                      />
                    </div>
                    <div className="space-y-1 text-[11px] text-muted-foreground leading-snug">
                      <p>Minimum paid stake: {formatStakeAmount(minimumStake, stakeCurrency)}.</p>
                      <p>
                        Only if the stake is charged, the combined payment processing and app fee is{' '}
                        <span className="text-foreground/90">6.7%</span>. The rest is transferred to the charity
                        you selected.
                      </p>
                      <p>
                        If your card is billed in another currency, your bank may charge a separate conversion fee we do
                        not control.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Step 2: Judge */}
              {step === 2 && (
                <div className="flex min-h-0 flex-1 flex-col">
                  {judgeRequestId && (
                    <>
                      <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 text-center">
                        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10">
                          <Users className="h-5 w-5 text-emerald-400" />
                        </div>
                        <p className="font-display font-semibold text-sm text-foreground">
                          waiting for {waitingJudgeName ?? 'your friend'} to accept
                        </p>
                        <p className="mt-2 text-xs text-muted-foreground">
                          They&apos;ll get an email with a link to sign in and accept, and can also respond in the app.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          if (confirmCloseKind !== null) return;
                          judgeWaitDismissRef.current = 'back-to-picker';
                          setConfirmCloseKind('judge-wait');
                        }}
                        className="mt-auto w-full shrink-0 py-3 rounded-2xl bg-muted font-display font-semibold text-muted-foreground"
                      >
                        Back
                      </button>
                    </>
                  )}

                  {!judgeRequestId && (
                    <div className="flex min-h-0 flex-1 flex-col">
                      {/* Self judge option */}
                      <button
                        onClick={() => setJudge({ id: 'self', name: 'You', avatar: '', isSelf: true })}
                        className={`w-full shrink-0 p-5 rounded-[20px] border text-left transition-all ${
                          judge?.isSelf ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground/30'
                        }`}
                      >
                        <div className="flex items-center gap-4">
                          <Avatar className="h-12 w-12">
                            <AvatarImage src={selfAvatarUrl || ''} alt={user?.displayName || 'You'} className="object-cover" />
                            <AvatarFallback>
                              <User className="w-5 h-5 text-muted-foreground" />
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1">
                            <h4 className="font-display font-semibold text-foreground">Judge Yourself</h4>
                            <div className="flex items-center gap-1 mt-1">
                              <AlertTriangle className="w-3 h-3 text-warning" />
                              <span className="text-xs text-warning">
                                Lower success rate — don't open the door to fool yourself
                              </span>
                            </div>
                          </div>
                        </div>
                      </button>

                      <div className="mt-4 flex min-h-0 flex-1 flex-col gap-3">
                        <p className="shrink-0 text-xs uppercase tracking-widest text-muted-foreground">Your Friends</p>

                        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
                          {friends.map((friend) => (
                            <button
                              key={friend.id}
                              type="button"
                              onClick={() => setJudge({ id: friend.id, name: friend.name, avatar: friend.avatar, isSelf: false })}
                              className={`w-full p-5 rounded-[20px] border text-left transition-all ${
                                judge?.id === friend.id ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground/30'
                              }`}
                            >
                              <div className="flex items-center gap-4">
                                <Avatar className="h-12 w-12">
                                  <AvatarImage src={friend.avatar || ''} alt={friend.name} className="object-cover" />
                                  <AvatarFallback className="font-display font-bold text-muted-foreground">
                                    {friend.name.trim().charAt(0).toUpperCase() || '?'}
                                  </AvatarFallback>
                                </Avatar>
                                <div>
                                  <h4 className="font-display font-semibold text-foreground">{friend.name}</h4>
                                  <span className="text-xs text-muted-foreground">{friend.completedGoals} judgments made</span>
                                </div>
                              </div>
                            </button>
                          ))}

                          {!showAddFriendPanel ? (
                            <button
                              type="button"
                              aria-expanded={false}
                              onClick={() => setShowAddFriendPanel(true)}
                              className="w-full rounded-2xl border border-border bg-muted/25 p-3 text-left transition-colors hover:bg-muted/40"
                            >
                              <span className="inline-flex items-center gap-2 text-sm font-display font-semibold text-foreground">
                                <UserPlus className="h-4 w-4 text-muted-foreground" aria-hidden />
                                Add a friend
                              </span>
                            </button>
                          ) : (
                            <div
                              ref={addFriendPanelRef}
                              className="rounded-2xl border border-border bg-muted/25 p-4 space-y-3"
                            >
                              <button
                                type="button"
                                onClick={() => setShowAddFriendPanel(false)}
                                className="inline-flex items-center gap-2 text-sm font-display font-semibold text-foreground hover:text-foreground/80"
                              >
                                <UserPlus className="h-4 w-4 text-muted-foreground" aria-hidden />
                                Hide add a friend
                              </button>
                              <p className="text-[11px] text-muted-foreground leading-snug">
                                Find someone by Account ID or username. They must accept your friend request before you can
                                invite them as judge.
                              </p>
                              <div className="flex gap-2">
                                <input
                                  ref={addFriendInputRef}
                                  type="text"
                                  inputMode="text"
                                  autoComplete="off"
                                  value={judgeByIdInput}
                                  onChange={(e) => {
                                    setJudgeByIdInput(e.target.value);
                                    setJudgeByIdError(null);
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') void searchJudgeByFriendId();
                                  }}
                                  placeholder="Account ID or username"
                                  className="min-w-0 flex-1 rounded-xl bg-background/60 px-3 py-2.5 text-sm tabular-nums text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary [color-scheme:dark]"
                                />
                                <button
                                  type="button"
                                  disabled={judgeByIdSearching}
                                  onClick={() => void searchJudgeByFriendId()}
                                  className="shrink-0 rounded-xl bg-primary px-4 py-2.5 text-sm font-display font-bold text-primary-foreground disabled:opacity-50"
                                >
                                  {judgeByIdSearching ? '…' : 'Find'}
                                </button>
                              </div>
                              {judgeByIdError ? <p className="text-xs text-destructive">{judgeByIdError}</p> : null}
                              {judgeByIdResult ? (
                                <div className="flex items-center gap-3 rounded-xl border border-border bg-background/40 px-3 py-2.5">
                                  <Avatar className="h-10 w-10 shrink-0">
                                    <AvatarImage
                                      src={judgeByIdResult.avatar_url || ''}
                                      alt={judgeByIdResult.display_name || 'User'}
                                      className="object-cover"
                                    />
                                    <AvatarFallback className="font-display font-bold text-muted-foreground">
                                      {(judgeByIdResult.display_name || 'U').trim().charAt(0).toUpperCase()}
                                    </AvatarFallback>
                                  </Avatar>
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate font-display font-semibold text-sm text-foreground">
                                      {judgeByIdResult.display_name || 'User'}
                                    </p>
                                    {judgeByIdResult.friend_code ? (
                                      <p className="text-[11px] tabular-nums text-muted-foreground">{judgeByIdResult.friend_code}</p>
                                    ) : null}
                                  </div>
                                  {friends.some((f) => f.id === judgeByIdResult.id) ? (
                                    <button
                                      type="button"
                                      onClick={() => selectJudgeFromLookup(judgeByIdResult)}
                                      className="shrink-0 rounded-lg bg-primary px-3 py-2 text-xs font-display font-bold text-primary-foreground"
                                    >
                                      {judge?.id === judgeByIdResult.id ? 'Selected' : 'Choose judge'}
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      disabled={judgeByIdSending}
                                      onClick={() => void sendJudgeByIdFriendRequest()}
                                      className="shrink-0 rounded-lg bg-emerald-500/90 px-3 py-2 text-xs font-display font-bold text-emerald-950 disabled:opacity-60"
                                    >
                                      {judgeByIdSending ? '…' : 'Send request'}
                                    </button>
                                  )}
                                </div>
                              ) : null}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Step 3: Card details */}
              {step === 3 && tutorialCreateFlowActive && (
                <div className="flex flex-col flex-1 min-h-0">
                  <div className="space-y-6 flex-1">
                    <div className="rounded-2xl border border-border bg-muted/30 p-4">
                      <p className="text-sm font-display font-semibold text-foreground">Card details preview</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        In a real paid goal, you would enter your card details here.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-3 mt-8">
                    <button
                      type="button"
                      onClick={goBack}
                      className="flex-1 py-4 rounded-2xl bg-muted text-muted-foreground font-display font-semibold"
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      onClick={() => setStep(4)}
                      className="flex-1 py-4 rounded-2xl bg-primary text-primary-foreground font-display font-bold"
                    >
                      Continue
                    </button>
                  </div>
                </div>
              )}
              {step === 3 && !tutorialCreateFlowActive && (
                <div className="relative flex flex-col flex-1 min-h-0">
                  {cardStepSubmitting && (
                    <div
                      className="absolute inset-0 z-30 isolate flex flex-col items-center justify-center gap-3 rounded-2xl bg-background px-6"
                      aria-busy="true"
                      aria-live="polite"
                    >
                      <div className="h-7 w-7 animate-spin rounded-full border-2 border-primary/30 border-t-primary" aria-hidden />
                      <p className="text-sm text-muted-foreground">Saving your card securely…</p>
                    </div>
                  )}
                  <CardStepFields
                    stake={cardStepStakeMajor}
                    stakeCurrency={stakeCurrency}
                    onDropinReady={setBraintreeDropinInstance}
                    onCardFieldsCompleteChange={setCardFieldsComplete}
                    hideContent={cardStepSubmitting}
                  />
                  {!cardStepSubmitting && braintreeDropinInstance && (
                    <PaymentMethodConsentNotice
                      className="mt-4"
                      checked={paymentMethodConsent}
                      onCheckedChange={setPaymentMethodConsent}
                    />
                  )}
                  {!cardStepSubmitting && (
                    <div className="flex gap-3 mt-8">
                    <button
                      type="button"
                      onClick={goBack}
                      className="flex-1 py-4 rounded-2xl bg-muted text-muted-foreground font-display font-semibold"
                    >
                      Back
                    </button>
                    <CardStepContinueButton
                      dropinInstance={braintreeDropinInstance}
                      cardFieldsComplete={cardFieldsComplete}
                      consentAccepted={paymentMethodConsent}
                      onSubmittingChange={setCardStepSubmitting}
                      onPaymentMethodReady={({ token, customerId }) => {
                        setBraintreePaymentMethodToken(token);
                        setBraintreeCustomerId(customerId);
                        setStep(4);
                      }}
                    />
                    </div>
                  )}
                </div>
              )}

              {/* Step 4: Confirm */}
              {step === 4 && (
                <div className="relative flex min-h-0 flex-1 flex-col">
                  {signOverlayPhase !== 'idle' && (
                    <div
                      className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 rounded-2xl bg-background px-6"
                      aria-live="polite"
                    >
                      <SuccessMorphIcon
                        phase={signOverlayPhase === 'loading' ? 'loading' : 'success'}
                        size={56}
                        className="text-primary"
                      />
                      <p className="text-center text-sm text-muted-foreground">
                        {signOverlayPhase === 'loading' ? 'Creating your goal…' : 'You’re all set!'}
                      </p>
                    </div>
                  )}
                  <div className="shrink-0 rounded-[24px] bg-muted p-6 space-y-4">
                    <div className="flex justify-between">
                      <span className="text-xs uppercase tracking-widest text-muted-foreground">Goal</span>
                      <span className="text-sm text-foreground font-medium">{title}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-xs uppercase tracking-widest text-muted-foreground">Deadline</span>
                      <span className="text-sm text-foreground tabular-nums">{deadlineDate?.toLocaleDateString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-xs uppercase tracking-widest text-muted-foreground">Stake</span>
                      <span
                        className={
                          stake === 0
                            ? 'text-sm text-foreground font-medium'
                            : 'text-sm text-primary font-display font-bold tabular-nums'
                        }
                      >
                        {formatStakeAmount(stake, stakeCurrency)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-xs uppercase tracking-widest text-muted-foreground">Judge</span>
                      <span className="text-sm text-foreground">{judge?.name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-xs uppercase tracking-widest text-muted-foreground">Visibility</span>
                      <span className="text-sm text-foreground">{isPrivate ? 'Private' : 'Public'}</span>
                    </div>
                  </div>

                  <p className="pt-4 text-center text-xs font-medium uppercase tracking-widest text-muted-foreground/80">
                    HOLD TO ACCEPT
                  </p>
                  <div className="mt-auto flex shrink-0 gap-3 pt-6">
                    <button
                      type="button"
                      onClick={goBack}
                      className="flex-1 rounded-2xl bg-muted py-4 font-display font-semibold text-muted-foreground"
                    >
                      Back
                    </button>
                    <PublishButton
                      progressStyle="fill"
                      holdDuration={2000}
                      progressTickMs={30}
                      labels={{
                        idle: 'Create goal',
                        holding: 'Sure?',
                      }}
                      onBeforeHold={() => {
                        const err = getDeadlineValidationError(deadlineDate, deadline.length > 0, allowShortDeadlines);
                        if (err) {
                          toast.error(err);
                          return false;
                        }
                        return true;
                      }}
                      onPublish={performSign}
                      onSuccess={() => {
                        if (tutorialActive && isAppTutorialSheetPhase(tutorialPhase)) {
                          preserveDraftOnNextCloseRef.current = true;
                          onGoalCreatedInTutorial(createdGoalIdRef.current);
                        }
                        createdGoalIdRef.current = null;
                        handleClose();
                      }}
                      onPhaseChange={(p: PublishPhase) => {
                        if (p === 'publishing') setSignOverlayPhase('loading');
                        else if (p === 'success') setSignOverlayPhase('success');
                        else setSignOverlayPhase('idle');
                      }}
                      className="min-w-0 flex-1"
                    />
                  </div>
                </div>
              )}

              {/* Navigation: hide on card & confirm (those steps use Back + primary in a row) */}
              {step < 4 && step !== 3 && !(step === 2 && Boolean(judgeRequestId)) && (
                <div className="flex gap-3 mt-8">
                  {step > 0 && (
                    <button
                      type="button"
                      onClick={goBack}
                      className="flex-1 rounded-2xl bg-muted text-muted-foreground font-display font-semibold py-4"
                    >
                      Back
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => canNext() && goNext()}
                    disabled={!canNext()}
                    className="flex-1 rounded-2xl bg-primary text-primary-foreground font-display font-bold flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed py-4"
                  >
                    Continue <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </motion.div>
          </>
        )}
      </AnimatePresence>

      {open && sheetTutorialCalloutActive ? (
        <div
          className="fixed left-0 right-0 z-[45] flex justify-center px-4 pointer-events-none sm:px-6"
          style={{
            bottom: 'calc(min(640px, 90vh) + env(safe-area-inset-bottom, 0px) + 12px)',
          }}
        >
          <div className="pointer-events-auto w-full max-w-xl">
            <TutorialCard
              variant="chrome"
              exitPlacement="top-right"
              onExit={() => setConfirmCloseKind('tutorial-exit')}
              onGoBack={handleTutorialSheetGoBack}
              progressCurrent={progressCurrent}
              progressTotal={progressTotal}
              body={tutorialSheetOverlayBody}
              bodyClassName="max-h-[min(340px,48vh)] overflow-y-auto pr-1"
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
