import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

export default function Settings() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

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

