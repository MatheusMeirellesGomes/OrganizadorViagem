import { describe, expect, it } from "vitest";
import { isSecretKey, readSupabaseConfig } from "./config";

const jwt = (payload: object) =>
  [
    btoa(JSON.stringify({ alg: "HS256", typ: "JWT" })),
    btoa(JSON.stringify(payload)).replace(/=+$/, ""),
    "signature",
  ].join(".");

describe("Supabase configuration", () => {
  it("falls back to local mode when nothing is configured", () => {
    expect(readSupabaseConfig({})).toEqual({ status: "missing" });
    expect(
      readSupabaseConfig({ VITE_SUPABASE_URL: " ", VITE_SUPABASE_ANON_KEY: "" }),
    ).toEqual({ status: "missing" });
  });
  it("accepts a public anon key", () => {
    const key = jwt({ role: "anon", ref: "abc" });
    expect(
      readSupabaseConfig({
        VITE_SUPABASE_URL: "https://abc.supabase.co/",
        VITE_SUPABASE_ANON_KEY: key,
      }),
    ).toEqual({ status: "ok", url: "https://abc.supabase.co", key });
  });
  it("accepts a publishable key", () => {
    const result = readSupabaseConfig({
      VITE_SUPABASE_URL: "https://abc.supabase.co",
      VITE_SUPABASE_ANON_KEY: "sb_publishable_123",
    });
    expect(result.status).toBe("ok");
  });
  it("refuses secret keys in the browser", () => {
    expect(isSecretKey("sb_secret_123")).toBe(true);
    expect(isSecretKey(jwt({ role: "service_role" }))).toBe(true);
    expect(isSecretKey(jwt({ role: "anon" }))).toBe(false);
    const result = readSupabaseConfig({
      VITE_SUPABASE_URL: "https://abc.supabase.co",
      VITE_SUPABASE_ANON_KEY: jwt({ role: "service_role" }),
    });
    expect(result.status).toBe("invalid");
  });
  it("reports incomplete or unsafe settings", () => {
    expect(
      readSupabaseConfig({ VITE_SUPABASE_URL: "https://abc.supabase.co" }).status,
    ).toBe("invalid");
    expect(
      readSupabaseConfig({
        VITE_SUPABASE_URL: "http://abc.supabase.co",
        VITE_SUPABASE_ANON_KEY: "sb_publishable_1",
      }).status,
    ).toBe("invalid");
    expect(
      readSupabaseConfig({
        VITE_SUPABASE_URL: "não é url",
        VITE_SUPABASE_ANON_KEY: "sb_publishable_1",
      }).status,
    ).toBe("invalid");
    expect(
      readSupabaseConfig({
        VITE_SUPABASE_URL: "http://localhost:54321",
        VITE_SUPABASE_ANON_KEY: "sb_publishable_1",
      }).status,
    ).toBe("ok");
  });
});
