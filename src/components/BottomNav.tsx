import { NavLink, useLocation } from 'react-router-dom';
import { Target, Zap, Users, Plus, Scale } from 'lucide-react';

export function BottomNav({ onCreateGoal }: { onCreateGoal: () => void }) {
  const location = useLocation();

  const navItems = [
    { to: '/', icon: Target, label: 'Goals' },
    { to: '/my-judges', icon: Scale, label: 'My judges' },
    { to: '/pulse', icon: Zap, label: 'Pulse' },
    { to: '/friends', icon: Users, label: 'Friends' },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 z-30 bg-card/90 backdrop-blur-xl border-t border-border">
      <div className="flex items-center justify-around px-4 py-3 max-w-lg mx-auto">
        {navItems.map(item => {
          const isActive = location.pathname === item.to;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className="flex flex-col items-center gap-1 px-4 py-1"
            >
              <item.icon className={`w-5 h-5 transition-colors ${isActive ? 'text-primary' : 'text-muted-foreground'}`} />
              <span className={`text-xs font-medium transition-colors ${isActive ? 'text-primary' : 'text-muted-foreground'}`}>
                {item.label}
              </span>
            </NavLink>
          );
        })}
        <button
          onClick={onCreateGoal}
          className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center glow-primary -mt-3"
        >
          <Plus className="w-6 h-6 text-primary-foreground" />
        </button>
      </div>
    </div>
  );
}
