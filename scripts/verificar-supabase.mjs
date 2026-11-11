// Verifica a conexão real com o Supabase e o isolamento dos dados por usuário (RLS).
//
// Uso (na pasta do projeto, com .env.local preenchido):
//   node --env-file=.env.local scripts/verificar-supabase.mjs
//
// Precisa de duas contas de teste já confirmadas, informadas no .env.local:
//   TESTE_EMAIL_A, TESTE_SENHA_A, TESTE_EMAIL_B, TESTE_SENHA_B
// Usa somente a chave pública (anon/publishable), exatamente como o navegador.
// Tudo o que o script cria é apagado no final.
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const env = process.env;
const url = env.VITE_SUPABASE_URL?.trim();
const key = env.VITE_SUPABASE_ANON_KEY?.trim();
const accounts = {
  A: { email: env.TESTE_EMAIL_A, password: env.TESTE_SENHA_A },
  B: { email: env.TESTE_EMAIL_B, password: env.TESTE_SENHA_B },
};

function stop(message) {
  console.error("\n✗ " + message);
  process.exit(1);
}
if (!url || !key)
  stop("Preencha VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no .env.local.");
function jwtRole(k) {
  try {
    return JSON.parse(Buffer.from(k.split(".")[1], "base64url").toString()).role;
  } catch {
    return undefined;
  }
}
if (key.startsWith("sb_secret_") || jwtRole(key) === "service_role")
  stop("Use a chave pública (anon/publishable), nunca a service_role/secret.");
for (const [name, a] of Object.entries(accounts))
  if (!a.email || !a.password)
    stop(`Preencha TESTE_EMAIL_${name} e TESTE_SENHA_${name} no .env.local.`);

