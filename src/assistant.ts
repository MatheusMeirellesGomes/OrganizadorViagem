import type { SupabaseClient } from "@supabase/supabase-js";
import { parseAnswer, type AssistantAnswer } from "../supabase/functions/_shared/assistant";

/*
 * Optional AI assistant (Etapa 15). The AI key stays in the server function
 * "assistente"; the browser only sends the trip id and the question, with the
 * person's login. Turned on with VITE_ASSISTENTE=on after the function is
 * deployed. Suggestions are never applied without a click.
 */

const env = (import.meta as unknown as { env?: Record<string, string | boolean> }).env || {};
export const assistantEnabled = env.VITE_ASSISTENTE === "on";

export class AssistantError extends Error {}

export async function askAssistant(
  client: Pick<SupabaseClient, "functions">,
  tripId: string,
  question: string,
  lang: string,
  allowedPlaceIds: string[],
): Promise<AssistantAnswer> {
  const q = question.trim();
  if (q.length < 3) throw new AssistantError("Escreva uma pergunta um pouco maior.");
  if (q.length > 600) throw new AssistantError("A pergunta pode ter no máximo 600 caracteres.");
  const { data, error } = await client.functions.invoke("assistente", { body: { tripId, question: q, lang } });
  if (error) {
    const status = (error as { context?: { status?: number } }).context?.status;
    if (status === 429) throw new AssistantError("Limite diário do assistente atingido. Tente amanhã.");
    if (status === 503) throw new AssistantError("O assistente ainda não foi configurado no servidor.");
    if (status === 401) throw new AssistantError("Entre na sua conta para usar o assistente.");
    throw new AssistantError("O assistente não respondeu agora. Tente novamente.");
  }
  // Validated again here: never trust the shape of a remote answer.
  const answer = data as Partial<AssistantAnswer>;
  return parseAnswer(JSON.stringify({ answer: answer?.answer ?? "", suggestions: answer?.suggestions ?? [] }), allowedPlaceIds);
}
