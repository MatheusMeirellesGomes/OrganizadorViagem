import { describe, it, expect } from "vitest";
import { acceptInvite, createInvite, inviteLink, newToken, roleIn, sha256Hex, takeInviteFromUrl } from "./sharing";

/** Minimal fake of the Supabase query builder that records calls. */
function fakeClient(answers: Record<string, unknown> = {}) {
  const calls: { table?: string; op: string; args: unknown[] }[] = [];
  const builder = (table: string) => {
    const chain: Record<string, unknown> = {};
    for (const op of ["insert", "select", "eq", "order", "delete", "update"])
      chain[op] = (...args: unknown[]) => {
        calls.push({ table, op, args });
        return chain;
      };
    chain.then = (ok: (v: unknown) => void) => ok({ data: answers[table] ?? [], error: null });
    return chain;
  };
  const client = {
    from: (t: string) => builder(t),
    rpc: async (name: string, args: unknown) => {
      calls.push({ op: "rpc:" + name, args: [args] });
      return answers.rpcError ? { data: null, error: { message: String(answers.rpcError) } } : { data: "trip-1", error: null };
    },
  };
  return { client: client as never, calls };
}

describe("convites", () => {
  it("código aleatório de 256 bits; no banco vai só o resumo SHA-256", async () => {
    const token = newToken();
    expect(token).toMatch(/^[\w-]{43}$/);
    expect(newToken()).not.toBe(token);
    const { client, calls } = fakeClient();
    const r = await createInvite(client, "trip-1", "editor", "user-1");
    const insert = calls.find((c) => c.op === "insert")!.args[0] as Record<string, string>;
    expect(insert).toEqual({ trip_id: "trip-1", token_hash: await sha256Hex(r.token), role: "editor", created_by: "user-1" });
    expect(JSON.stringify(insert)).not.toContain(r.token);
    expect(r.link).toContain("?convite=");
  });
  it("lê o convite do endereço e recusa formatos estranhos", () => {
    expect(takeInviteFromUrl(new URL("https://app.test/?convite=abcdefghijklmnopqrstuvwxyz012345"))).toBe("abcdefghijklmnopqrstuvwxyz012345");
    expect(takeInviteFromUrl(new URL("https://app.test/?convite=<script>"))).toBeUndefined();
    expect(inviteLink("abc", "https://app.test")).toBe("https://app.test/?convite=abc");
  });
  it("aceitar usa a função do banco e traduz convites vencidos", async () => {
    expect(await acceptInvite(fakeClient().client, "t")).toBe("trip-1");
    await expect(acceptInvite(fakeClient({ rpcError: "invalid or expired invite" }).client, "t")).rejects.toThrow("vencido");
  });
  it("papel na viagem", () => {
    expect(roleIn("u1", "u1", [])).toBe("owner");
    expect(roleIn("u1", "u2", [{ userId: "u2", role: "viewer" }])).toBe("viewer");
    expect(roleIn("u1", "u3", [])).toBeUndefined();
  });
});
