import type { SupabaseClient } from "@supabase/supabase-js";

/*
 * Trip sharing (Etapa 15), prepared for the account mode. Database rules are
 * in supabase/migrations/003_colaboracao_e_assistente.sql: only the owner
 * invites and removes people; editors can change the trip; viewers only read;
 * nobody but the owner can delete it. The invite code is random, single use,
 * expires in 7 days and only its SHA-256 is stored.
 */

export type Role = "owner" | "editor" | "viewer";
export type Member = { userId: string; role: Exclude<Role, "owner">; email?: string };
export type Invite = { id: string; role: Exclude<Role, "owner">; expiresAt: string; acceptedAt?: string };

export const roleLabels: Record<Role, string> = {
  owner: "Dono",
  editor: "Pode editar",
  viewer: "Só visualiza",
};

type Client = Pick<SupabaseClient, "from" | "rpc">;

/** 32 random bytes as URL-safe text. */
export function newToken(random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))) {
  const bytes = random(32);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function sha256Hex(text: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const inviteLink = (token: string, origin = typeof location === "undefined" ? "" : location.origin) => `${origin}/?convite=${encodeURIComponent(token)}`;

/** Reads (and removes) an invite code from the address bar. */
export function takeInviteFromUrl(url?: URL): string | undefined {
  if (!url) {
    if (typeof location === "undefined") return;
    url = new URL(location.href);
  }
  const token = url.searchParams.get("convite") ?? undefined;
  if (!token || !/^[\w-]{20,100}$/.test(token)) return;
  url.searchParams.delete("convite");
  try {
    history.replaceState(null, "", url.pathname + (url.search || "") + url.hash);
  } catch {
    /* not in a browser */
  }
  return token;
}

export async function createInvite(client: Client, tripId: string, role: Exclude<Role, "owner">, userId: string) {
  const token = newToken();
  const { error } = await client.from("trip_invites").insert({ trip_id: tripId, token_hash: await sha256Hex(token), role, created_by: userId });
  if (error) throw error;
  return { token, link: inviteLink(token) };
}

export async function listInvites(client: Client, tripId: string): Promise<Invite[]> {
  const { data, error } = await client.from("trip_invites").select("id,role,expires_at,accepted_at").eq("trip_id", tripId).order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r: { id: string; role: Invite["role"]; expires_at: string; accepted_at?: string | null }) => ({ id: r.id, role: r.role, expiresAt: r.expires_at, acceptedAt: r.accepted_at ?? undefined }));
}

export async function revokeInvite(client: Client, id: string) {
  const { error } = await client.from("trip_invites").delete().eq("id", id);
  if (error) throw error;
}

export async function listMembers(client: Client, tripId: string): Promise<Member[]> {
  const { data, error } = await client.from("trip_members").select("user_id,role,email").eq("trip_id", tripId);
  if (error) throw error;
  return (data ?? []).map((r: { user_id: string; role: Member["role"]; email?: string | null }) => ({ userId: r.user_id, role: r.role, email: r.email ?? undefined }));
}

export async function setMemberRole(client: Client, tripId: string, userId: string, role: Member["role"]) {
  const { error } = await client.from("trip_members").update({ role }).eq("trip_id", tripId).eq("user_id", userId);
  if (error) throw error;
}

/** Owner removes someone, or a person leaves (userId = self). */
export async function removeMember(client: Client, tripId: string, userId: string) {
  const { error } = await client.from("trip_members").delete().eq("trip_id", tripId).eq("user_id", userId);
  if (error) throw error;
}

export async function acceptInvite(client: Client, token: string): Promise<string> {
  const { data, error } = await client.rpc("accept_trip_invite", { token });
  if (error) throw new Error(/invalid|expired/i.test(error.message) ? "Convite inválido, já usado ou vencido." : "Não foi possível aceitar o convite agora.");
  return String(data);
}

/** Role of the signed-in person in a trip, from the trip row owner and the members list. */
export function roleIn(ownerId: string | undefined, userId: string, members: Member[]): Role | undefined {
  if (!ownerId || ownerId === userId) return "owner";
  return members.find((m) => m.userId === userId)?.role;
}
