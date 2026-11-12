import type { SupabaseClient } from "@supabase/supabase-js";
import { accountProfile, parseProfile, type Profile } from "./profile";

/*
 * Profile with an account: preferences in the user metadata (no photo bytes),
 * photo in the private "trip-photos" bucket under "<user id>/perfil/", which
 * the existing Storage policies already restrict to the owner.
 */

export const avatarBucket = "trip-photos";

export function avatarPath(userId: string, type: string) {
  return `${userId}/perfil/avatar-${crypto.randomUUID()}.${type === "image/webp" ? "webp" : "jpg"}`;
}

export async function uploadAvatar(client: SupabaseClient, userId: string, blob: Blob): Promise<string> {
  const path = avatarPath(userId, blob.type);
  const { error } = await client.storage.from(avatarBucket).upload(path, blob, { contentType: blob.type, upsert: false });
  if (error) throw new Error("Não foi possível enviar a foto. Confira a conexão.");
  return path;
}

export async function removeAvatar(client: SupabaseClient, path: string) {
  await client.storage.from(avatarBucket).remove([path]);
}

export async function avatarUrl(client: SupabaseClient, path: string): Promise<string | undefined> {
  const { data } = await client.storage.from(avatarBucket).createSignedUrl(path, 3600);
  return data?.signedUrl;
}

export async function saveAccountProfile(client: SupabaseClient, profile: Profile): Promise<void> {
  const { error } = await client.auth.updateUser({ data: { perfil: accountProfile(profile) } });
  if (error) throw new Error("Não foi possível salvar o perfil na conta.");
}

/** Profile stored in the account, if any. */
export function readAccountProfile(metadata: Record<string, unknown> | undefined): Profile | undefined {
  const raw = metadata?.perfil;
  return raw && typeof raw === "object" ? parseProfile(raw) : undefined;
}
