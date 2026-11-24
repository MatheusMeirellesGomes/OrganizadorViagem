/*
 * Tema claro, escuro ou automático (segue o sistema, inclusive quando ele
 * muda com o app aberto). A escolha fica só neste aparelho.
 * index.html aplica a mesma regra antes do primeiro desenho, sem piscar.
 */
export type ThemePref = "light" | "dark" | "auto";
export const themeKey = "gomes-tema";
const themeColors = { light: "#214e42", dark: "#121814" };

export function loadThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(themeKey);
    return v === "light" || v === "dark" ? v : "auto";
  } catch {
    return "auto";
  }
}

const media = () => (typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)") : null);

export function resolveTheme(pref: ThemePref, systemDark = media()?.matches ?? false): "light" | "dark" {
  return pref === "auto" ? (systemDark ? "dark" : "light") : pref;
}

export function applyTheme(pref: ThemePref = loadThemePref()) {
  if (typeof document === "undefined") return;
  const theme = resolveTheme(pref);
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.dataset.themePref = pref;
  root.style.colorScheme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", themeColors[theme]);
}

export function saveThemePref(pref: ThemePref) {
  try {
    if (pref === "auto") localStorage.removeItem(themeKey);
    else localStorage.setItem(themeKey, pref);
  } catch {
    /* sem armazenamento: vale só nesta visita */
  }
  applyTheme(pref);
}

/** Reaplica quando o sistema troca de claro para escuro (só no automático). */
export function watchSystemTheme() {
  const m = media();
  if (!m) return () => {};
  const onChange = () => {
    if (loadThemePref() === "auto") applyTheme("auto");
  };
  m.addEventListener?.("change", onChange);
  return () => m.removeEventListener?.("change", onChange);
}
