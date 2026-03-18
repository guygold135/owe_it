import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Popover,
  PopoverBody,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
  PopoverFooter,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Copy, Settings, User } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/useAuth";
import { PopoverClose } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";

export default function UserProfilePopover() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [friendCode, setFriendCode] = useState<string | null>(null);
  const [friendCodeDbReady, setFriendCodeDbReady] = useState<boolean>(true);

  const displayName =
    user?.displayName || (user?.email ? user.email.split("@")[0] : "Guest");
  const email = user?.email || "guest@example.com";
  const initial = (displayName || email).trim().charAt(0).toUpperCase();

  const avatarSrc =
    "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=80&h=80&q=80";

  useEffect(() => {
    if (!user?.id) return;

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
        .select("friend_code")
        .eq("id", user.id)
        .maybeSingle();

      if (error) {
        const msg = String((error as any)?.message ?? "").toLowerCase();
        if (msg.includes("friend_code") && (msg.includes("column") || msg.includes("schema") || msg.includes("does not exist"))) {
          setFriendCodeDbReady(false);
        }
        return;
      }
      const existing = (data as any)?.friend_code ?? null;
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

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" className="h-10 w-10 rounded-full p-0">
          <Avatar className="h-8 w-8">
            <AvatarImage src={avatarSrc} alt={displayName} />
            <AvatarFallback>{initial}</AvatarFallback>
          </Avatar>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-62">
        <PopoverHeader>
          <div className="flex items-center space-x-3">
            <Avatar className="h-10 w-10">
              <AvatarImage src={avatarSrc} alt={displayName} />
              <AvatarFallback>{initial}</AvatarFallback>
            </Avatar>
            <div>
              <PopoverTitle>{displayName}</PopoverTitle>
              <PopoverDescription className="text-xs">
                {email}
              </PopoverDescription>
              <PopoverDescription className="text-xs flex items-center gap-2">
                <span className="tabular-nums">
                  your friend id {friendCodeDbReady ? (friendCode ?? "…") : "unavailable"}
                </span>
                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  aria-label="Copy Friend ID"
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
          <Button variant="ghost" className="w-full justify-start" size="sm">
            <User className="mr-2 h-4 w-4" />
            View Profile
          </Button>
          <PopoverClose asChild>
            <Button
              variant="ghost"
              className="w-full justify-start"
              size="sm"
              onClick={() => navigate("/history")}
            >
              <User className="mr-2 h-4 w-4" />
              History
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
        <PopoverFooter>
          <Button
            variant="outline"
            className="w-full bg-transparent"
            size="sm"
            onClick={() => {
              void signOut();
            }}
          >
            Sign Out
          </Button>
        </PopoverFooter>
      </PopoverContent>
    </Popover>
  );
}

