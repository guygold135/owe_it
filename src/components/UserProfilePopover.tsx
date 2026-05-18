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
import { CircleHelp, History, MessageSquare, Settings, User } from "lucide-react";
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

    void supabase
      .from("profiles")
      .select("avatar_url")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) return;
        const row = data as { avatar_url?: string | null } | null;
        const nextAvatar = row?.avatar_url?.trim() || null;
        setAvatarUrl(nextAvatar);
        writeProfileAvatarToStorage(user.id, nextAvatar);
      });
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
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-52 max-w-[min(13rem,calc(100vw-1.5rem))] overflow-hidden p-0"
      >
        <PopoverHeader className="px-2.5 py-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <Avatar className="h-10 w-10 shrink-0 rounded-full">
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
            <div className="min-w-0 flex-1">
              <PopoverTitle className="truncate text-sm leading-tight">{displayName}</PopoverTitle>
              <PopoverDescription className="truncate text-xs">
                {email}
              </PopoverDescription>
            </div>
          </div>
        </PopoverHeader>
        <PopoverBody className="space-y-0.5 p-2">
          <PopoverClose asChild>
            <Button
              variant="ghost"
              className="h-8 w-full justify-start px-2 text-sm"
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
              className="h-8 w-full justify-start px-2 text-sm"
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
              className="h-8 w-full justify-start px-2 text-sm"
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
              className="h-8 w-full justify-start px-2 text-sm"
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
              className="h-8 w-full justify-start px-2 text-sm"
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
