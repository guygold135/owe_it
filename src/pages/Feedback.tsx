import { useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

const SUBJECT_OPTIONS = [
  "Improvement idea",
  "Technical problem",
  "Payment problem",
  "Account issue",
  "Bug report",
  "Feature request",
  "Other",
] as const;

export default function Feedback() {
  const [subjectType, setSubjectType] = useState<(typeof SUBJECT_OPTIONS)[number] | "">("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!subjectType) {
      toast.error("Please select a subject category.");
      return;
    }

    const trimmedMessage = message.trim();
    if (!trimmedMessage) {
      toast.error("Please write your feedback before sending.");
      return;
    }

    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("submit-feedback", {
        body: {
          category: subjectType,
          message: trimmedMessage,
        },
      });

      if (error) {
        throw new Error(error.message || "Failed to submit feedback.");
      }
      if (data?.error) {
        throw new Error(data.error);
      }

      setMessage("");
      setSubjectType("");
      toast.success("Feedback sent. Thank you!");
      if (data?.emailed === false) {
        toast.message("Saved successfully. Email forwarding is not configured yet.");
      }
    } catch (err: any) {
      toast.error(err?.message || "Could not send feedback. Please try again.");
    } finally {
      setSubmitting(false);
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
          Feedback
        </motion.h1>
        <p className="text-sm text-muted-foreground mt-2">
          Tell us what is working well and what we should improve.
        </p>
      </div>

      <div className="px-6">
        <div className="p-4 rounded-2xl bg-card border border-border space-y-4">
          <div className="space-y-2">
            <label htmlFor="feedback-subject-type" className="text-sm font-medium text-foreground">
              Subject category
            </label>
            <select
              id="feedback-subject-type"
              value={subjectType}
              onChange={(e) => setSubjectType(e.target.value as (typeof SUBJECT_OPTIONS)[number] | "")}
              className="w-full bg-muted rounded-xl px-3 py-2 text-sm text-foreground border border-border focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="" disabled>
                Select a category
              </option>
              {SUBJECT_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label htmlFor="feedback-message" className="text-sm font-medium text-foreground">
              Your feedback
            </label>
            <textarea
              id="feedback-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={6}
              placeholder="Share your feedback here..."
              className="w-full resize-none bg-muted rounded-xl px-3 py-2 text-sm text-foreground border border-border focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <Button className="w-full" onClick={() => void handleSubmit()} disabled={submitting}>
            {submitting ? "Sending..." : "Send feedback"}
          </Button>
        </div>
      </div>
    </div>
  );
}
