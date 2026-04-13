import { NavLink, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Target, Zap, Users, Plus, Scale } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { prefetchPath } from '@/lib/prefetchTabs';

export function BottomNav({
  onCreateGoal,
  fabTutorialSpotlight,
  highlightTab,
  tabTourBlocking,
}: {
  onCreateGoal: () => void;
  fabTutorialSpotlight?: boolean;
  highlightTab?: 'goals' | 'judge' | 'pulse' | 'friends' | null;
  tabTourBlocking?: boolean;
}) {
  const location = useLocation();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const navItems = [
    { to: '/', icon: Target, label: 'Goals', key: 'goals' as const },
    { to: '/my-judges', icon: Scale, label: 'Goals I judge', key: 'judge' as const },
    { to: '/pulse', icon: Zap, label: 'Pulse', key: 'pulse' as const },
    { to: '/friends', icon: Users, label: 'Friends', key: 'friends' as const },
  ];

  const warm = (path: string) => {
    prefetchPath(queryClient, path, user?.id);
  };

  return (
    <div
      className={cn(
        'fixed left-0 right-0 bg-card/90 backdrop-blur-xl border-t border-border',
        highlightTab || tabTourBlocking ? 'z-[50]' : fabTutorialSpotlight ? 'z-[43]' : 'z-30',
      )}
      style={{ bottom: 'env(safe-area-inset-bottom)' }}
    >
      <div
        className={cn(
          'flex items-center px-2 py-3 max-w-lg mx-auto gap-1',
          tabTourBlocking && 'pointer-events-none',
        )}
      >
        <div className="relative flex flex-1 min-w-0 justify-around items-center">
          {fabTutorialSpotlight ? (
            <div
              className="absolute inset-0 z-[1] rounded-2xl bg-background/55 backdrop-blur-md pointer-events-auto"
              aria-hidden
            />
          ) : null}
          {navItems.map(item => {
            const isActive = location.pathname === item.to;
            const isHi = highlightTab === item.key;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                onMouseEnter={() => warm(item.to)}
                onFocus={() => warm(item.to)}
                onTouchStart={() => warm(item.to)}
                className={cn(
                  'relative z-[2] flex flex-col items-center gap-1 px-3 py-1 rounded-xl transition-shadow',
                  fabTutorialSpotlight && 'pointer-events-none opacity-40 blur-[1px]',
                  isHi && 'ring-2 ring-primary ring-offset-2 ring-offset-card z-[3]',
                )}
              >
                <item.icon className={`w-5 h-5 transition-colors ${isActive ? 'text-primary' : 'text-muted-foreground'}`} />
                <span className={`text-xs font-medium transition-colors ${isActive ? 'text-primary' : 'text-muted-foreground'}`}>
                  {item.label}
                </span>
              </NavLink>
            );
          })}
        </div>
        <button
          type="button"
          onClick={onCreateGoal}
          className={cn(
            'relative z-[4] shrink-0 w-12 h-12 rounded-2xl bg-primary flex items-center justify-center glow-primary -mt-3',
            fabTutorialSpotlight && 'shadow-lg shadow-primary/30',
          )}
        >
          <Plus className="w-6 h-6 text-primary-foreground" />
        </button>
      </div>
    </div>
  );
}
