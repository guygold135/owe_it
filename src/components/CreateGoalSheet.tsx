import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronRight, AlertTriangle, User, Users, Lock, Eye, CreditCard } from 'lucide-react';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { useGoals } from '@/hooks/useGoals';
import { useAuth } from '@/hooks/useAuth';
import { Goal, Judge, Friend } from '@/lib/types';
import { supabase } from '@/integrations/supabase/client';
import { stripePromise } from '@/lib/stripe';
import { toast } from 'sonner';

const steps = ['goal', 'stake', 'judge', 'card', 'confirm'] as const;

const PRESET_STAKES = [0, 10, 25, 50, 75, 100, 150, 200] as const;
const STRIPE_MIN_DOLLARS = 1; // App minimum stake for paid goals

const CARD_ELEMENT_OPTIONS = {
  style: {
    base: {
      fontSize: '16px',
      color: '#e2e8f0',
      '::placeholder': { color: '#94a3b8' },
    },
    invalid: {
      color: '#f87171',
    },
  },
};

function CardStepForm({ onPaymentMethodReady }: { onPaymentMethodReady: (pmId: string) => void }) {
  const stripe = useStripe();
  const elements = useElements();

  const handleContinue = async () => {
    if (!stripe || !elements) {
      toast.error('Payment system is still loading. Please wait a moment and try again.');
      return;
    }
    const cardEl = elements.getElement(CardElement);
    if (!cardEl) {
      toast.error('Please enter your card details.');
      return;
    }

    try {
      const { error, paymentMethod } = await stripe.createPaymentMethod({
        type: 'card',
        card: cardEl,
      });

      if (error) {
        toast.error(error.message ?? 'Could not add card.');
        return;
      }
      if (!paymentMethod?.id) {
        toast.error('Something went wrong saving your card. Please try again.');
        return;
      }
      onPaymentMethodReady(paymentMethod.id);
    } catch (err: any) {
      console.error('Stripe error', err);
      toast.error(err?.message ?? 'Something went wrong saving your card.');
    }
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Your card will be charged if you don’t complete your goal by the deadline.
      </p>

      <div className="p-4 bg-muted rounded-2xl">
        <CardElement options={CARD_ELEMENT_OPTIONS} />
      </div>

      <button
        type="button"
        onClick={handleContinue}
        className="w-full py-4 rounded-[13px] bg-[#4ade80] text-[#022c22] font-display font-bold flex items-center justify-center gap-2 transition-transform transition-colors hover:bg-[#22c55e] active:scale-[0.98]"
      >
        <CreditCard className="w-5 h-5" />
        Continue
      </button>
    </div>
  );
}

