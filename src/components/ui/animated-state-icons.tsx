import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

export interface SuccessMorphIconProps {
  /** `loading` = spinning ring; `success` = ring + checkmark */
  phase: 'loading' | 'success';
  size?: number;
  color?: string;
  className?: string;
}

/**
 * Spinner morphs into a check when `phase` becomes `success`.
 */
export function SuccessMorphIcon({ phase, size = 48, color = 'currentColor', className }: SuccessMorphIconProps) {
  const done = phase === 'success';

  return (
    <svg
      viewBox="0 0 40 40"
      fill="none"
      className={cn('shrink-0', className)}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <circle cx="20" cy="20" r="16" stroke={color} strokeWidth={2} className="opacity-25" />

      {!done && (
        <motion.g
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          style={{ transformOrigin: '20px 20px' }}
        >
          <circle
            cx="20"
            cy="20"
            r="16"
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
            strokeDasharray="25 75"
            fill="none"
          />
        </motion.g>
      )}

      {done && (
        <motion.circle
          cx="20"
          cy="20"
          r="16"
          stroke={color}
          strokeWidth={2}
          fill="none"
          initial={{ opacity: 0.35 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.35 }}
        />
      )}

      <motion.path
        d="M12 20l6 6 10-12"
        stroke={color}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        initial={false}
        animate={done ? { pathLength: 1, opacity: 1 } : { pathLength: 0, opacity: 0 }}
        transition={{ duration: 0.4, delay: done ? 0.12 : 0 }}
      />
    </svg>
  );
}
