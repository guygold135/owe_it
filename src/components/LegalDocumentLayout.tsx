import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import UserProfilePopover from '@/components/UserProfilePopover';
import { LEGAL_EFFECTIVE_DATE } from '@/lib/legal';
import { useAuth } from '@/hooks/useAuth';

export function LegalDocumentLayout({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const { user } = useAuth();
  const { pathname } = useLocation();

  return (
    <motion.article
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="min-h-screen bg-background pb-28"
    >
      <header className="px-6 pt-12 pb-4 flex items-start justify-between gap-4">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="min-w-0 flex-1"
        >
          <Link
            to={user ? '/' : '/auth'}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors mb-4"
          >
            <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
            Back
          </Link>
          <h1 className="text-3xl font-display font-extrabold text-foreground tracking-tight">
            {title}
          </h1>
          <p className="mt-2 text-xs text-muted-foreground">
            Effective {LEGAL_EFFECTIVE_DATE}
          </p>
        </motion.div>
        {user ? <UserProfilePopover /> : null}
      </header>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="px-6 pb-8 max-w-prose"
      >
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="legal-prose space-y-6 text-sm leading-relaxed text-foreground/90"
        >
          {children}
        </motion.div>

        <nav
          className="mt-10 pt-6 border-t border-border flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground"
          aria-label="Related legal pages"
        >
          {pathname !== '/terms' && (
            <Link to="/terms" className="font-medium hover:text-foreground underline-offset-2 hover:underline">
              Terms of Service
            </Link>
          )}
          {pathname !== '/privacy' && (
            <Link to="/privacy" className="font-medium hover:text-foreground underline-offset-2 hover:underline">
              Privacy Policy
            </Link>
          )}
        </nav>
      </motion.div>
    </motion.article>
  );
}

export function LegalSection({
  id,
  title,
  children,
}: {
  id?: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="text-base font-display font-bold text-foreground mb-2">{title}</h2>
      <motion.div className="space-y-3 text-muted-foreground [&_strong]:text-foreground [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5">
        {children}
      </motion.div>
    </section>
  );
}
