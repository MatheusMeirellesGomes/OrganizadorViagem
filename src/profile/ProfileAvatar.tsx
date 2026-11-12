import { useEffect, useState } from "react";
import { User } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { t as tr, tf } from "../i18n";
import { initials, type Profile } from "./profile";
import { avatarUrl } from "./account";

const signed = new Map<string, Promise<string | undefined>>();

/** Profile photo, or initials, or a neutral icon. Account photos use short-lived signed links. */
export function ProfileAvatar({ profile, client, size = 40, className = "" }: { profile: Profile; client?: SupabaseClient | null; size?: number; className?: string }) {
  const [url, setUrl] = useState<string>();
  const [failed, setFailed] = useState(false);
  const avatar = profile.avatar;
  useEffect(() => {
    setFailed(false);
    if (avatar?.kind === "local") return setUrl(avatar.data);
    setUrl(undefined);
    if (avatar?.kind !== "cloud" || !client) return;
    let live = true;
    if (!signed.has(avatar.path)) signed.set(avatar.path, avatarUrl(client, avatar.path).catch(() => undefined));
    signed.get(avatar.path)!.then((u) => live && setUrl(u));
    return () => {
      live = false;
    };
  }, [avatar?.kind === "local" ? avatar.data : avatar?.path, client]);
  const letters = initials(profile);
  return (
    <span className={"profile-avatar-img " + className} style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}>
      {url && !failed ? (
        <img src={url} alt={profile.name ? tf("Foto de {name}", { name: profile.name }) : tr("Sua foto")} onError={() => setFailed(true)} />
      ) : letters ? (
        <span aria-hidden="true">{letters}</span>
      ) : (
        <User size={Math.round(size * 0.45)} aria-hidden="true" />
      )}
    </span>
  );
}
