import { useAuth } from "@/hooks/useAuth";
import { isAdminViewer } from "@/lib/adminViewer";
import AdminFeedback from "./AdminFeedback";
import Feedback from "./Feedback";

/**
 * Admins only see the inbox at `/feedback`; everyone else gets the submit form.
 */
export default function FeedbackRouter() {
  const { user } = useAuth();
  if (isAdminViewer(user)) return <AdminFeedback />;
  return <Feedback />;
}
