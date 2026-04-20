import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { PulseItem } from '@/lib/types';
import { DEFAULT_STAKE_CURRENCY, formatStakeAmount } from '@/lib/currency';
import { PulseFailedIcon } from '@/components/icons/PulseFailedIcon';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Trophy, Plus, Zap } from 'lucide-react';

const rowIcons = {
  created: Plus,
  completed: Trophy,
  staked: Zap,
  achievement: Trophy,
} as const;

const labels = {
  created: 'set a new goal',
  completed: 'completed',
  failed: 'lost stake on',
  staked: 'is risking',
  achievement: 'earned achievement',
};

type ReactionVariant = 'cheer' | 'proud' | 'hype' | 'nudge' | 'support' | 'momentum';

const reactionOptionsByAction: Record<PulseItem['action'], { id: ReactionVariant; label: string }[]> = {
  completed: [
    { id: 'cheer', label: 'Send congrats' },
    { id: 'proud', label: 'Say your proud of them' },
    { id: 'hype', label: 'Hype them up' },
  ],
  created: [
    { id: 'nudge', label: 'Nudge them' },
    { id: 'support', label: 'Cheer them on' },
    { id: 'momentum', label: 'Stay locked in' },
  ],
  staked: [
    { id: 'nudge', label: 'Respect the stake' },
    { id: 'support', label: 'Big commitment' },
    { id: 'momentum', label: 'Stay locked in' },
  ],
  failed: [
    { id: 'support', label: 'Send support' },
    { id: 'nudge', label: 'Encourage reset' },
    { id: 'momentum', label: 'Back their comeback' },
  ],
  achievement: [
    { id: 'cheer', label: 'Send congrats' },
    { id: 'support', label: 'Celebrate this win' },
    { id: 'momentum', label: 'Tell them keep going' },
  ],
};

function timeAgo(date: Date) {
  const mins = Math.floor((Date.now() - date.getTime()) / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function PulsePartyPopperIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M5.8 11.3 2 22l10.7-3.79" />
      <path d="M4 3h.01" />
      <path d="M22 8h.01" />
      <path d="M15 2h.01" />
      <path d="M22 20h.01" />
      <path d="m22 2-2.24.75a2.9 2.9 0 0 0-1.96 3.12c.1.86-.57 1.63-1.45 1.63h-.38c-.86 0-1.6.6-1.76 1.44L14 10" />
      <path d="m22 13-.82-.33c-.86-.34-1.82.2-1.98 1.11c-.11.7-.72 1.22-1.43 1.22H17" />
      <path d="m11 2 .33.82c.34.86-.2 1.82-1.11 1.98C9.52 4.9 9 5.52 9 6.23V7" />
      <path d="M11 13c1.93 1.93 2.83 4.17 2 5-.83.83-3.07-.07-5-2-1.93-1.93-2.83-4.17-2-5 .83-.83 3.07.07 5 2Z" />
    </svg>
  );
}

function PulseNudgeSendIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
      <path d="M10 14l11 -11" />
      <path d="M21 3l-6.5 18a.55 .55 0 0 1 -1 0l-3.5 -7l-7 -3.5a.55 .55 0 0 1 0 -1l18 -6.5" />
    </svg>
  );
}

function PulseRowLeadingGlyph({ action }: { action: PulseItem['action'] }) {
  if (action === 'failed') return <PulseFailedIcon />;
  const Icon = rowIcons[action];
  return (
    <Icon
      className={`w-5 h-5 ${
        action === 'completed' || action === 'achievement' ? 'text-primary' : 'text-muted-foreground'
      }`}
    />
  );
}

function PulseReactionTriggerIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-4 h-4 text-muted-foreground"
      aria-hidden
    >
      <path d="M10.268 21a2 2 0 0 0 3.464 0" />
      <path d="M15 8h6" />
      <path d="M18 5v6" />
      <path d="M20.002 14.464a9 9 0 0 0 .738.863A1 1 0 0 1 20 17H4a1 1 0 0 1-.74-1.673C4.59 13.956 6 12.499 6 8a6 6 0 0 1 8.75-5.332" />
    </svg>
  );
}

