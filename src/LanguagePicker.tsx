import { useLanguage, setLanguage, type Language } from "./i18n";
export function LanguagePicker() {
  const language = useLanguage();
  return (
    <section className="panel">
      <h2>
        {language === "en"
          ? "Language"
          : language === "es"
            ? "Idioma"
            : "Idioma"}
      </h2>
      <label>
        {language === "en"
          ? "Interface language"
          : language === "es"
            ? "Idioma de la interfaz"
            : "Idioma da interface"}
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value as Language)}
        >
          <option value="pt-BR">Português brasileiro</option>
          <option value="en">English</option>
          <option value="es">Español</option>
        </select>
      </label>
    </section>
  );
}
