import { motion } from 'framer-motion';
import { FriendCard, InviteFriendCard } from '@/components/FriendCard';
import { mockFriends } from '@/lib/mockData';

export default function Friends() {
  return (
    <div className="min-h-screen bg-background pb-28">
      <div className="px-6 pt-12 pb-6">
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

      <div className="px-6 space-y-4">
        <InviteFriendCard />
        {mockFriends.map((friend, i) => (
          <FriendCard key={friend.id} friend={friend} index={i} />
        ))}
      </div>
    </div>
  );
}
