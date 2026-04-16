import { motion } from 'framer-motion';
import { Friend } from '@/lib/types';
import { MoreHorizontal, Trophy, UserPlus, Share2 } from 'lucide-react';
import { convertStakeAmount, formatStakeAmount } from '@/lib/currency';
import { useStakeCurrencyPreference } from '@/hooks/useStakeCurrencyPreference';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';

export function FriendCard({
  friend,
  index,
  onRemove,
  removing = false,
}: {
  friend: Friend;
  index: number;
  onRemove?: (friend: Friend) => void;
  removing?: boolean;
}) {
  const { currency: selectedCurrency } = useStakeCurrencyPreference();
  const convertedTotalStaked = convertStakeAmount(friend.totalStaked, 'usd', selectedCurrency);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, type: 'spring', stiffness: 300, damping: 30 }}
      className="p-5 rounded-[20px] bg-card border border-border"
    >
      <div className="flex items-center gap-4">
        <Avatar className="h-12 w-12">
          <AvatarImage src={friend.avatar || ''} alt={friend.name} className="object-cover" />
          <AvatarFallback className="text-lg font-display font-bold text-muted-foreground">
            {friend.name.charAt(0)}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1">
          <h4 className="font-display font-semibold text-foreground">{friend.name}</h4>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="flex flex-col items-center text-xs text-primary">
              <span className="flex items-center gap-1.5">
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
                  className="icon icon-tabler icons-tabler-outline icon-tabler-moneybag h-3.5 w-3.5"
                >
                  <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                  <path d="M9.5 3h5a1.5 1.5 0 0 1 1.5 1.5a3.5 3.5 0 0 1 -3.5 3.5h-1a3.5 3.5 0 0 1 -3.5 -3.5a1.5 1.5 0 0 1 1.5 -1.5" />
                  <path d="M4 17v-1a8 8 0 1 1 16 0v1a4 4 0 0 1 -4 4h-8a4 4 0 0 1 -4 -4" />
                </svg>
                <span className="font-display font-bold tabular-nums">
                  {formatStakeAmount(convertedTotalStaked, selectedCurrency)}
                </span>
              </span>
              <span className="uppercase tracking-widest text-[10px] text-muted-foreground">Staked</span>
            </span>
            <span className="flex flex-col items-center text-xs text-orange-400">
              <span className="flex items-center gap-1.5">
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
                  className="h-3.5 w-3.5"
                  aria-hidden
                >
                  <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                  <path d="M12 10.941c2.333 -3.308 .167 -7.823 -1 -8.941c0 3.395 -2.235 5.299 -3.667 6.706c-1.43 1.408 -2.333 3.294 -2.333 5.588c0 3.704 3.134 6.706 7 6.706c3.866 0 7 -3.002 7 -6.706c0 -1.712 -1.232 -4.403 -2.333 -5.588c-2.084 3.353 -3.257 3.353 -4.667 2.235" />
                </svg>
                <span className="font-display font-bold tabular-nums">{friend.activeGoals}</span>
              </span>
              <span className="text-muted-foreground">Active</span>
            </span>
            <span className="flex flex-col items-center text-xs text-amber-400">
              <span className="flex items-center gap-1.5">
                <Trophy className="h-3.5 w-3.5" />
                <span className="font-display font-bold tabular-nums">{friend.completedGoals}</span>
              </span>
              <span className="text-muted-foreground">Done</span>
            </span>
          </div>
        </div>
        <div className="ml-auto flex items-start gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={removing}
                className="h-9 w-9 shrink-0 rounded-full text-muted-foreground hover:text-foreground"
                aria-label={`Open actions for ${friend.name}`}
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={() => onRemove?.(friend)}
              >
                Remove friend
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </motion.div>
  );
}

export function InviteFriendCard() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-5 rounded-[20px] border-2 border-dashed border-muted cursor-pointer hover:border-primary/40 transition-colors"
    >
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
          <UserPlus className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1">
          <h4 className="font-display font-semibold text-foreground">Invite a Friend</h4>
          <p className="text-xs text-muted-foreground mt-0.5">Send them a download link to join Owe It</p>
        </div>
        <Share2 className="w-5 h-5 text-muted-foreground" />
      </div>
    </motion.div>
  );
}
