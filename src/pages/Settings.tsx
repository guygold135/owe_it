import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { SUPPORTED_STAKE_CURRENCIES, formatStakeCurrencyLabel, type StakeCurrency } from '@/lib/currency';
import { useStakeCurrencyPreference } from '@/hooks/useStakeCurrencyPreference';
import { useShortDeadlineTesting } from '@/hooks/useShortDeadlineTesting';

export default function Settings() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const { currency, setCurrency } = useStakeCurrencyPreference();
  const { enabled: allowShortDeadlines, setEnabled: setAllowShortDeadlines } = useShortDeadlineTesting();
  const [currencySearch, setCurrencySearch] = useState('');
  const [currencyPickerOpen, setCurrencyPickerOpen] = useState(false);
  const currencyPickerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setCurrencySearch(formatStakeCurrencyLabel(currency));
  }, [currency]);

  const filteredCurrencies = useMemo(() => {
    const q = currencySearch.trim().toLowerCase();
    if (!q) return SUPPORTED_STAKE_CURRENCIES;
    return SUPPORTED_STAKE_CURRENCIES.filter((code) => {
      const label = formatStakeCurrencyLabel(code).toLowerCase();
      return label.includes(q) || code.toLowerCase().includes(q);
    });
  }, [currencySearch]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!currencyPickerRef.current) return;
      if (!currencyPickerRef.current.contains(event.target as Node)) {
        setCurrencyPickerOpen(false);
        setCurrencySearch(formatStakeCurrencyLabel(currency));
      }
    };
    window.addEventListener('mousedown', onPointerDown);
    return () => window.removeEventListener('mousedown', onPointerDown);
  }, [currency]);

  const handleDeleteAccount = async () => {
    if (!user) return;
    setLoading(true);

    try {
      // Delete all user-related data we can access from the client
      await supabase.from('goals').delete().eq('user_id', user.id);
      await supabase.from('friends').delete().eq('owner_id', user.id).or(`user_id.eq.${user.id}`);

      // Mark profile as deleted if profiles table exists
      await supabase.from('profiles').update({ display_name: '[deleted]' }).eq('id', user.id);

      await signOut();
      toast.success('Your data has been removed from this app.');
      navigate('/auth', { replace: true });
    } catch (error: any) {
      console.error('Error deleting account', error);
      toast.error('Could not delete account. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-28">
      <div className="px-6 pt-12 pb-6">
        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-3xl font-display font-extrabold text-foreground tracking-tight"
        >
          Settings
        </motion.h1>
        <p className="text-sm text-muted-foreground mt-2">
          Manage your account and data.
        </p>
      </div>

      <div className="px-6 space-y-6">
        <div className="p-4 rounded-2xl bg-card border border-border space-y-3">
          <div>
            <p className="text-sm font-medium text-foreground">Stake currency</p>
            <p className="text-xs text-muted-foreground">
              New goals and card charges will use this currency. Existing goals keep their original currency.
            </p>
          </div>
          <div ref={currencyPickerRef} className="relative">
            <input
              type="text"
              value={currencySearch}
              onFocus={() => {
                setCurrencyPickerOpen(true);
                setCurrencySearch('');
              }}
              onChange={(e) => {
                setCurrencySearch(e.target.value);
                setCurrencyPickerOpen(true);
              }}
              placeholder="Search currency..."
              className="w-full bg-muted rounded-xl px-3 py-2 text-sm text-foreground border border-border focus:outline-none focus:ring-2 focus:ring-primary"
            />
            {currencyPickerOpen && (
              <div className="absolute z-20 mt-2 w-full max-h-56 overflow-y-auto rounded-xl border border-border bg-card shadow-lg">
                {filteredCurrencies.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-muted-foreground">No currencies found.</p>
                ) : (
                  filteredCurrencies.map((code) => (
                    <button
                      key={code}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setCurrency(code as StakeCurrency);
                        setCurrencySearch(formatStakeCurrencyLabel(code as StakeCurrency));
                        setCurrencyPickerOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                        code === currency
                          ? 'bg-muted text-primary font-medium'
                          : 'text-foreground hover:bg-muted'
                      }`}
                    >
                      {formatStakeCurrencyLabel(code as StakeCurrency)}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-card border border-border space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-foreground">Allow short deadlines (testing)</p>
              <p className="text-xs text-muted-foreground">
                Enables creating goals with deadlines in less than 24 hours.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setAllowShortDeadlines(!allowShortDeadlines)}
              className={`w-12 h-7 rounded-full transition-colors relative ${allowShortDeadlines ? 'bg-primary' : 'bg-border'}`}
              aria-label="Toggle short deadline testing mode"
            >
              <div className={`w-5 h-5 rounded-full bg-foreground absolute top-1 transition-transform ${allowShortDeadlines ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-card border border-border space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-destructive/10 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4 text-destructive" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Delete account</p>
              <p className="text-xs text-muted-foreground">
                This will remove your goals and related data from this app and sign you out.
              </p>
            </div>
          </div>
          <Button
            variant="destructive"
            className="w-full"
            disabled={loading}
            onClick={handleDeleteAccount}
          >
            {loading ? 'Deleting…' : 'Delete my account'}
          </Button>
        </div>
      </div>
    </div>
  );
}

