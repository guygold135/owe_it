import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import * as React from "react";
import { motion } from "framer-motion";
import { Calendar, Camera, CheckCircle2, CircleX, IdCard, Loader2, Mail, Pencil, Trophy, User } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useGoals } from "@/hooks/useGoals";
import { useGoalsAsJudge } from "@/hooks/useGoalsAsJudge";
import { supabase } from "@/integrations/supabase/client";
import UserProfilePopover from "@/components/UserProfilePopover";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  dispatchProfileAvatarUpdated,
  writeProfileAvatarToStorage,
} from "@/lib/profileAvatarEvents";
import { resizeImageToJpegBlob } from "@/lib/resizeAvatarImage";

type ProfileRow = {
  display_name: string;
  avatar_url: string | null;
  created_at: string | null;
};

type Achievement = {
  id: string;
  title: string;
  description: string;
  icon: ReactNode;
  progress: number;
  target: number;
};

function formatDate(d: Date | null) {
  if (!d) return "—";
  try {
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return String(d);
  }
}

function generateLocalFriendCode() {
  let s = "";
  for (let i = 0; i < 11; i += 1) s += Math.floor(Math.random() * 10).toString();
  return s;
}

class ProfileErrorBoundary extends React.Component<
  { children: ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override componentDidCatch(error: Error) {
    console.error("Profile page crashed:", error);
  }

  override render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-background px-6 py-12">
          <div className="p-5 rounded-[20px] bg-card border border-border">
            <p className="font-display font-semibold text-foreground">Could not load profile</p>
            <p className="text-xs text-muted-foreground mt-2 break-words">{this.state.error.message}</p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function ProfileInner() {
  const { user } = useAuth();
  const { goals, loading: goalsLoading } = useGoals();
  const { goals: judgeGoals, loading: judgeGoalsLoading } = useGoalsAsJudge();

  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);

  const [friendCode, setFriendCode] = useState<string | null>(null);
  const [friendCodeDbReady, setFriendCodeDbReady] = useState(true);

  const [isInlineEditingName, setIsInlineEditingName] = useState(false);
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const avatarFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user?.id) return;

    let isCancelled = false;
    const userId = user.id;
    const fallbackDisplayName = user.displayName ?? "";
    const localKey = `friend_code_${userId}`;
    const localExisting = window.localStorage.getItem(localKey);
    const localCandidate =
      localExisting && /^\d{11}$/.test(localExisting) ? localExisting : generateLocalFriendCode();
    window.localStorage.setItem(localKey, localCandidate);
    setFriendCode(localCandidate);

    (async () => {
      try {
        const { data: profileData, error: profileError } = await supabase
          .from("profiles")
          .select("display_name,avatar_url,created_at")
          .eq("id", userId)
          .maybeSingle();

        if (!isCancelled) {
          if (profileError) throw profileError;
          const safeProfileData = profileData as unknown as ProfileRow | null;
          setProfile(
            safeProfileData ?? {
              display_name: fallbackDisplayName,
              avatar_url: null,
              created_at: null,
            },
          );
          setProfileLoading(false);
        }
      } catch (e) {
        console.error("Error loading profile row", e);
        if (!isCancelled) {
          setProfile({
            display_name: fallbackDisplayName,
            avatar_url: null,
            created_at: null,
          });
          setProfileLoading(false);
        }
      }

      try {
        const { data: fcData, error: fcError } = await supabase
          .from("profiles")
          .select("friend_code")
          .eq("id", userId)
          .maybeSingle();

        if (fcError) {
          const msg = String((fcError as { message?: unknown } | null)?.message ?? "")
            .toLowerCase()
            .trim();
          if (
            msg.includes("friend_code") &&
            (msg.includes("column") || msg.includes("schema") || msg.includes("does not exist"))
          ) {
            if (!isCancelled) setFriendCodeDbReady(false);
            return;
          }
        }

        const dbFriendCode = (fcData as unknown as { friend_code?: string | null } | null)?.friend_code;
        if (dbFriendCode && /^\d{11}$/.test(dbFriendCode)) {
          window.localStorage.setItem(localKey, dbFriendCode);
          if (!isCancelled) setFriendCode(dbFriendCode);
        } else {
          // Best-effort: if friend_code exists but is empty, fill it.
          const candidate = generateLocalFriendCode();
          try {
            const { data: updated, error: updateError } = await supabase
              .from("profiles")
              .update({ friend_code: candidate })
              .eq("id", userId)
              .select("friend_code")
              .maybeSingle();

            const saved = (updated as unknown as { friend_code?: string | null } | null)?.friend_code;
            if (saved && /^\d{11}$/.test(saved)) {
              window.localStorage.setItem(localKey, saved);
              if (!isCancelled) setFriendCode(saved);
            }
          } catch (e) {
            // Ignore: friend_code provisioning is optional for the page.
            console.error("Error ensuring friend_code", e);
          }
        }
      } catch (e) {
        console.error("Error loading friend_code", e);
        // Friend code is still available locally.
      }
    })();

    return () => {
      isCancelled = true;
    };
  }, [user?.id, user?.displayName]);

  useEffect(() => {
    if (!user?.id || profileLoading) return;
    const url = profile?.avatar_url?.trim();
    writeProfileAvatarToStorage(user.id, url || null);
  }, [user?.id, profile?.avatar_url, profileLoading]);

  const email = user?.email ?? "guest@example.com";
  const displayName = profile?.display_name || user?.displayName || (email ? email.split("@")[0] : "Guest");
  const initial = (displayName || "Guest").trim().charAt(0).toUpperCase();

  const saveDisplayName = async () => {
    if (!user?.id) return;
    const displayNameInput = editDisplayName.trim();
    if (!displayNameInput) {
      toast.error("Display name is required.");
      return;
    }

    setEditSaving(true);
    try {
      const payload = {
        display_name: displayNameInput,
      };

      const { data: updatedData, error } = await supabase
        .from("profiles")
        .update(payload)
        .eq("id", user.id)
        .select("display_name")
        .maybeSingle();

      if (error) {
        const msg = String((error as { message?: unknown } | null)?.message ?? "");
        toast.error(msg || "Could not save profile.");
        return;
      }

      const updated = updatedData as unknown as { display_name: string } | null;

      setProfile((prev) => {
        const base =
          prev ?? ({
            display_name: user.displayName ?? "",
            avatar_url: null,
            created_at: null,
          } satisfies ProfileRow);
        return {
          ...base,
          display_name: updated?.display_name ?? displayNameInput,
        };
      });

      try {
        await supabase.auth.updateUser({
          data: { display_name: displayNameInput },
        });
      } catch (e) {
        console.error("Failed to update auth user_metadata display_name", e);
        toast.message("Saved profile name, but auth display name may take a moment.");
      }

      setIsInlineEditingName(false);
      toast.success("Profile updated.");
    } catch (err) {
      console.error("Error saving profile", err);
      toast.error("Could not save profile. Please try again.");
    } finally {
      setEditSaving(false);
    }
  };

  const handleAvatarFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !user?.id) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image.");
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      toast.error("Image is too large. Use one under 15 MB.");
      return;
    }
    setAvatarUploading(true);
    try {
      const blob = await resizeImageToJpegBlob(file);
      const path = `${user.id}/avatar.jpg`;
      const { error: uploadError } = await supabase.storage.from("avatars").upload(path, blob, {
        contentType: "image/jpeg",
        upsert: true,
      });
      if (uploadError) throw uploadError;
      const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
      const urlWithV = `${pub.publicUrl}${pub.publicUrl.includes("?") ? "&" : "?"}v=${Date.now()}`;
      const { error: dbError } = await supabase.from("profiles").update({ avatar_url: urlWithV }).eq("id", user.id);
      if (dbError) throw dbError;
      setProfile((prev) => {
        const base =
          prev ??
          ({
            display_name: user.displayName ?? "",
            avatar_url: null,
            created_at: null,
          } satisfies ProfileRow);
        return { ...base, avatar_url: urlWithV };
      });
      writeProfileAvatarToStorage(user.id, urlWithV);
      dispatchProfileAvatarUpdated();
      toast.success("Profile photo updated.");
    } catch (err) {
      console.error("Avatar upload", err);
      const message = String((err as { message?: string })?.message ?? err ?? "");
      const lower = message.toLowerCase();
      if (lower.includes("bucket") || lower.includes("not found")) {
        toast.error("Photo upload needs the avatars bucket on Supabase.", {
          description:
            "Dashboard → SQL → paste and run supabase/scripts/create_avatars_bucket.sql, or run: npx supabase db push",
        });
      } else if (lower.includes("row-level security") || lower.includes("violates") || lower.includes("policy")) {
        toast.error("Storage blocked this upload (missing policies).", {
          description: "Run supabase/scripts/create_avatars_bucket.sql in the Supabase SQL Editor.",
        });
      } else {
        toast.error("Could not update photo.", { description: message || "Try again." });
      }
    } finally {
      setAvatarUploading(false);
    }
  };

  const createdAt = profile?.created_at ? new Date(profile.created_at) : null;

  const stats = useMemo(() => {
    const completedGoals = goals.filter((g) => g.status === "completed").length;
    const failedGoals = goals.filter((g) => g.status === "failed").length;
    const resolvedGoals = completedGoals + failedGoals;
    const totalStaked = goals.reduce((sum, g) => sum + g.stake, 0);
    const resolvedStaked = goals
      .filter((g) => g.status !== "active")
      .reduce((sum, g) => sum + g.stake, 0);

    const judgeCompleted = judgeGoals.filter((g) => g.status === "completed").length;
    const judgeFailed = judgeGoals.filter((g) => g.status === "failed").length;
    const judgeResolved = judgeCompleted + judgeFailed;
    const judgeStakedTotal = judgeGoals.reduce((sum, g) => sum + g.stake, 0);
    const judgeResolvedStaked = judgeGoals
      .filter((g) => g.status !== "active")
      .reduce((sum, g) => sum + g.stake, 0);

    return {
      completedGoals,
      failedGoals,
      resolvedGoals,
      totalStaked,
      resolvedStaked,
      judgeCompleted,
      judgeFailed,
      judgeResolved,
      judgeStakedTotal,
      judgeResolvedStaked,
    };
  }, [goals, judgeGoals]);

  const achievements: Achievement[] = useMemo(() => {
    const list: Achievement[] = [
      {
        id: "first-finish",
        title: "First Finish",
        description: "Complete your first goal.",
        icon: <CheckCircle2 className="w-4 h-4" />,
        progress: stats.completedGoals,
        target: 1,
      },
      {
        id: "steady-finisher",
        title: "Steady Finisher",
        description: "Complete 5 goals.",
        icon: <Trophy className="w-4 h-4" />,
        progress: stats.completedGoals,
        target: 5,
      },
      {
        id: "resolved-10",
        title: "Resolution Machine",
        description: "Resolve 10 goals (completed or failed).",
        icon: <IdCard className="w-4 h-4" />,
        progress: stats.resolvedGoals,
        target: 10,
      },
      {
        id: "first-judge",
        title: "Trusted Judge",
        description: "Judge 1 resolved goal.",
        icon: <User className="w-4 h-4" />,
        progress: stats.judgeResolved,
        target: 1,
      },
      {
        id: "judge-mentor",
        title: "Judge Mentor",
        description: "Judge 5 resolved goals.",
        icon: <Trophy className="w-4 h-4" />,
        progress: stats.judgeResolved,
        target: 5,
      },
    ];

    return list;
  }, [stats]);

  const loading = goalsLoading || judgeGoalsLoading || profileLoading;

  return (
    <div className="min-h-screen bg-background pb-28">
      <div className="px-6 pt-12 pb-6 flex items-start justify-between gap-4">
        <div className="flex-1">
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-xs uppercase tracking-widest text-muted-foreground"
          >
            Owe It
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-3xl font-display font-extrabold text-foreground mt-2 tracking-tight"
          >
            Account & Achievements
          </motion.h1>
        </div>
        <UserProfilePopover />
      </div>

      <div className="px-6 space-y-6">
        <Card className="p-5 rounded-[20px] bg-card border border-border">
          <div className="flex items-start gap-4">
            <div className="shrink-0">
              <input
                ref={avatarFileInputRef}
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={handleAvatarFileChange}
              />
              <button
                type="button"
                disabled={!user?.id || avatarUploading || profileLoading}
                onClick={() => avatarFileInputRef.current?.click()}
                className="relative rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50"
                aria-label="Change profile photo"
              >
                <Avatar className="h-20 w-20 rounded-full">
                  <AvatarImage src={profile?.avatar_url || ""} alt={displayName} className="object-cover" />
                  <AvatarFallback className="rounded-full text-xl font-display font-semibold">{initial}</AvatarFallback>
                </Avatar>
                <span className="absolute -bottom-0.5 -right-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md ring-2 ring-card">
                  {avatarUploading ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <Camera className="h-4 w-4" aria-hidden />
                  )}
                </span>
              </button>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  {isInlineEditingName ? (
                    <Input
                      id="editDisplayName"
                      className="h-9 px-2 py-1 font-display font-semibold"
                      value={editDisplayName}
                      onChange={(e) => setEditDisplayName(e.target.value)}
                      autoComplete="name"
                      autoFocus
                      onBlur={() => {
                        void saveDisplayName();
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void saveDisplayName();
                        }
                        if (e.key === "Escape") {
                          setIsInlineEditingName(false);
                          setEditDisplayName(displayName);
                        }
                      }}
                    />
                  ) : (
                    <p className="font-display font-semibold text-foreground truncate">{displayName}</p>
                  )}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (isInlineEditingName) {
                      void saveDisplayName();
                      return;
                    }
                    setEditDisplayName(displayName);
                    setIsInlineEditingName(true);
                  }}
                  disabled={!user?.id || editSaving}
                  className={`shrink-0 ${isInlineEditingName ? "bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 hover:text-emerald-300" : ""}`}
                >
                  <Pencil className="w-4 h-4" />
                  {isInlineEditingName ? "Save" : "Edit"}
                </Button>
              </div>
              <div className="mt-3 space-y-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Mail className="w-3.5 h-3.5 shrink-0" />
                  <span className="min-w-0 truncate">{email}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground tabular-nums">
                  <IdCard className="w-3.5 h-3.5 shrink-0" />
                  <span className="min-w-0 truncate">
                    your friend id {friendCodeDbReady ? friendCode ?? "…" : "unavailable"}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground tabular-nums">
                  <Calendar className="w-3.5 h-3.5 shrink-0" />
                  <span className="min-w-0 truncate">member since {formatDate(createdAt)}</span>
                </div>
              </div>

              <div className="mt-4">
                <Button
                  variant="outline"
                  className="w-full"
                  disabled={!friendCodeDbReady || !friendCode}
                  onClick={async () => {
                    if (!friendCode) return;
                    try {
                      if (navigator.clipboard?.writeText) {
                        await navigator.clipboard.writeText(friendCode);
                        toast.success("Friend ID copied.");
                        return;
                      }
                    } catch (e) {
                      console.error("Clipboard error", e);
                    }
                    try {
                      const ta = document.createElement("textarea");
                      ta.value = friendCode;
                      ta.style.position = "fixed";
                      ta.style.left = "-9999px";
                      document.body.appendChild(ta);
                      ta.focus();
                      ta.select();
                      document.execCommand("copy");
                      document.body.removeChild(ta);
                      toast.success("Friend ID copied.");
                    } catch (e) {
                      console.error("Clipboard fallback error", e);
                      toast.error("Could not copy Friend ID.");
                    }
                  }}
                >
                  Copy Friend ID
                </Button>
              </div>
            </div>
          </div>
        </Card>

        <div className="p-5 rounded-[20px] bg-card border border-border">
          <h2 className="text-sm font-display font-semibold text-foreground">Your stats</h2>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="p-3 rounded-[16px] bg-muted/40 border border-border/40">
              <p className="text-xs text-muted-foreground">Resolved goals</p>
              <p className="text-2xl font-display font-extrabold text-foreground tabular-nums mt-1">
                {stats.resolvedGoals}
              </p>
              <p className="text-[11px] text-muted-foreground mt-1 tabular-nums">
                {stats.completedGoals} completed • {stats.failedGoals} failed
              </p>
            </div>
            <div className="p-3 rounded-[16px] bg-muted/40 border border-border/40">
              <p className="text-xs text-muted-foreground">Goals judged</p>
              <p className="text-2xl font-display font-extrabold text-foreground tabular-nums mt-1">
                {stats.judgeResolved}
              </p>
              <p className="text-[11px] text-muted-foreground mt-1 tabular-nums">
                {stats.judgeCompleted} completed • {stats.judgeFailed} failed
              </p>
            </div>
          </div>
        </div>

        <div>
          <h2 className="text-xs uppercase tracking-widest text-muted-foreground mb-4">Achievements</h2>

          {loading ? (
            <div className="space-y-3">
              {[0, 1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="h-24 rounded-[20px] bg-muted/40 animate-pulse border border-border/40"
                />
              ))}
            </div>
          ) : achievements.length === 0 ? (
            <div className="p-5 rounded-[20px] bg-card border border-border text-center">
              <p className="text-sm text-muted-foreground">No achievements yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {achievements.map((a) => {
                const earned = a.progress >= a.target;
                const pctRaw =
                  a.target <= 0 ? 100 : (Math.min(a.progress, a.target) / a.target) * 100;
                const pct = Number.isFinite(pctRaw) ? Math.round(pctRaw) : 0;
                return (
                  <Card
                    key={a.id}
                    className={`p-4 rounded-[20px] bg-card border border-border ${
                      earned ? "border-primary/30 bg-primary/5" : ""
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3 min-w-0">
                        <div
                          className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
                            earned ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {earned ? (
                            <span className="text-primary">{a.icon}</span>
                          ) : (
                            <span>{a.icon}</span>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="font-display font-semibold text-foreground truncate">{a.title}</p>
                          <p className="text-xs text-muted-foreground mt-1">{a.description}</p>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        {earned ? (
                          <div className="inline-flex items-center gap-2 text-emerald-500 text-xs tabular-nums">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Earned
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-2 text-muted-foreground text-xs tabular-nums">
                            <CircleX className="w-3.5 h-3.5" />
                            {a.progress}/{a.target}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="mt-3">
                      <Progress value={pct} />
                      <p className="text-[11px] text-muted-foreground mt-2 tabular-nums">
                        {pct}% ({a.progress} of {a.target})
                      </p>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Profile() {
  return (
    <ProfileErrorBoundary>
      <ProfileInner />
    </ProfileErrorBoundary>
  );
}

