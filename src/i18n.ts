import { useSyncExternalStore } from "react";
import core from "./locales/core.json";
export type Language = "pt-BR" | "en" | "es";
const dictionary: Record<string, string[]> = core;
const listeners = new Set<() => void>();
let language: Language = "pt-BR";
try {
  const saved = localStorage.getItem("gomes-language");
  if (saved === "en" || saved === "es") language = saved;
} catch {
  /* storage is optional */
}
if (typeof document !== "undefined") document.documentElement.lang = language;
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
}
export function useLanguage() {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    getLocale,
    () => "pt-BR" as Language,
  );
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