export function PulseCard({ item, index }: { item: PulseItem; index: number }) {
  const { user } = useAuth();
  const isFailure = item.action === 'failed';
  const isCompleted = item.action === 'completed';
  const isAchievement = item.action === 'achievement';
  const [reactionSending, setReactionSending] = useState(false);
  const [reactionSent, setReactionSent] = useState(false);
  const [isReactionMenuOpen, setIsReactionMenuOpen] = useState(false);
  const reactionStorageKey = user?.id ? `pulse_reaction_sent:${user.id}:${item.id}` : null;
  const isReactionInactive = reactionSent || reactionSending || !user?.id;
  const reactionOptions = reactionOptionsByAction[item.action];

  useEffect(() => {
    if (!reactionStorageKey) return;
    try {
      setReactionSent(localStorage.getItem(reactionStorageKey) === '1');
    } catch {
      // Keep behavior functional even if storage is blocked.
    }
  }, [reactionStorageKey]);

  useEffect(() => {
    if (isReactionInactive) setIsReactionMenuOpen(false);
  }, [isReactionInactive]);

  const sendPulseReaction = async (variant: ReactionVariant) => {
    if (!user?.id || reactionSent || reactionSending) return;
    setReactionSending(true);
    try {
      const { error } = await supabase.rpc('send_pulse_reaction', {
        p_recipient_user_id: item.userId,
        p_goal_title: item.goalTitle,
        p_action: item.action,
        p_variant: variant,
      });
      if (error) {
        toast.error(error.message ?? 'Could not send message.');
        return;
      }
      setReactionSent(true);
      if (reactionStorageKey) {
        try {
          localStorage.setItem(reactionStorageKey, '1');
        } catch {
          // Ignore storage write failures.
        }
      }
      toast.success(`Message sent to ${item.userName}!`);
    } catch (e) {
      console.error(e);
      toast.error('Could not send message.');
    } finally {
      setReactionSending(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08, type: 'spring', stiffness: 300, damping: 30 }}
      className="p-5 rounded-[20px] bg-card border border-border"
    >
      <div className="flex items-start gap-4">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
          isFailure ? 'bg-warning/15' : isCompleted || isAchievement ? 'bg-primary/15' : 'bg-muted'
        }`}>
          <PulseRowLeadingGlyph action={item.action} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm">
            <span className="font-semibold text-foreground">{item.userName}</span>{' '}
            <span className="text-muted-foreground">{labels[item.action]}</span>{' '}
            <span className="font-medium text-foreground">"{item.goalTitle}"</span>
          </p>
          {(item.action === 'staked' || item.action === 'completed') && item.stake > 0 && (
            <p className="text-primary font-display font-bold text-lg mt-1 tabular-nums">
              {formatStakeAmount(item.stake, DEFAULT_STAKE_CURRENCY)}
            </p>
          )}
          {item.action === 'failed' && item.stake > 0 && (
            <p className="text-warning font-display font-bold text-lg mt-1 tabular-nums">
              {formatStakeAmount(-Math.abs(item.stake), DEFAULT_STAKE_CURRENCY)}
            </p>
          )}
          <p className="text-xs text-muted-foreground mt-2">{timeAgo(item.timestamp)}</p>
        </div>
        <DropdownMenu
          open={isReactionMenuOpen}
          onOpenChange={(nextOpen) => {
            if (isReactionInactive) {
              setIsReactionMenuOpen(false);
              return;
            }
            setIsReactionMenuOpen(nextOpen);
          }}
        >
          <DropdownMenuTrigger asChild disabled={isReactionInactive}>
            <button
              type="button"
              className={`p-2 rounded-xl transition-colors shrink-0 ${
                isReactionInactive
                  ? 'opacity-50 cursor-default'
                  : 'hover:bg-muted'
              }`}
              title={reactionSent ? 'Message already sent' : item.action === 'completed' ? 'Send congratulations' : 'Nudge'}
              aria-label={reactionSent ? 'Message already sent' : item.action === 'completed' ? 'Send congratulations for completed goal' : 'Nudge'}
              disabled={isReactionInactive}
            >
              <PulseReactionTriggerIcon />
            </button>
          </DropdownMenuTrigger>
          {!isReactionInactive && (
            <DropdownMenuContent align="end" className="w-52 rounded-xl">
              {reactionOptions.map((option) => (
                <DropdownMenuItem
                  key={option.id}
                  onSelect={() => {
                    void sendPulseReaction(option.id);
                  }}
                  disabled={reactionSent || reactionSending}
                >
                  {option.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          )}
        </DropdownMenu>
      </div>
    </motion.div>
  );
}
