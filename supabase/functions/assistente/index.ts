// Supabase Edge Function "assistente" (Etapa 15).
// Publicar: supabase functions deploy assistente
// Segredos (nunca no frontend):
//   supabase secrets set ANTHROPIC_API_KEY=... ASSISTENTE_MODELO=claude-haiku-5-5 ASSISTENTE_LIMITE_DIARIO=20
// SUPABASE_URL, SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY já existem nas funções do Supabase.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { buildPrompt, parseAnswer } from "../_shared/assistant.ts";

const env = (k: string) => Deno.env.get(k) ?? "";
const allowedOrigins = env("ASSISTENTE_ORIGENS").split(",").map((s) => s.trim()).filter(Boolean);

function cors(req: Request) {
  const origin = req.headers.get("Origin") ?? "";
  return {
    "Access-Control-Allow-Origin": !allowedOrigins.length || allowedOrigins.includes(origin) ? origin || "*" : allowedOrigins[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}
const json = (req: Request, status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors(req), "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return json(req, 405, { error: "method" });
  if (!env("ANTHROPIC_API_KEY")) return json(req, 503, { error: "not_configured" });
  const auth = req.headers.get("Authorization") ?? "";
  // Client with the person's token: reads only what RLS allows.
  const user = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), { global: { headers: { Authorization: auth } } });
  const { data: who } = await user.auth.getUser();
  if (!who?.user) return json(req, 401, { error: "auth" });
  let body: { tripId?: string; question?: string; lang?: string };
  try {
    body = await req.json();
  } catch {
    return json(req, 400, { error: "body" });
  }
  const question = String(body.question ?? "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(String(body.tripId)) || question.length < 3 || question.length > 600) return json(req, 400, { error: "input" });
  const { data: row, error } = await user.from("trips").select("data").eq("id", body.tripId).maybeSingle();
  if (error || !row) return json(req, 404, { error: "trip" });

  // Daily limit per person, counted with the service role (never sent to the browser).
  const admin = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));
  const limit = Number(env("ASSISTENTE_LIMITE_DIARIO") || 20);
  const today = new Date().toISOString().slice(0, 10);
  const { data: usage } = await admin.from("assistant_usage").select("count").eq("user_id", who.user.id).eq("day", today).maybeSingle();
  if ((usage?.count ?? 0) >= limit) return json(req, 429, { error: "limit" });
  await admin.from("assistant_usage").upsert({ user_id: who.user.id, day: today, count: (usage?.count ?? 0) + 1 });

  const trip = row.data;
  const { system, user: content } = buildPrompt(trip, question, String(body.lang ?? "pt"));
  const ai = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": env("ANTHROPIC_API_KEY"), "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: env("ASSISTENTE_MODELO") || "claude-haiku-5-5", max_tokens: 1200, system, messages: [{ role: "user", content }] }),
    signal: AbortSignal.timeout(45000),
  });
  if (!ai.ok) return json(req, 502, { error: "ai" });
  const out = await ai.json();
  const text = (out?.content ?? []).map((c: { type: string; text?: string }) => (c.type === "text" ? c.text : "")).join("");
  const allowed = (trip.placeChoices ?? []).map((c: { place: { id: string } }) => c.place.id);
  return json(req, 200, parseAnswer(text, allowed));
});
