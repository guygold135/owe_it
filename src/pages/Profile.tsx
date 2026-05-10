import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import * as React from "react";
import { motion } from "framer-motion";
import { Calendar, Camera, CheckCircle2, CircleX, Copy, IdCard, Loader2, Mail, Pencil, Plus, Trophy } from "lucide-react";
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
import { isElevenDigitDisplayName } from "@/lib/displayName";

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
  level: number;
  levelGoal: number | null;
  nextGoal: number;
  isCurrency?: boolean;
};

const GOAL_COUNT_MILESTONES = [1, 5, 10, 25, 50, 100] as const;
const DONATION_MILESTONES = [10, 50, 100, 250, 500, 1000] as const;

const goalLabel = (count: number) => `${count} goal${count === 1 ? "" : "s"}`;
const formatMilestone = (value: number, isCurrency: boolean) => (isCurrency ? `$${value}` : goalLabel(value));
const formatUsd = (value: number) => `$${Math.round(value).toLocaleString()}`;

function formatDate(d: Date | null) {
  if (!d) return "—";
  try {
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return String(d);
  }
}

function JudgeLinkIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" className={className} aria-hidden>
      <path
        fill="currentColor"
        d="M243.32,116.69l-16-16a16,16,0,0,0-20.84-1.53L156.84,49.52a16,16,0,0,0-1.52-20.84l-16-16a16,16,0,0,0-22.63,0l-64,64a16,16,0,0,0,0,22.63l16,16a16,16,0,0,0,20.83,1.52L96.69,124,31.31,189.38A25,25,0,0,0,66.63,224.7L132,159.32l7.17,7.16a16,16,0,0,0,1.52,20.84l16,16a16,16,0,0,0,22.63,0l64-64A16,16,0,0,0,243.32,116.69ZM80,104,64,88l64-64,16,16ZM55.32,213.38a9,9,0,0,1-12.69,0,9,9,0,0,1,0-12.68L108,135.32,120.69,148ZM101,105.66,145.66,61,195,110.34,150.35,155ZM168,192l-16-16,4-4h0l56-56h0l4-4,16,16Z"
      />
    </svg>
  );
}

function CharityDonationIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" fill="currentColor" viewBox="0 0 256 256" className={className} aria-hidden>
      <path d="M230.33,141.06a24.34,24.34,0,0,0-18.61-4.77C230.5,117.33,240,98.48,240,80c0-26.47-21.29-48-47.46-48A47.58,47.58,0,0,0,156,48.75,47.58,47.58,0,0,0,119.46,32C93.29,32,72,53.53,72,80c0,11,3.24,21.69,10.06,33a31.87,31.87,0,0,0-14.75,8.4L44.69,144H16A16,16,0,0,0,0,160v40a16,16,0,0,0,16,16H120a7.93,7.93,0,0,0,1.94-.24l64-16a6.94,6.94,0,0,0,1.19-.4L226,182.82l.44-.2a24.6,24.6,0,0,0,3.93-41.56ZM119.46,48A31.15,31.15,0,0,1,148.6,67a8,8,0,0,0,14.8,0,31.15,31.15,0,0,1,29.14-19C209.59,48,224,62.65,224,80c0,19.51-15.79,41.58-45.66,63.9l-11.09,2.55A28,28,0,0,0,140,112H100.68C92.05,100.36,88,90.12,88,80,88,62.65,102.41,48,119.46,48ZM16,160H40v40H16Zm203.43,8.21-38,16.18L119,200H56V155.31l22.63-22.62A15.86,15.86,0,0,1,89.94,128H140a12,12,0,0,1,0,24H112a8,8,0,0,0,0,16h32a8.32,8.32,0,0,0,1.79-.2l67-15.41.31-.08a8.6,8.6,0,0,1,6.3,15.9Z" />
    </svg>
  );
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
  const knownAchievementLevelsRef = useRef<Map<string, number>>(new Map());
  const initializedAchievementsRef = useRef(false);

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

  const handleEditDisplayNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value;
    if (isElevenDigitDisplayName(next)) {
      toast.error(
        "Display name cannot be exactly 11 digits (reserved). Add a letter or use a different length.",
        { id: "display-name-eleven-digits" },
      );
      setEditDisplayName(next.length > 0 ? next.slice(0, -1) : "");
      return;
    }
    setEditDisplayName(next);
  };

  const saveDisplayName = async () => {
    if (!user?.id) return;
    const displayNameInput = editDisplayName.trim();
    if (!displayNameInput) {
      toast.error("Display name is required.");
      return;
    }
    if (isElevenDigitDisplayName(displayNameInput)) {
      toast.error(
        "Display name cannot be exactly 11 digits (reserved). Add a letter or use a different length.",
      );
      return;
    }

    setEditSaving(true);
    try {
      const { data: isAvailable, error: availabilityError } = await supabase.rpc("is_display_name_available", {
        p_display_name: displayNameInput,
        p_exclude_user_id: user.id,
      });
      if (availabilityError) {
        throw availabilityError;
      }
      if (!isAvailable) {
        toast.error("That username is already taken.");
        return;
      }

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

    const ownStakedGoals = goals.filter((g) => g.stake > 0);
    const ownNonStakedGoals = goals.filter((g) => g.stake <= 0);
    const stakedCompleted = ownStakedGoals.filter((g) => g.status === "completed").length;
    const stakedFailed = ownStakedGoals.filter((g) => g.status === "failed").length;
    const stakedActive = ownStakedGoals.filter((g) => g.status === "active").length;
    const nonStakedCompleted = ownNonStakedGoals.filter((g) => g.status === "completed").length;
    const nonStakedFailed = ownNonStakedGoals.filter((g) => g.status === "failed").length;
    const nonStakedActive = ownNonStakedGoals.filter((g) => g.status === "active").length;

    const stakedResolved = stakedCompleted + stakedFailed;
    const nonStakedResolved = nonStakedCompleted + nonStakedFailed;
    const stakedSuccessRate = stakedResolved > 0 ? Math.round((stakedCompleted / stakedResolved) * 100) : null;
    const nonStakedSuccessRate =
      nonStakedResolved > 0 ? Math.round((nonStakedCompleted / nonStakedResolved) * 100) : null;
    const stakedOnTheLine = ownStakedGoals.reduce((sum, g) => sum + g.stake, 0);
    const stakedSaved = ownStakedGoals
      .filter((g) => g.status === "completed")
      .reduce((sum, g) => sum + g.stake, 0);
    const stakedNotSaved = ownStakedGoals
      .filter((g) => g.status === "failed")
      .reduce((sum, g) => sum + g.stake, 0);

    const stakedTotal = stakedCompleted + stakedFailed + stakedActive;
    const nonStakedTotal = nonStakedCompleted + nonStakedFailed + nonStakedActive;

    const pct = (value: number, total: number) => (total > 0 ? (value / total) * 100 : 0);

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
      stakedCompleted,
      stakedFailed,
      stakedActive,
      stakedResolved,
      stakedSuccessRate,
      stakedTotal,
      stakedOnTheLine,
      stakedSaved,
      stakedNotSaved,
      nonStakedCompleted,
      nonStakedFailed,
      nonStakedActive,
      nonStakedResolved,
      nonStakedSuccessRate,
      nonStakedTotal,
      stakedCompletedPct: pct(stakedCompleted, stakedTotal),
      stakedFailedPct: pct(stakedFailed, stakedTotal),
      stakedActivePct: pct(stakedActive, stakedTotal),
      nonStakedCompletedPct: pct(nonStakedCompleted, nonStakedTotal),
      nonStakedFailedPct: pct(nonStakedFailed, nonStakedTotal),
      nonStakedActivePct: pct(nonStakedActive, nonStakedTotal),
    };
  }, [goals, judgeGoals]);

  const achievements: Achievement[] = useMemo(() => {
    const goalsCreated = goals.length;
    const stakedGoalsCreated = goals.filter((g) => g.stake > 0).length;
    const goalsCompleted = stats.completedGoals;
    const stakedGoalsCompleted = goals.filter((g) => g.status === "completed" && g.stake > 0).length;
    const judgedGoalsResolved = stats.judgeResolved;
    const judgedStakedGoalsResolved = judgeGoals.filter((g) => g.status !== "active" && g.stake > 0).length;
    const donatedToCharity = goals
      .filter((g) => g.status === "failed" && g.stake > 0 && g.charityId != null)
      .reduce((sum, g) => sum + g.stake, 0);

    const buildProgressAchievement = ({
      id,
      title,
      icon,
      progress,
      milestones,
      isCurrency = false,
    }: {
      id: string;
      title: string;
      icon: ReactNode;
      progress: number;
      milestones: readonly number[];
      isCurrency?: boolean;
    }): Achievement => {
      const level = milestones.filter((m) => progress >= m).length;
      const nextGoal = milestones[Math.min(level, milestones.length - 1)];
      const levelGoal = level > 0 ? milestones[level - 1] : null;
      const description = isCurrency
        ? "Donate money to charity by failing staked charity goals."
        : `Progress through ${title.toLowerCase()} milestones.`;
      return {
        id,
        title,
        description,
        icon,
        progress,
        level,
        levelGoal,
        nextGoal,
        isCurrency,
      };
    };

    return [
      buildProgressAchievement({
        id: "creating-goals",
        title: "Creating goals",
        icon: <Plus className="w-4 h-4" />,
        progress: goalsCreated,
        milestones: GOAL_COUNT_MILESTONES,
      }),
      buildProgressAchievement({
        id: "completing-goals",
        title: "Completing goals",
        icon: <Trophy className="w-4 h-4" />,
        progress: goalsCompleted,
        milestones: GOAL_COUNT_MILESTONES,
      }),
      buildProgressAchievement({
        id: "judging-goals",
        title: "Judging goals",
        icon: <JudgeLinkIcon className="w-4 h-4" />,
        progress: judgedGoalsResolved,
        milestones: GOAL_COUNT_MILESTONES,
      }),
      buildProgressAchievement({
        id: "money-donated-charity",
        title: "Money donated to charity",
        icon: <CharityDonationIcon className="w-4 h-4" />,
        progress: donatedToCharity,
        milestones: DONATION_MILESTONES,
        isCurrency: true,
      }),
      buildProgressAchievement({
        id: "creating-staked-goals",
        title: "Creating staked goals",
        icon: <Plus className="w-4 h-4" />,
        progress: stakedGoalsCreated,
        milestones: GOAL_COUNT_MILESTONES,
      }),
      buildProgressAchievement({
        id: "completing-staked-goals",
        title: "Completing staked goals",
        icon: <Trophy className="w-4 h-4" />,
        progress: stakedGoalsCompleted,
        milestones: GOAL_COUNT_MILESTONES,
      }),
      buildProgressAchievement({
        id: "judging-staked-goals",
        title: "Judging staked goals",
        icon: <JudgeLinkIcon className="w-4 h-4" />,
        progress: judgedStakedGoalsResolved,
        milestones: GOAL_COUNT_MILESTONES,
      }),
    ];
  }, [stats, goals, judgeGoals]);

  const loading = goalsLoading || judgeGoalsLoading || profileLoading;

  useEffect(() => {
    if (loading) return;

    const levelById = new Map(achievements.map((achievement) => [achievement.id, achievement.level]));

    if (!initializedAchievementsRef.current) {
      knownAchievementLevelsRef.current = levelById;
      initializedAchievementsRef.current = true;
      return;
    }

    achievements.forEach((achievement) => {
      const prevLevel = knownAchievementLevelsRef.current.get(achievement.id) ?? 0;
      if (achievement.level <= prevLevel) return;
      for (let lvl = prevLevel + 1; lvl <= achievement.level; lvl += 1) {
        const goal = (achievement.isCurrency ? DONATION_MILESTONES : GOAL_COUNT_MILESTONES)[lvl - 1];
        const levelTitle = `${achievement.title} · Level ${lvl}`;
        const levelDesc = `Reached ${formatMilestone(goal, Boolean(achievement.isCurrency))}.`;
        void supabase
          .rpc("record_achievement_earned", {
            p_achievement_id: `${achievement.id}-lvl-${lvl}`,
            p_achievement_title: levelTitle,
            p_achievement_description: levelDesc,
          })
          .then(({ error }) => {
            if (error) {
              console.warn("Could not record achievement notification", error);
              toast.success("Achievement completed!", {
                id: `achievement-${achievement.id}-lvl-${lvl}`,
                description: `${levelTitle}: ${levelDesc}`,
              });
            }
          });
      }
    });

    knownAchievementLevelsRef.current = levelById;
  }, [achievements, loading]);

  useEffect(() => {
    initializedAchievementsRef.current = false;
    knownAchievementLevelsRef.current = new Map();
  }, [user?.id]);

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
                      onChange={handleEditDisplayNameChange}
                      autoComplete="nickname"
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
                    your account id {friendCodeDbReady ? friendCode ?? "…" : "unavailable"}
                  </span>
                  <button
                    type="button"
                    className="shrink-0 rounded-md p-1 transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                    disabled={!friendCodeDbReady || !friendCode}
                    aria-label="Copy Account ID"
                    title="Copy Account ID"
                    onClick={async () => {
                      if (!friendCode) return;
                      try {
                        if (navigator.clipboard?.writeText) {
                          await navigator.clipboard.writeText(friendCode);
                          toast.success("Account ID copied.");
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
                        toast.success("Account ID copied.");
                      } catch (e) {
                        console.error("Clipboard fallback error", e);
                        toast.error("Could not copy Account ID.");
                      }
                    }}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground tabular-nums">
                  <Calendar className="w-3.5 h-3.5 shrink-0" />
                  <span className="min-w-0 truncate">member since {formatDate(createdAt)}</span>
                </div>
              </div>
            </div>
          </div>
        </Card>

        <div className="p-5 rounded-[20px] bg-card border border-border">
          <h2 className="text-sm font-display font-semibold text-foreground">Your stats</h2>
          <div className="mt-3 grid grid-cols-3 gap-2">
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
            <div className="p-3 rounded-[16px] bg-muted/40 border border-border/40">
              <p className="text-xs text-muted-foreground">Staked money</p>
              <p className="text-lg font-display font-extrabold text-foreground tabular-nums mt-1">
                {formatUsd(stats.stakedOnTheLine)}
              </p>
              <p className="text-[11px] text-muted-foreground mt-1 tabular-nums">
                {formatUsd(stats.stakedSaved)} saved • {formatUsd(stats.stakedNotSaved)} donated
              </p>
            </div>
          </div>
          <div className="mt-4 rounded-[16px] border border-border/40 bg-muted/25 p-3">
            <p className="text-xs text-muted-foreground">Stake vs Non-stake success</p>
            <div className="mt-3 space-y-3">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-medium text-foreground">Staked goals</span>
                  <span className="tabular-nums text-muted-foreground">
                    {stats.stakedSuccessRate !== null ? `${stats.stakedSuccessRate}% success` : "No resolved goals"}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div className="flex h-full w-full">
                    <div className="bg-emerald-500" style={{ width: `${stats.stakedCompletedPct}%` }} />
                    <div className="bg-orange-500" style={{ width: `${stats.stakedFailedPct}%` }} />
                    <div className="bg-muted-foreground/50" style={{ width: `${stats.stakedActivePct}%` }} />
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground tabular-nums">
                  {stats.stakedCompleted} completed • {stats.stakedFailed} failed • {stats.stakedActive} active
                </p>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-medium text-foreground">Non-staked goals</span>
                  <span className="tabular-nums text-muted-foreground">
                    {stats.nonStakedSuccessRate !== null ? `${stats.nonStakedSuccessRate}% success` : "No resolved goals"}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div className="flex h-full w-full">
                    <div className="bg-emerald-500" style={{ width: `${stats.nonStakedCompletedPct}%` }} />
                    <div className="bg-orange-500" style={{ width: `${stats.nonStakedFailedPct}%` }} />
                    <div className="bg-muted-foreground/50" style={{ width: `${stats.nonStakedActivePct}%` }} />
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground tabular-nums">
                  {stats.nonStakedCompleted} completed • {stats.nonStakedFailed} failed • {stats.nonStakedActive} active
                </p>
              </div>
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
                const earned = a.level > 0;
                const nonStakedCategory =
                  a.id === "creating-goals" || a.id === "completing-goals" || a.id === "judging-goals";
                const levelTextClass = nonStakedCategory ? "text-yellow-200" : "text-emerald-500";
                const iconSpanClass = nonStakedCategory ? "text-yellow-200" : "text-primary";
                const progressFillClass = nonStakedCategory ? "bg-yellow-300" : "bg-primary";
                const pctRaw =
                  a.nextGoal <= 0 ? 100 : (Math.min(a.progress, a.nextGoal) / a.nextGoal) * 100;
                const pct = Number.isFinite(pctRaw) ? Math.round(pctRaw) : 0;
                const shownProgress = earned ? Math.min(a.progress, a.nextGoal) : a.progress;
                return (
                  <Card
                    key={a.id}
                    className={`p-4 rounded-[20px] bg-card border border-border ${
                      earned
                        ? nonStakedCategory
                          ? "border-yellow-300/25 bg-yellow-300/[0.06]"
                          : "border-primary/30 bg-primary/5"
                        : ""
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3 min-w-0">
                        <div
                          className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
                            earned
                              ? nonStakedCategory
                                ? "bg-yellow-300/15 text-yellow-200"
                                : "bg-primary/15 text-primary"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {earned ? (
                            <span className={iconSpanClass}>{a.icon}</span>
                          ) : (
                            <span>{a.icon}</span>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="font-display font-semibold text-foreground truncate">{a.title}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Next milestone {formatMilestone(a.nextGoal, Boolean(a.isCurrency))}
                          </p>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        {earned ? (
                          <div className={`inline-flex items-center gap-2 text-xs tabular-nums ${levelTextClass}`}>
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Level {a.level}
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-2 text-muted-foreground text-xs tabular-nums">
                            <CircleX className="w-3.5 h-3.5" />
                            Level 0
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="mt-3">
                      <Progress value={pct} indicatorClassName={progressFillClass} />
                      <p className="text-[11px] text-muted-foreground mt-2 tabular-nums">
                        {pct}% ({a.isCurrency ? `$${shownProgress}` : shownProgress} of {a.isCurrency ? `$${a.nextGoal}` : a.nextGoal})
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

