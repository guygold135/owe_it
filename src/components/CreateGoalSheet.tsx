import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronRight, AlertTriangle, User, Users, Lock, Eye } from 'lucide-react';
import { useGoals } from '@/hooks/useGoals';
import { Goal, Judge } from '@/lib/types';
import { mockFriends } from '@/lib/mockData';

const steps = ['goal', 'stake', 'judge', 'confirm'] as const;

export function CreateGoalSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { addGoal } = useGoals();
  const [step, setStep] = useState(0);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [stake, setStake] = useState(0);
  const [deadline, setDeadline] = useState('');
  const [judge, setJudge] = useState<Judge | null>(null);
  const [isPrivate, setIsPrivate] = useState(false);
  const [signing, setSigning] = useState(false);
  const [signProgress, setSignProgress] = useState(0);

  const reset = () => {
    setStep(0); setTitle(''); setDescription(''); setStake(0);
    setDeadline(''); setJudge(null); setIsPrivate(false);
    setSigning(false); setSignProgress(0);
  };

  const handleClose = () => { reset(); onClose(); };

  const canNext = () => {
    if (step === 0) return title.length > 0 && deadline.length > 0;
    if (step === 1) return true;
    if (step === 2) return judge !== null;
    return true;
  };

  const handleSign = () => {
    setSigning(true);
    let progress = 0;
    const interval = setInterval(() => {
      progress += 3.3;
      setSignProgress(Math.min(progress, 100));
      if (progress >= 100) {
        clearInterval(interval);
        const newGoal: Goal = {
          id: Date.now().toString(),
          title,
          description,
          stake,
          deadline: new Date(deadline),
          createdAt: new Date(),
          status: 'active',
          judge: judge!,
          isPrivate,
        };
        addGoal(newGoal);
        handleClose();
      }
    }, 10);
  };

  const handleSignEnd = () => {
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
            className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border rounded-t-[32px] max-h-[90vh] overflow-y-auto"
          >
            <div className="p-6">
              {/* Header */}
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-xl font-display font-bold text-foreground">
                  {step === 0 && 'Define Your Goal'}
                  {step === 1 && 'Set Your Stake'}
                  {step === 2 && 'Choose Your Judge'}
                  {step === 3 && 'Sign the Contract'}
                </h2>
                <button onClick={handleClose} className="p-2 rounded-xl hover:bg-muted transition-colors">
                  <X className="w-5 h-5 text-muted-foreground" />
                </button>
              </div>

              {/* Step indicators */}
              <div className="flex gap-2 mb-8">
                {steps.map((_, i) => (
                  <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${i <= step ? 'bg-primary' : 'bg-muted'}`} />
                ))}
              </div>

              {/* Step 0: Goal */}
              {step === 0 && (
                <div className="space-y-6">
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
                <div className="space-y-8">
                  <div className="text-center py-8">
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
                    <p className="text-sm text-muted-foreground mt-4">This amount will be charged if you fail</p>
                  </div>
                  <div className="grid grid-cols-4 gap-3">
                    {[0, 10, 25, 50, 75, 100, 150, 200].map(amount => (
                      <button
                        key={amount}
                        onClick={() => setStake(amount)}
                        className={`py-3 rounded-2xl font-display font-bold text-sm transition-all ${
                          stake === amount
                            ? 'bg-primary text-primary-foreground glow-primary'
                            : 'bg-muted text-muted-foreground hover:bg-muted/80'
                        }`}
                      >
                        {amount === 0 ? 'Free' : `$${amount}`}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Step 2: Judge */}
              {step === 2 && (
                <div className="space-y-4">
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
                          <span className="text-xs text-warning">Lower success rate — easier to cheat</span>
                        </div>
                      </div>
                    </div>
                  </button>

                  <p className="text-xs uppercase tracking-widest text-muted-foreground pt-2">Your Friends</p>

                  {mockFriends.map(friend => (
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
              )}

              {/* Step 3: Confirm */}
              {step === 3 && (
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
                    <p className="text-xs text-muted-foreground text-center mt-3">Hold for 1 second to commit</p>
                  </div>
                </div>
              )}

              {/* Navigation */}
              {step < 3 && (
                <div className="flex gap-3 mt-8">
                  {step > 0 && (
                    <button
                      onClick={() => setStep(s => s - 1)}
                      className="flex-1 py-4 rounded-2xl bg-muted text-muted-foreground font-display font-semibold"
                    >
                      Back
                    </button>
                  )}
                  <button
                    onClick={() => canNext() && setStep(s => s + 1)}
                    disabled={!canNext()}
                    className="flex-1 py-4 rounded-2xl bg-primary text-primary-foreground font-display font-bold flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
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
  );
}
