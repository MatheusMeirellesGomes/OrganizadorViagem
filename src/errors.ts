// Turns Supabase, network and browser errors into short Portuguese messages.
export class ConflictError extends Error {
  constructor(message = "Esta viagem foi alterada em outro aparelho.") {
    super(message);
    this.name = "ConflictError";
  }
}

type ErrorLike = {
  message?: unknown;
  code?: unknown;
  status?: unknown;
  name?: unknown;
};

function details(error: unknown): {
  message: string;
  code: string;
  status: number;
  name: string;
} {
  const e = (error && typeof error === "object" ? error : {}) as ErrorLike;
  return {
    message: String(
      typeof error === "string" ? error : (e.message ?? ""),
    ).toLowerCase(),
    code: String(e.code ?? ""),
    status: Number(e.status ?? 0),
    name: String(e.name ?? ""),
  };
}

export function isNetworkError(error: unknown): boolean {
  const { message, name, status } = details(error);
  return (
    (typeof navigator !== "undefined" && navigator.onLine === false) ||
    message.includes("failed to fetch") ||
    message.includes("networkerror") ||
    message.includes("network request failed") ||
    message.includes("load failed") ||
    name === "AuthRetryableFetchError" ||
    status === 0 && name === "TypeError"
  );
}

export function friendlyError(error: unknown, fallback = "Algo deu errado. Tente novamente."): string {
  if (error instanceof ConflictError)
    return "Esta viagem foi alterada em outro aparelho. Recarregue as viagens para ver a versão mais recente antes de editar.";
  const { message, code, status } = details(error);
  if (isNetworkError(error))
    return "Sem conexão com o servidor. Verifique sua internet e tente novamente.";
  if (message.includes("invalid login credentials"))
    return "E-mail ou senha incorretos.";
  if (message.includes("email not confirmed"))
    return "Confirme seu e-mail pelo link enviado antes de entrar.";
  if (message.includes("user already registered") || code === "user_already_exists")
    return "Já existe uma conta com este e-mail. Tente entrar.";
  if (code === "weak_password" || message.includes("password should be"))
    return "Escolha uma senha mais forte, com pelo menos 8 caracteres.";
  if (message.includes("unable to validate email") || code === "email_address_invalid")
    return "Digite um e-mail válido.";
  if (status === 429 || message.includes("rate limit") || code === "over_email_send_rate_limit")
    return "Muitas tentativas em pouco tempo. Aguarde alguns minutos.";
  if (
    status === 401 ||
    code === "PGRST301" ||
    message.includes("jwt expired") ||
    message.includes("invalid jwt")
  )
    return "Sua sessão expirou. Entre novamente na sua conta.";
  if (code === "42501" || message.includes("row-level security"))
    return "Você não tem permissão para alterar esta viagem.";
  if (code === "23505") return "Esta viagem já existe na sua conta.";
  if (code === "PGRST205" || code === "42P01")
    return "O banco de dados ainda não foi preparado. Execute a migração SQL do projeto no Supabase.";
  if (message.includes("payload too large") || status === 413)
    return "Os dados são grandes demais para enviar de uma vez. Remova fotos muito pesadas e tente novamente.";
  if (message.includes("quota") && message.includes("exceeded"))
    return "O armazenamento deste navegador está cheio. Exporte um backup e remova fotos locais.";
  return fallback;
}
