import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { t as tr, useLanguage } from "./i18n";
import { loadThemePref, saveThemePref, type ThemePref } from "./theme";

const options: [ThemePref, string, typeof Sun][] = [
  ["light", "Claro", Sun],
  ["dark", "Escuro", Moon],
  ["auto", "Automático", Monitor],
];

/** Linha de Configurações com Claro, Escuro e Automático. Vale na hora. */
export function ThemeSetting() {
  useLanguage();
  const [pref, setPref] = useState<ThemePref>(loadThemePref);
  useEffect(() => saveThemePref(pref), [pref]);
  return (
    <li className="theme-setting" data-tour="tema">
      <span>
        <b id="tema-titulo">{tr("Aparência")}</b>
        <small>{pref === "auto" ? tr("Segue o modo claro ou escuro do aparelho.") : tr("Guardada neste aparelho.")}</small>
      </span>
      <div className="theme-switch" role="radiogroup" aria-labelledby="tema-titulo">
        {options.map(([value, label, Icon]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={pref === value}
            className={pref === value ? "is-on" : ""}
            onClick={() => setPref(value)}
          >
            <Icon size={15} aria-hidden="true" /> {tr(label)}
          </button>
        ))}
      </div>
    </li>
  );
}
