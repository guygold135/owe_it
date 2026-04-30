import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useAppTutorial } from "@/hooks/useAppTutorial";
import {
  Popover,
  PopoverBody,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { CircleHelp, Copy, History, MessageSquare, Settings, User } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/useAuth";
import { PopoverClose } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import {
  PROFILE_AVATAR_UPDATED_EVENT,
  readProfileAvatarFromStorage,
  writeProfileAvatarToStorage,
} from "@/lib/profileAvatarEvents";

export default function UserProfilePopover() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { profileMenuTutorial } = useAppTutorial();
  const [friendCode, setFriendCode] = useState<string | null>(null);
  const [friendCodeDbReady, setFriendCodeDbReady] = useState<boolean>(true);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const displayName =
    user?.displayName || (user?.email ? user.email.split("@")[0] : "Guest");
  const email = user?.email || "guest@example.com";
  const initial = (displayName || email).trim().charAt(0).toUpperCase();

  const displayAvatarSrc =
    (avatarUrl ?? readProfileAvatarFromStorage(user?.id))?.trim() || undefined;

  useEffect(() => {
    if (!user?.id) {
      setAvatarUrl(null);
      return;
    }

    const generateLocalFriendCode = () => {
      let s = "";
      for (let i = 0; i < 11; i += 1) s += Math.floor(Math.random() * 10).toString();
      return s;
    };

    const localKey = `friend_code_${user.id}`;
    const localExisting = window.localStorage.getItem(localKey);
    const localCandidate =
      localExisting && /^\d{11}$/.test(localExisting) ? localExisting : generateLocalFriendCode();
    window.localStorage.setItem(localKey, localCandidate);
    setFriendCode((prev) => prev ?? localCandidate);

    (async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("friend_code, avatar_url")
        .eq("id", user.id)
        .maybeSingle();

      if (error) {
        const msg = String((error as any)?.message ?? "").toLowerCase();
        if (msg.includes("friend_code") && (msg.includes("column") || msg.includes("schema") || msg.includes("does not exist"))) {
          setFriendCodeDbReady(false);
        }
        return;
      }
      const row = data as { friend_code?: string | null; avatar_url?: string | null } | null;
      const nextAvatar = row?.avatar_url?.trim() || null;
      setAvatarUrl(nextAvatar);
      writeProfileAvatarToStorage(user.id, nextAvatar);
      const existing = row?.friend_code ?? null;
      if (existing) {
        setFriendCode(existing);
        window.localStorage.setItem(localKey, existing);
        return;
      }

      // Best-effort persist if missing (handles first-run when migration is applied)
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const candidate = generateLocalFriendCode();
        const { data: updated, error: updateError } = await supabase
          .from("profiles")
          .update({ friend_code: candidate })
          .eq("id", user.id)
          .select("friend_code")
          .maybeSingle();

        if (!updateError) {
          const saved = (updated as any)?.friend_code ?? null;
          if (saved) {
            setFriendCode(saved);
            window.localStorage.setItem(localKey, saved);
          }
          break;
        }
        const umsg = String((updateError as any)?.message ?? "").toLowerCase();
        if (umsg.includes("friend_code") && (umsg.includes("column") || umsg.includes("schema") || umsg.includes("does not exist"))) {
          setFriendCodeDbReady(false);
          break;
        }
        const msg = String(updateError.message || "").toLowerCase();
        if (!msg.includes("duplicate") && !msg.includes("unique")) break;
      }
    })();
  }, [user?.id]);

  useEffect(() => {
    const refreshAvatar = () => {
      if (!user?.id) return;
      void supabase
        .from("profiles")
        .select("avatar_url")
        .eq("id", user.id)
        .maybeSingle()
        .then(({ data, error }) => {
          if (error || !user?.id) return;
          const row = data as { avatar_url?: string | null } | null;
          const next = row?.avatar_url?.trim() || null;
          setAvatarUrl(next);
          writeProfileAvatarToStorage(user.id, next);
        });
    };
    window.addEventListener(PROFILE_AVATAR_UPDATED_EVENT, refreshAvatar);
    return () => window.removeEventListener(PROFILE_AVATAR_UPDATED_EVENT, refreshAvatar);
  }, [user?.id]);

  const popoverOpen = profileMenuTutorial || open;

  return (
    <Popover
      open={popoverOpen}
      onOpenChange={(next) => {
        if (profileMenuTutorial && !next) return;
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          className={cn(
            "h-[42px] w-[42px] shrink-0 rounded-full p-0 overflow-hidden",
            profileMenuTutorial && "relative z-[47]",
            profileMenuTutorial && "ring-2 ring-primary ring-offset-2 ring-offset-background",
          )}
        >
          <Avatar className="h-[42px] w-[42px] rounded-full">
            <AvatarImage
              src={displayAvatarSrc}
              alt={displayName}
              className="object-cover"
              loading="eager"
              decoding="async"
            />
            <AvatarFallback className="rounded-full text-xs font-semibold">
              {initial}
            </AvatarFallback>
          </Avatar>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-62">
        <PopoverHeader>
          <div className="flex items-center space-x-3">
            <Avatar className="h-14 w-14 rounded-full">
              <AvatarImage
                src={displayAvatarSrc}
                alt={displayName}
                className="object-cover"
                loading="eager"
                decoding="async"
              />
              <AvatarFallback className="rounded-full">
                {initial}
              </AvatarFallback>
            </Avatar>
            <div>
              <PopoverTitle>{displayName}</PopoverTitle>
              <PopoverDescription className="text-xs">
                {email}
              </PopoverDescription>
              <PopoverDescription className="text-xs flex items-center gap-2">
                <span className="tabular-nums">
                  your account id {friendCodeDbReady ? (friendCode ?? "…") : "unavailable"}
                </span>
                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  aria-label="Copy Account ID"
                  onClick={async () => {
                    if (!friendCodeDbReady || !friendCode) return;
                    try {
                      if (navigator.clipboard?.writeText) {
                        await navigator.clipboard.writeText(friendCode);
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
                    } catch (e) {
                      console.error("Clipboard fallback error", e);
                    }
                  }}
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </PopoverDescription>
            </div>
          </div>
        </PopoverHeader>
        <PopoverBody className="space-y-1 px-2 py-1">
          <PopoverClose asChild>
            <Button
              variant="ghost"
              className="w-full justify-start"
              size="sm"
              onClick={() => navigate("/profile")}
            >
              <User className="mr-2 h-4 w-4" />
              View Profile
            </Button>
          </PopoverClose>
          <PopoverClose asChild>
            <Button
              variant="ghost"
              className="w-full justify-start"
              size="sm"
              onClick={() => navigate("/history")}
            >
              <History className="mr-2 h-4 w-4" strokeWidth={2} />
              History
            </Button>
          </PopoverClose>
          <PopoverClose asChild>
            <Button
              variant="ghost"
              className="w-full justify-start"
              size="sm"
              onClick={() => navigate("/feedback")}
            >
              <MessageSquare className="mr-2 h-4 w-4" />
              Feedback
            </Button>
          </PopoverClose>
          <PopoverClose asChild>
            <Button
              variant="ghost"
              className="w-full justify-start"
              size="sm"
              onClick={() => navigate("/help")}
            >
              <CircleHelp className="mr-2 h-4 w-4" />
              Support
            </Button>
          </PopoverClose>
          <PopoverClose asChild>
            <Button
              variant="ghost"
              className="w-full justify-start"
              size="sm"
              onClick={() => navigate("/settings")}
            >
              <Settings className="mr-2 h-4 w-4" />
              Settings
            </Button>
          </PopoverClose>
        </PopoverBody>
      </PopoverContent>
    </Popover>
  );
}

