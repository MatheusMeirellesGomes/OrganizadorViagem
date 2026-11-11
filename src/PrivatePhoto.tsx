import { useEffect, useState } from "react";
import { supabase } from "./store";
import type { TripPhoto } from "./photos";
export function PrivatePhoto({
  photo,
  className = "",
}: {
  photo: TripPhoto;
  className?: string;
}) {
  const [url, setUrl] = useState(
      photo.url.startsWith("data:image/") ? photo.url : "",
    ),
    [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true,
      objectUrl = "";
    setFailed(false);
    if (photo.url.startsWith("data:image/")) {
      setUrl(photo.url);
      return;
    }
    setUrl("");
    if (!supabase) {
      setFailed(true);
      return;
    }
    supabase.storage
      .from("trip-photos")
      .download(photo.url)
      .then(({ data, error }) => {
        if (!active) return;
        if (error || !data) {
          setFailed(true);
          return;
        }
        objectUrl = URL.createObjectURL(data);
        setUrl(objectUrl);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [photo.url]);
  return url && !failed ? (
    <img
      className={className}
      src={url}
      alt={photo.caption || photo.name}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  ) : (
    <span className={className + " photo-unavailable"}>
      {failed
        ? "Foto indisponível. Verifique a conexão e sua conta."
        : "Carregando foto…"}
    </span>
  );
}
