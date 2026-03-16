import { motion } from 'framer-motion';
import { PulseCard } from '@/components/PulseCard';
import { mockPulse } from '@/lib/mockData';
import { Clock } from 'lucide-react';

export default function Pulse() {
  return (
    <div className="min-h-screen bg-background pb-28">
      <div className="px-6 pt-12 pb-6">
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
          className="text-3xl font-display font-extrabold text-foreground mt-2 tracking-tight"
        >
          What's happening
        </motion.h1>
        <div className="flex items-center gap-2 mt-3">
          <Clock className="w-3 h-3 text-muted-foreground" />
          <p className="text-xs text-muted-foreground">Last 24 hours</p>
        </div>
      </div>

      <div className="px-6 space-y-4">
        {mockPulse.map((item, i) => (
          <PulseCard key={item.id} item={item} index={i} />
        ))}
      </div>
    </div>
  );
}