export function CreateGoalSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { addGoal, loadGoals } = useGoals();
  const { user } = useAuth();
  const [step, setStep] = useState(0);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [stake, setStake] = useState(0);
  const [deadline, setDeadline] = useState('');
  const [judge, setJudge] = useState<Judge | null>(null);
  const [isPrivate, setIsPrivate] = useState(false);
  const [paymentMethodId, setPaymentMethodId] = useState<string | null>(null);
  const [customStakeError, setCustomStakeError] = useState(false);
  const [customStakeInput, setCustomStakeInput] = useState('');
  const [signing, setSigning] = useState(false);
  const [signProgress, setSignProgress] = useState(0);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [judgeRequestId, setJudgeRequestId] = useState<string | null>(null);
  const [waitingJudgeName, setWaitingJudgeName] = useState<string | null>(null);
  const signIntervalRef = useRef<number | null>(null);

  const deadlineDate = useMemo(() => {
    if (!deadline) return null;
    const d = new Date(deadline);
    return Number.isNaN(d.getTime()) ? null : d;
  }, [deadline]);

  useEffect(() => {
    const loadFriends = async () => {
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

      const friendIds = (edges ?? []).map((e: any) => e.friend_user_id).filter(Boolean);
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

      const mapped = (profiles ?? []).map((p: any) => ({
        id: p.id,
        name: p.display_name ?? 'Friend',
        avatar: p.avatar_url ?? '',
        activeGoals: 0,
        completedGoals: 0,
        totalStaked: 0,
      }));
      mapped.sort((a: any, b: any) => String(a.name).localeCompare(String(b.name)));
      setFriends(mapped);
    };

    loadFriends();
  }, [user?.id]);

  useEffect(() => {
    if (!judgeRequestId) return;

    // Poll fallback (in case realtime isn't enabled for this table yet)
    const poll = window.setInterval(async () => {
      try {
        const { data, error } = await supabase
          .from('judge_requests')
          .select('status')
          .eq('id', judgeRequestId)
          .maybeSingle();
        if (error) return;
        const status = (data as any)?.status as string | undefined;
        if (status === 'accepted') {
          setJudgeRequestId(null);
          setWaitingJudgeName(null);
          setStep(stake > 0 ? 3 : 4);
        } else if (status === 'ignored' || status === 'cancelled') {
          setJudgeRequestId(null);
          setWaitingJudgeName(null);
        }
      } catch {
        // ignore
      }
    }, 1500);

    const channel = supabase
      .channel(`judge_request_${judgeRequestId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'judge_requests',
          filter: `id=eq.${judgeRequestId}`,
        },
        (payload) => {
          const status = (payload.new as any)?.status as string | undefined;
          if (status === 'accepted') {
            setJudgeRequestId(null);
            setWaitingJudgeName(null);
            // Move forward automatically
            setStep(stake > 0 ? 3 : 4);
          } else if (status === 'ignored' || status === 'cancelled') {
            setJudgeRequestId(null);
            setWaitingJudgeName(null);
            toast.error(status === 'ignored' ? 'Judge request was ignored.' : 'Judge request was cancelled.');
          }
        }
      )
      .subscribe();

    return () => {
      window.clearInterval(poll);
      void supabase.removeChannel(channel);
    };
  }, [judgeRequestId, stake]);

  const reset = () => {
    setStep(0); setTitle(''); setDescription(''); setStake(0);
    setDeadline(''); setJudge(null); setIsPrivate(false);
    setPaymentMethodId(null); setCustomStakeInput(''); setCustomStakeError(false);
    setSigning(false); setSignProgress(0);
    setJudgeRequestId(null); setWaitingJudgeName(null);
    if (signIntervalRef.current !== null) {
      clearInterval(signIntervalRef.current);
      signIntervalRef.current = null;
    }
  };

  const handleClose = () => { reset(); onClose(); };

  const canNext = () => {
    if (step === 0) return title.length > 0 && deadline.length > 0;
    if (step === 1) {
      if (customStakeInput.trim() !== '' && customStakeError) return false;
      return true;
    }
    if (step === 2) return judge !== null; // Judge step
    if (step === 3) return true; // Card step: "Continue" handles validation
    return true;
  };

  const goNext = () => {
    if (step === 1) {
      const raw = customStakeInput.trim();
      if (raw !== '') {
        const num = Number(raw);
        if (!Number.isFinite(num) || num < 0 || (num > 0 && num < STRIPE_MIN_DOLLARS)) {
          setCustomStakeError(true);
          return;
        }
        setCustomStakeError(false);
      }
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
          if (!deadlineDate) {
            toast.error('Please set a valid deadline.');
            return;
          }
          try {
            setWaitingJudgeName(judge.name);
            const payload = {
              title,
              description,
              stake,
              deadline: deadlineDate.toISOString(),
              isPrivate,
            };
            const { data, error } = await supabase.rpc('create_judge_request', {
              p_judge_user_id: judge.id,
              p_goal_payload: payload as any,
            });
            if (error) {
              console.error('Error creating judge request', error);
              toast.error(error.message ?? 'Could not send judge request.');
              setWaitingJudgeName(null);
              return;
            }
            setJudgeRequestId(data as any);
          } catch (e: any) {
            console.error('Unexpected judge request error', e);
            toast.error(e?.message ?? 'Could not send judge request.');
            setWaitingJudgeName(null);
          }
        })();
        return;
      }

      setStep(stake > 0 ? 3 : 4);
      return;
    }
    setStep((s) => s + 1);
  };

  const goBack = () => {
    // From card go back to judge
    if (step === 3) {
      setStep(2);
      return;
    }
    setStep((s) => s - 1);
  };

  const handleSign = () => {
    if (signIntervalRef.current !== null) return;

    setSigning(true);
    let progress = 0;
    const interval = window.setInterval(() => {
      progress += 1;
      setSignProgress(Math.min(progress, 100));
      if (progress >= 100) {
        clearInterval(interval);
        signIntervalRef.current = null;
        (async () => {
          try {
            const amountInCents = Math.round(stake * 100);

            if (stake === 0) {
              const newGoal: Goal = {
                id: Date.now().toString(),
                title,
                description,
                stake: 0,
                deadline: new Date(deadline),
                createdAt: new Date(),
                status: 'active',
                judge: judge!,
                isPrivate,
              };
              await addGoal(newGoal);
              toast.success('Goal created.');
              handleClose();
              return;
            }

            if (!paymentMethodId || !user?.id) {
              toast.error('Payment method or user missing.');
              setSigning(false);
              setSignProgress(0);
              return;
            }

            const { data, error } = await supabase.functions.invoke('create-checkout', {
              body: {
                paymentMethodId,
                userId: user.id,
                goalTitle: title,
                description,
                deadline: new Date(deadline).toISOString(),
                judgeName: judge?.isSelf ? null : judge?.name,
                judgeUserId: judge?.isSelf ? user.id : judge?.id,
                isPrivate,
                amount: amountInCents,
              },
            });

            if (error) {
              console.error('Error charging card', error);
              toast.error(data?.error ?? 'Could not charge card. Goal was not created.');
              setSigning(false);
              setSignProgress(0);
              return;
            }

            const payload = data as any;
            if (!payload?.success) {
              toast.error(payload?.error ?? 'Payment failed. Goal was not created.');
              setSigning(false);
              setSignProgress(0);
              return;
            }

            toast.success('Goal created and payment successful.');
            // Social Pulse event (friends feed)
            try {
              if (!isPrivate) {
                await supabase.from('pulse_events').insert({
                  user_id: user.id,
                  action: stake > 0 ? 'staked' : 'created',
                  goal_title: title,
                  stake,
                } as any);
              }
            } catch (e) {
              console.error('Error inserting pulse event', e);
            }
            await loadGoals();
            handleClose();
          } catch (err: any) {
            console.error('Unexpected error', err);
            toast.error(err?.message ?? 'Something went wrong. Goal was not created.');
            setSigning(false);
            setSignProgress(0);
          }
        })();
      }
    }, 30);
    signIntervalRef.current = interval;
  };

  const handleSignEnd = () => {
    if (signIntervalRef.current !== null) {
      clearInterval(signIntervalRef.current);
      signIntervalRef.current = null;
    }
    if (signProgress < 100) {
      setSigning(false);
      setSignProgress(0);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40"
            onClick={handleClose}
          />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 35 }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-[#0f0f0f] border-t border-border rounded-t-[32px] h-[640px] max-h-[90vh] overflow-hidden"
          >
            <div className="p-6 h-full flex flex-col">
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-display font-bold text-foreground">
                  {step === 0 && 'Define Your Goal'}
                  {step === 1 && 'Set Your Stake'}
                  {step === 2 && 'Choose Your Judge'}
                  {step === 3 && 'Card details'}
                  {step === 4 && 'Sign the Contract'}
                </h2>
                <button onClick={handleClose} className="p-2 rounded-xl hover:bg-muted transition-colors">
                  <X className="w-5 h-5 text-muted-foreground" />
                </button>
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
                <div className="space-y-5 flex-1">
                  <div>
                    <label className="text-xs uppercase tracking-widest text-muted-foreground mb-2 block">Goal Title</label>
                    <input
                      type="text"
                      value={title}
                      onChange={e => setTitle(e.target.value)}
                      placeholder="e.g., Finish Portfolio"
                      className="w-full bg-muted rounded-2xl px-5 py-4 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary font-display text-lg"
                    />
                  </div>
                  <div>
                    <label className="text-xs uppercase tracking-widest text-muted-foreground mb-2 block">Description (optional)</label>
                    <textarea
                      value={description}
                      onChange={e => setDescription(e.target.value)}
                      placeholder="What exactly needs to get done?"
                      rows={3}
                      className="w-full bg-muted rounded-2xl px-5 py-4 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs uppercase tracking-widest text-muted-foreground mb-2 block">Deadline</label>
                    <input
                      type="datetime-local"
                      value={deadline}
                      onChange={e => setDeadline(e.target.value)}
                      className="w-full bg-muted rounded-2xl px-5 py-4 text-foreground focus:outline-none focus:ring-2 focus:ring-primary [color-scheme:dark]"
                    />
                  </div>
                  <div className="flex items-center justify-between p-4 bg-muted rounded-2xl">
                    <div className="flex items-center gap-3">
                      {isPrivate ? <Lock className="w-4 h-4 text-muted-foreground" /> : <Eye className="w-4 h-4 text-muted-foreground" />}
                      <span className="text-sm text-foreground">{isPrivate ? 'Private goal' : 'Visible to friends'}</span>
                    </div>
                    <button
                      onClick={() => setIsPrivate(!isPrivate)}
                      className={`w-12 h-7 rounded-full transition-colors relative ${isPrivate ? 'bg-primary' : 'bg-border'}`}
                    >
                      <div className={`w-5 h-5 rounded-full bg-foreground absolute top-1 transition-transform ${isPrivate ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>
                </div>
              )}

              {/* Step 1: Stake */}
              {step === 1 && (
                <div className="space-y-5 flex-1">
                  <div className="text-center py-4">
                    <p className="text-xs uppercase tracking-widest text-muted-foreground mb-4">Your Stake</p>
                    <motion.div
                      key={stake}
                      initial={{ scale: 1 }}
                      animate={{ scale: [1, 1.05, 1] }}
                      transition={{ duration: 0.2 }}
                      className="text-6xl font-display font-extrabold text-primary tabular-nums tracking-tighter"
                    >
                      ${stake.toFixed(2)}
                    </motion.div>
                    <p className="text-sm text-muted-foreground mt-4">
                      Put money on the line!
                      <br />
                      If you fail, this amount will be charged.
                    </p>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {PRESET_STAKES.map(amount => (
                      <button
                        key={amount}
                        type="button"
                        onClick={() => {
                          setStake(amount);
                          setCustomStakeInput('');
                        }}
                        className={`py-3 rounded-2xl font-display font-bold text-sm transition-all ${
                          customStakeInput === '' && stake === amount
                            ? 'bg-primary text-primary-foreground glow-primary'
                            : 'bg-muted text-muted-foreground hover:bg-muted/80'
                        }`}
                      >
                        {amount === 0 ? 'Free' : `$${amount}`}
                      </button>
                    ))}
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs uppercase tracking-widest text-muted-foreground block">
                      Or custom amount
                    </label>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground font-display">$</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={customStakeInput || (PRESET_STAKES.includes(stake as typeof PRESET_STAKES[number]) ? '' : stake.toString())}
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
                            if (num === 0 || num >= STRIPE_MIN_DOLLARS) {
                              setStake(Math.round(num * 100) / 100);
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
                          if (num > 0 && num < STRIPE_MIN_DOLLARS) {
                            toast.error(`Minimum charge is $${STRIPE_MIN_DOLLARS.toFixed(2)} (Stripe requirement).`);
                            setCustomStakeInput('');
                            setStake(0);
                            return;
                          }
                          const rounded = Math.round(num * 100) / 100;
                          setStake(rounded);
                          setCustomStakeInput(
                            rounded === Math.floor(rounded) ? rounded.toString() : rounded.toFixed(2)
                          );
                        }}
                        className={`flex-1 bg-muted rounded-2xl px-4 py-3 text-foreground font-display font-semibold tabular-nums placeholder:text-muted-foreground focus:outline-none focus:ring-2 [color-scheme:dark] border ${
                          customStakeError ? 'border-destructive ring-destructive' : 'border-transparent focus:ring-primary'
                        }`}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">Minimum $1 for a stake.</p>
                  </div>
                </div>
              )}

              {/* Step 2: Judge */}
              {step === 2 && (
                <div className="space-y-4 flex-1">
                  {judgeRequestId && (
                    <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
                      <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center mb-4">
                        <Users className="w-5 h-5 text-emerald-400" />
                      </div>
                      <p className="text-sm text-foreground font-display font-semibold">
                        waiting for {waitingJudgeName ?? 'your friend'} to accept
                      </p>
                      <p className="text-xs text-muted-foreground mt-2">
                        They’ll see your goal details and can accept or ignore.
                      </p>
                      <button
                        type="button"
                        onClick={async () => {
                          if (!judgeRequestId) return;
                          const { error } = await supabase.rpc('cancel_judge_request', { p_request_id: judgeRequestId });
                          if (error) console.error('Cancel judge request error', error);
                          setJudgeRequestId(null);
                          setWaitingJudgeName(null);
                        }}
                        className="mt-6 w-full py-3 rounded-2xl bg-muted text-muted-foreground font-display font-semibold"
                      >
                        Back
                      </button>
                    </div>
                  )}

                  {!judgeRequestId && (
                    <>
                      {/* Self judge option */}
                      <button
                        onClick={() => setJudge({ id: 'self', name: 'You', avatar: '', isSelf: true })}
                        className={`w-full p-5 rounded-[20px] border text-left transition-all ${
                          judge?.isSelf ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground/30'
                        }`}
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                            <User className="w-5 h-5 text-muted-foreground" />
                          </div>
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

                      <p className="text-xs uppercase tracking-widest text-muted-foreground pt-2">Your Friends</p>

                      <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                        {friends.map(friend => (
                          <button
                            key={friend.id}
                            onClick={() => setJudge({ id: friend.id, name: friend.name, avatar: '', isSelf: false })}
                            className={`w-full p-5 rounded-[20px] border text-left transition-all ${
                              judge?.id === friend.id ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground/30'
                            }`}
                          >
                            <div className="flex items-center gap-4">
                              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center font-display font-bold text-muted-foreground">
                                {friend.name.charAt(0)}
                              </div>
                              <div>
                                <h4 className="font-display font-semibold text-foreground">{friend.name}</h4>
                                <span className="text-xs text-muted-foreground">{friend.completedGoals} judgments made</span>
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Step 3: Card details (only when stake > 0) */}
              {step === 3 && (
                <div className="space-y-6 flex-1">
                  {stripePromise && (
                    <Elements stripe={stripePromise}>
                      <CardStepForm
                        onPaymentMethodReady={(id) => {
                          setPaymentMethodId(id);
                          setStep(4);
                        }}
                      />
                    </Elements>
                  )}
                </div>
              )}

              {/* Step 4: Confirm */}
              {step === 4 && (
                <div className="space-y-6">
                  <div className="p-6 rounded-[24px] bg-muted space-y-4">
                    <div className="flex justify-between">
                      <span className="text-xs uppercase tracking-widest text-muted-foreground">Goal</span>
                      <span className="text-sm text-foreground font-medium">{title}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-xs uppercase tracking-widest text-muted-foreground">Deadline</span>
                      <span className="text-sm text-foreground tabular-nums">{new Date(deadline).toLocaleDateString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-xs uppercase tracking-widest text-muted-foreground">Stake</span>
                      <span className="text-sm text-primary font-display font-bold tabular-nums">${stake.toFixed(2)}</span>
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

                  {/* Long press to sign */}
                  <div className="relative">
                    <motion.button
                      onMouseDown={handleSign}
                      onMouseUp={handleSignEnd}
                      onMouseLeave={handleSignEnd}
                      onTouchStart={handleSign}
                      onTouchEnd={handleSignEnd}
                      className="w-full py-6 bg-primary text-primary-foreground rounded-2xl font-display font-bold text-lg glow-primary relative overflow-hidden"
                    >
                      <div
                        className="absolute inset-0 bg-primary-foreground/20"
                        style={{ width: `${signProgress}%`, transition: 'width 10ms linear' }}
                      />
                      <span className="relative z-10">
                        {signing ? 'SIGNING...' : `HOLD TO SIGN — $${stake.toFixed(2)}`}
                      </span>
                    </motion.button>
                    <p className="text-xs text-muted-foreground text-center mt-3">Hold for 3 seconds to commit</p>
                  </div>
                </div>
              )}

              {/* Navigation: hide on card step (has its own button) and on confirm */}
              {step < 4 && step !== 3 && !(step === 2 && Boolean(judgeRequestId)) && (
                <div className="flex gap-3 mt-8">
                  {step > 0 && (
                    <button
                      type="button"
                      onClick={goBack}
                      className="flex-1 py-4 rounded-2xl bg-muted text-muted-foreground font-display font-semibold"
                    >
                      Back
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => canNext() && goNext()}
                    disabled={!canNext()}
                    className="flex-1 py-4 rounded-2xl bg-primary text-primary-foreground font-display font-bold flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Continue <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}
              {step === 3 && (
                <div className="mt-8">
                  <button
                    type="button"
                    onClick={goBack}
                    className="w-full py-4 rounded-[13px] bg-transparent text-muted-foreground font-display font-semibold"
                  >
                    Back
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
