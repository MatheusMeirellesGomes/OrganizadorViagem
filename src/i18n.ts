import { useSyncExternalStore } from "react";
export type Language = "pt-BR" | "en" | "es";
/*
 * As traduções (inglês e espanhol) ficam num arquivo separado, baixado só
 * quando o idioma não é português. Quem usa em português abre o app sem esse
 * peso; o service worker guarda o arquivo para funcionar sem internet.
 */
let dictionary: Record<string, string[]> = {};
let loading: Promise<void> | undefined;
export function loadDictionary(): Promise<void> {
  loading ??= import("./locales/core.json").then(
    (m) => {
      dictionary = (m.default ?? m) as Record<string, string[]>;
    },
    (e) => {
      loading = undefined;
      throw e;
    },
  );
  return loading;
}
const listeners = new Set<() => void>();
let language: Language = "pt-BR";
try {
  const saved = localStorage.getItem("gomes-language");
  if (saved === "en" || saved === "es") language = saved;
} catch {
  /* storage is optional */
}
if (typeof document !== "undefined") document.documentElement.lang = language;
/** Resolve quando as traduções do idioma salvo estão prontas (na hora, em português). */
export const i18nReady: Promise<void> = language === "pt-BR" ? Promise.resolve() : loadDictionary().catch(() => {});
export function getLocale(): Language {
  return language;
}
export function setLanguage(next: Language) {
  language = next;
  try {
    localStorage.setItem("gomes-language", next);
  } catch {
    /* still changes this session */
  }
  if (typeof document !== "undefined") document.documentElement.lang = next;
  listeners.forEach((fn) => fn());
  // Primeira troca para inglês ou espanhol: baixa as traduções e redesenha.
  if (next !== "pt-BR" && !Object.keys(dictionary).length)
    loadDictionary()
      .then(() => listeners.forEach((fn) => fn()))
      .catch(() => {});
}
// Muda a cada troca de idioma e quando as traduções chegam, para redesenhar.
let version = 0;
listeners.add(() => version++);
export function useLanguage(): Language {
  useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => version,
    () => 0,
  );
  return language;
}
export function translate(
  key: string,
  locale: Language = language,
  values: Record<string, string | number> = {},
) {
  const text =
    locale === "pt-BR"
      ? key
      : dictionary[key]?.[locale === "en" ? 0 : 1] || key;
  return text.replace(/\{(\w+)\}/g, (match, key) =>
    String(values[key] ?? match),
  );
}
export const t = translate;
export const formatNumber = (value: number, digits = 0) =>
  new Intl.NumberFormat(language, {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value);
/** Translates and fills {placeholders} in the current language. */
export const tf = (key: string, values: Record<string, string | number>) =>
  translate(key, language, values);
/** Money in the current language, e.g. "R$ 12,00", "€12.00", "12,00 €". */
export function formatMoney(value: number, currency: string) {
  try {
    return new Intl.NumberFormat(language, { style: "currency", currency }).format(value);
  } catch {
    return `${currency} ${formatNumber(value, 2)}`;
  }
}