const results = [];
function check(name, ok, detail = "") {
  results.push(ok);
  console.log(`${ok ? "✓" : "✗"} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
}
const client = () =>
  createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

async function signIn(name) {
  const c = client();
  const { data, error } = await c.auth.signInWithPassword(accounts[name]);
  if (error) stop(`Não foi possível entrar com a conta ${name}: ${error.message}`);
  return { c, id: data.user.id };
}

const trip = (id, title) => ({
  id,
  title,
  destination: "",
  start: "",
  end: "",
  status: "planning",
  scope: "undecided",
  cover: "coast",
  notes: "",
  hotel: "",
  activities: [],
  checklist: [],
  expenses: [],
  budgetEnabled: false,
  photos: [],
  reservations: [],
});

console.log(`Projeto: ${new URL(url).host}\n`);

// 1. Visitante sem login
const anon = client();
{
  const { data, error } = await anon.from("trips").select("id").limit(1);
  if (error?.code === "PGRST205" || error?.code === "42P01")
    stop("A tabela trips não existe. Execute supabase/migrations/202611090001_initial.sql no SQL Editor.");
  check("Visitante sem login não lê viagens", !!error || (data ?? []).length === 0, error?.message);
  const id = randomUUID();
  const ins = await anon
    .from("trips")
    .insert({ id, user_id: randomUUID(), data: trip(id, "anon") });
  check("Visitante sem login não cria viagens", !!ins.error);
}

const A = await signIn("A");
const B = await signIn("B");
check("Duas contas diferentes", A.id !== B.id);

const tripA = trip(randomUUID(), "Teste RLS da conta A");
let versionA;
try {
  // 2. Dono cria e lê
  {
    const { data, error } = await A.c
      .from("trips")
      .insert({ id: tripA.id, user_id: A.id, data: tripA })
      .select("id,updated_at")
      .single();
    check("Conta A cria a própria viagem", !error && data?.id === tripA.id, error?.message);
    versionA = data?.updated_at;
    const list = await A.c.from("trips").select("id").eq("id", tripA.id);
    check("Conta A lê a própria viagem", list.data?.length === 1, list.error?.message);
  }
  // 3. Não dá para criar em nome de outro usuário
  {
    const id = randomUUID();
    const { error } = await A.c
      .from("trips")
      .insert({ id, user_id: B.id, data: trip(id, "falso") });
    check("Conta A não cria viagem em nome da B", !!error);
  }
  // 4. Isolamento: B não lê, não altera e não apaga a viagem de A
  {
    const read = await B.c.from("trips").select("id").eq("id", tripA.id);
    check("Conta B não vê a viagem da A", (read.data ?? []).length === 0);
    const upd = await B.c
      .from("trips")
      .update({ data: { ...tripA, title: "invadido" } })
      .eq("id", tripA.id)
      .select("id");
    check("Conta B não altera a viagem da A", (upd.data ?? []).length === 0);
    await B.c.from("trips").delete().eq("id", tripA.id);
    const still = await A.c.from("trips").select("data").eq("id", tripA.id).single();
    check(
      "Conta B não apaga a viagem da A",
      still.data?.data?.title === tripA.title,
      still.error?.message,
    );
    const steal = await A.c
      .from("trips")
      .update({ user_id: B.id })
      .eq("id", tripA.id)
      .select("id");
    check("Conta A não transfere a viagem para a B", !!steal.error || (steal.data ?? []).length === 0);
  }
  // 5. Proteção entre aparelhos: versão antiga não sobrescreve
  {
    const first = await A.c
      .from("trips")
      .update({ data: { ...tripA, notes: "aparelho 1" } })
      .eq("id", tripA.id)
      .eq("updated_at", versionA)
      .select("updated_at");
    check("Atualização com a versão atual funciona", first.data?.length === 1, first.error?.message);
    const stale = await A.c
      .from("trips")
      .update({ data: { ...tripA, notes: "aparelho 2 desatualizado" } })
      .eq("id", tripA.id)
      .eq("updated_at", versionA)
      .select("updated_at");
    check("Atualização com versão antiga é recusada", (stale.data ?? []).length === 0);
  }
  // 6. Integridade: id do documento precisa bater com o da linha
  {
    const id = randomUUID();
    const { error } = await A.c
      .from("trips")
      .insert({ id, user_id: A.id, data: trip(randomUUID(), "id diferente") });
    check("Documento com id diferente é recusado", !!error);
  }
  // 7. Fotos e documentos privados por usuário (buckets das migrações 001 e 002)
  for (const [bucket, label, migration] of [
    ["trip-photos", "foto", "202611090001_initial.sql"],
    ["trip-documents", "documento", "002_private_documents.sql"],
  ]) {
    const file = new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" });
    const own = `${A.id}/${tripA.id}/teste.png`;
    const up = await A.c.storage.from(bucket).upload(own, file, { contentType: "image/png" });
    if (up.error && /bucket not found/i.test(up.error.message)) {
      check(`Bucket ${bucket} existe`, false, `execute supabase/migrations/${migration}`);
      continue;
    }
    check(`Conta A envia ${label} para a própria pasta`, !up.error, up.error?.message);
    const other = await A.c.storage
      .from(bucket)
      .upload(`${B.id}/${tripA.id}/teste.png`, file, { contentType: "image/png" });
    check(`Conta A não envia ${label} para a pasta da B`, !!other.error);
    const peek = await B.c.storage.from(bucket).createSignedUrl(own, 60);
    check(`Conta B não abre ${label} da A`, !!peek.error || !peek.data?.signedUrl);
    const steal = await B.c.storage.from(bucket).download(own);
    check(`Conta B não baixa ${label} da A`, !!steal.error || !steal.data);
    const pub = await anon.storage.from(bucket).createSignedUrl(own, 60);
    check(`Visitante sem login não abre ${label}`, !!pub.error || !pub.data?.signedUrl);
    await B.c.storage.from(bucket).remove([own]);
    const still = await A.c.storage.from(bucket).download(own);
    check(`Conta B não apaga ${label} da A`, !still.error && !!still.data, still.error?.message);
    await A.c.storage.from(bucket).remove([own]);
  }
} finally {
  await A.c.from("trips").delete().eq("id", tripA.id);
  await A.c.auth.signOut();
  await B.c.auth.signOut();
}

const failed = results.filter((ok) => !ok).length;
console.log(
  failed
    ? `\n✗ ${failed} de ${results.length} verificações falharam. Não publique antes de corrigir.`
    : `\n✓ Todas as ${results.length} verificações passaram. Dados de teste removidos.`,
);
process.exit(failed ? 1 : 0);
