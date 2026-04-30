import { motion } from 'framer-motion';
import { PulseCard } from '@/components/PulseCard';
import { Clock } from 'lucide-react';
import UserProfilePopover from '@/components/UserProfilePopover';
import { usePulse } from '@/hooks/usePulse';
import { PulseListSkeleton } from '@/components/PageSkeletons';

export default function Pulse() {
  const { items, loading } = usePulse();

  return (
    <div className="min-h-screen bg-background pb-28">
      <div className="px-6 pt-12 pb-6 flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-xs uppercase tracking-widest text-muted-foreground"
          >
            Social Pulse
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mt-2 pr-4 text-base sm:text-xl font-display font-extrabold leading-snug tracking-tight text-balance text-foreground"
          >
            <span className="block whitespace-nowrap">See the promises people make.</span>
            <span className="block whitespace-nowrap">Watch who follows through.</span>
          </motion.h1>
          <div className="flex items-center gap-2 mt-3">
            <Clock className="w-3 h-3 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">Last 24 hours</p>
          </div>
        </div>
        <UserProfilePopover />
      </div>

      <div className="px-6 space-y-4">
        {loading ? (
          <PulseListSkeleton />
        ) : items.length === 0 ? (
          <div className="p-6 rounded-[24px] bg-card border border-border text-center">
            <p className="text-sm text-muted-foreground">
              Nothing here yet. When your friends create goals, stake, or finish something, it will show up for
              24 hours. Same for your friends when you do something.
            </p>
            <p className="text-xs text-muted-foreground mt-3">
              Add friends on the Friends tab to see their activity here.
            </p>
          </div>
        ) : (
          items.map((item, i) => <PulseCard key={item.id} item={item} index={i} />)
        )}
      </div>
    </div>
  );
}
