import { motion } from 'framer-motion';
import { Friend } from '@/lib/types';
import { Target, Trophy, DollarSign, UserPlus, Share2 } from 'lucide-react';

export function FriendCard({ friend, index }: { friend: Friend; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, type: 'spring', stiffness: 300, damping: 30 }}
      className="p-5 rounded-[20px] bg-card border border-border"
    >
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center text-lg font-display font-bold text-muted-foreground">
          {friend.name.charAt(0)}
        </div>
        <div className="flex-1">
          <h4 className="font-display font-semibold text-foreground">{friend.name}</h4>
          <div className="flex items-center gap-4 mt-1">
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Target className="w-3 h-3" /> {friend.activeGoals} active
            </span>
            <span className="flex items-center gap-1 text-xs text-primary">
              <Trophy className="w-3 h-3" /> {friend.completedGoals} done
            </span>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground uppercase tracking-widest">Total staked</p>
          <p className="font-display font-bold text-foreground tabular-nums">${friend.totalStaked}</p>
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
