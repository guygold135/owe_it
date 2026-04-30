import { motion } from "framer-motion";
import { Mail, MessageCircle } from "lucide-react";
import UserProfilePopover from "@/components/UserProfilePopover";
import { Button } from "@/components/ui/button";

export default function Help() {
  return (
    <div className="min-h-screen bg-background pb-28">
      <div className="px-6 pt-12 pb-6 flex items-start justify-between gap-4">
        <div>
          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-3xl font-display font-extrabold text-foreground tracking-tight"
          >
            Support
          </motion.h1>
          <p className="mt-2 text-sm font-medium text-foreground/90 leading-normal max-w-lg">
            we will like to help you with every kind of problem you have, contact us and we will
            reach back as soon as possible.
          </p>
        </div>
        <UserProfilePopover />
      </div>

      <div className="px-6">
        <div className="p-4 rounded-2xl bg-card border border-border space-y-3">
          <p className="text-sm text-muted-foreground">
            Choose how you want to reach us:
          </p>

          <Button variant="outline" className="w-full justify-start rounded-xl" asChild>
            <a href="mailto:support@oweit.site">
              <Mail className="mr-2 h-4 w-4" />
              Email: support@oweit.site
            </a>
          </Button>

          <Button variant="outline" className="w-full justify-start rounded-xl" asChild>
            <a href="https://wa.me/972526199901" target="_blank" rel="noopener noreferrer">
              <MessageCircle className="mr-2 h-4 w-4" />
              WhatsApp: +972 52-619-9901
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
}
