import type { SupabaseClient } from "@supabase/supabase-js";

/*
 * Booking references (flight PNR, rental number...) — Etapa 16.
 *
 * They never go into the trip data, so they are not in backups, offline
 * copies, shared trips, links or what the assistant receives.
 *  - Local mode: encrypted with AES-GCM in this browser. The key is created by
 *    the browser as non-extractable and kept in IndexedDB; the encrypted value
 *    stays in localStorage. It protects copies of the storage, not someone
 *    using this same browser profile.
 *  - Account: table booking_secrets (migration 004) that only the person who
 *    saved the code can read, plus people they explicitly authorize.
 * Nothing here logs values.
 */

export interface SecretStore {
  get(tripId: string, refId: string): Promise<string | undefined>;
  set(tripId: string, refId: string, code: string): Promise<void>;
  remove(tripId: string, refId: string): Promise<void>;
}

/** Letters, digits, spaces, dash and slash; up to 40 characters. */
export function cleanCode(code: string): string {
  const v = code.trim().replace(/\s+/g, " ");
  if (!v) throw new Error("Digite o código.");
  if (v.length > 40 || !/^[\p{L}\p{N} /-]+$/u.test(v)) throw new Error("Use só letras, números, espaços, hífen ou barra (até 40 caracteres).");
  return v;
}

export const maskCode = (code?: string) => (code ? "•".repeat(Math.min(8, Math.max(6, code.length))) : "");

const b64 = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b instanceof Uint8Array ? b : new Uint8Array(b))));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export type KeyProvider = () => Promise<CryptoKey>;

/** Non-extractable AES key kept in IndexedDB (created on first use). */
export const indexedDbKey: KeyProvider = () =>
  new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("Este navegador não permite guardar o código com segurança."));
    const open = indexedDB.open("gomes-cofre", 1);
    open.onupgradeneeded = () => open.result.createObjectStore("chaves");
    open.onerror = () => reject(new Error("Este navegador não permite guardar o código com segurança."));
    open.onsuccess = () => {
      const db = open.result;
      const read = db.transaction("chaves", "readonly").objectStore("chaves").get("v1");
      read.onerror = () => reject(new Error("Não foi possível abrir o cofre deste navegador."));
      read.onsuccess = async () => {
        if (read.result) return resolve(read.result as CryptoKey);
        try {
          const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
          const tx = db.transaction("chaves", "readwrite");
          tx.objectStore("chaves").put(key, "v1");
          tx.oncomplete = () => resolve(key);
          tx.onerror = () => reject(new Error("Não foi possível abrir o cofre deste navegador."));
        } catch {
          reject(new Error("Não foi possível abrir o cofre deste navegador."));
        }
      };
    };
  });

export const localSecretsKey = "gomes-localizadores-v1";

export function localSecretStore(storage: Pick<Storage, "getItem" | "setItem"> = localStorage, key: KeyProvider = indexedDbKey): SecretStore {
  const all = (): Record<string, { iv: string; data: string }> => {
    try {
      return JSON.parse(storage.getItem(localSecretsKey) || "{}");
    } catch {
      return {};
    }
  };
  const write = (v: ReturnType<typeof all>) => {
    try {
      storage.setItem(localSecretsKey, JSON.stringify(v));
    } catch {
      throw new Error("O navegador não permitiu salvar. Libere espaço e tente de novo.");
    }
  };
  const id = (t: string, r: string) => `${t}:${r}`;
  return {
    async get(tripId, refId) {
      const item = all()[id(tripId, refId)];
      if (!item) return;
      try {
        const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(item.iv) }, await key(), unb64(item.data));
        return new TextDecoder().decode(plain);
      } catch {
        throw new Error("Não foi possível abrir o código guardado neste navegador.");
      }
    },
    async set(tripId, refId, code) {
      const value = cleanCode(code);
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key(), new TextEncoder().encode(value));
      write({ ...all(), [id(tripId, refId)]: { iv: b64(iv), data: b64(data) } });
    },
    async remove(tripId, refId) {
      const v = all();
      delete v[id(tripId, refId)];
      write(v);
    },
  };
}

export function remoteSecretStore(client: SupabaseClient): SecretStore {
  return {
    async get(tripId, refId) {
      // Own code first; a code someone authorized you to see comes after.
      const { data: me } = await client.auth.getUser();
      const { data, error } = await client.from("booking_secrets").select("code,owner").eq("trip_id", tripId).eq("ref_id", refId).limit(5);
      if (error) throw new Error("Não foi possível buscar o código na conta.");
      const rows = (data ?? []) as { code: string; owner: string }[];
      return (rows.find((r) => r.owner === me.user?.id) ?? rows[0])?.code;
    },
    async set(tripId, refId, code) {
      const { error } = await client.from("booking_secrets").upsert({ trip_id: tripId, ref_id: refId, code: cleanCode(code) }, { onConflict: "trip_id,ref_id,owner" });
      if (error) throw new Error("Não foi possível guardar o código na conta.");
    },
    async remove(tripId, refId) {
      const { data: me } = await client.auth.getUser();
      const { error } = await client.from("booking_secrets").delete().eq("trip_id", tripId).eq("ref_id", refId).eq("owner", me.user?.id ?? "");
      if (error) throw new Error("Não foi possível apagar o código.");
    },
  };
}

let local: SecretStore | undefined;
export const secretStore = (client?: SupabaseClient | null, signedIn?: boolean): SecretStore =>
  client && signedIn ? remoteSecretStore(client) : (local ??= localSecretStore());
