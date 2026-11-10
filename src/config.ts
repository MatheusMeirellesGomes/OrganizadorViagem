// Reads the public Supabase settings from Vite environment variables.
// Only the public (anon / publishable) key may ever reach the browser.
export type SupabaseConfig =
  | { status: "ok"; url: string; key: string }
  | { status: "missing" }
  | { status: "invalid"; reason: string };

type Env = Record<string, string | undefined>;

function jwtRole(key: string): string | undefined {
  const parts = key.split(".");
  if (parts.length !== 3) return;
  try {
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const payload = JSON.parse(atob(padded));
    return typeof payload?.role === "string" ? payload.role : undefined;
  } catch {
    return;
  }
}

export function isSecretKey(key: string): boolean {
  return key.startsWith("sb_secret_") || jwtRole(key) === "service_role";
}

export function readSupabaseConfig(env: Env): SupabaseConfig {
  const url = env.VITE_SUPABASE_URL?.trim() ?? "";
  const key = env.VITE_SUPABASE_ANON_KEY?.trim() ?? "";
  if (!url && !key) return { status: "missing" };
  if (!url || !key)
    return {
      status: "invalid",
      reason:
        "Preencha VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY juntas no arquivo .env.local.",
    };
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { status: "invalid", reason: "VITE_SUPABASE_URL não é uma URL válida." };
  }
  const local = ["localhost", "127.0.0.1"].includes(parsed.hostname);
  if (parsed.protocol !== "https:" && !local)
    return {
      status: "invalid",
      reason: "VITE_SUPABASE_URL precisa usar https://.",
    };
  if (isSecretKey(key))
    return {
      status: "invalid",
      reason:
        "A chave informada é secreta (service_role). Use apenas a chave pública anon/publishable no navegador.",
    };
  return { status: "ok", url: parsed.origin, key };
}
