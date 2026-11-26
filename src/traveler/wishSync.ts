import type { SupabaseClient } from "@supabase/supabase-js";
import { loadWishes, mergeWishes, saveWishes, wishEvent, type WishItem } from "./wishlist";

/*
 * Quero Conhecer na conta (migração 005, tabela wishlists). Enquanto a
 * migração não for aplicada, a tabela não existe: o app percebe, para de
 * tentar e a lista continua só neste aparelho, como antes. Nada é apagado:
 * ao entrar, a lista da conta é juntada à do aparelho, sem duplicar.
 */

type Status = "off" | "ready" | "missing";
let status: Status = "off";
export const wishSyncStatus = () => status;

/** A tabela ainda não existe (migração não aplicada). */
export const isMissingTable = (e: { code?: string; message?: string } | null | undefined) =>
  Boolean(e && (e.code === "42P01" || e.code === "PGRST205" || /relation .*wishlists.* does not exist|could not find the table/i.test(e.message || "")));

export async function pullWishes(client: SupabaseClient, userId: string): Promise<Status> {
  const { data, error } = await client.from("wishlists").select("data").eq("owner", userId).maybeSingle();
  if (error) {
    status = isMissingTable(error) ? "missing" : "off";
    return status;
  }
  status = "ready";
  const merged = mergeWishes(loadWishes(), (data as { data?: unknown } | null)?.data);
  if (merged.added) saveWishes(merged.list);
  // A conta passa a ter também o que só estava neste aparelho.
  if (merged.list.length && (!data || merged.list.length !== ((data as { data?: unknown[] }).data ?? []).length)) await pushWishes(client, userId, merged.list);
  return status;
}

export async function pushWishes(client: SupabaseClient, userId: string, list: WishItem[] = loadWishes()) {
  if (status !== "ready") return false;
  const { error } = await client.from("wishlists").upsert({ owner: userId, data: list, updated_at: new Date().toISOString() });
  if (error && isMissingTable(error)) status = "missing";
  return !error;
}

/** Liga a sincronização para a conta atual; devolve a função que desliga. */
export function startWishSync(client: SupabaseClient, userId: string) {
  let timer: number | undefined;
  let stopped = false;
  void pullWishes(client, userId).catch(() => undefined);
  const onChange = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      if (!stopped) void pushWishes(client, userId).catch(() => undefined);
    }, 1500);
  };
  window.addEventListener(wishEvent, onChange);
  return () => {
    stopped = true;
    window.clearTimeout(timer);
    window.removeEventListener(wishEvent, onChange);
    status = "off";
  };
}
