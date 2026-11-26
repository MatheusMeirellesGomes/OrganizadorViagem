/*
 * Dados práticos por país, escritos à mão e só para os países em que temos
 * certeza. Quando o país não está aqui, a tela diz que não tem a informação
 * em vez de chutar.
 */

export type Emergency = { general?: string; police?: string; ambulance?: string; fire?: string };
export type CountryFacts = {
  currency: string;
  language: string;
  emergency: Emergency;
  /** Tipos de tomada (letras do padrão internacional). */
  plugs: string;
  voltage: string;
  drive: "right" | "left";
};

const eu = (currency: string, language: string, plugs = "C, F", drive: "right" | "left" = "right"): CountryFacts => ({ currency, language, emergency: { general: "112" }, plugs, voltage: "230 V", drive });

export const countryFacts: Record<string, CountryFacts> = {
  BR: { currency: "BRL", language: "pt", emergency: { police: "190", ambulance: "192", fire: "193" }, plugs: "N, C", voltage: "127 V ou 220 V, conforme a cidade", drive: "right" },
  PT: eu("EUR", "pt"),
  ES: eu("EUR", "es"),
  FR: { ...eu("EUR", "fr", "C, E") },
  IT: eu("EUR", "it", "C, F, L"),
  DE: eu("EUR", "de"),
  NL: eu("EUR", "nl"),
  BE: eu("EUR", "fr", "C, E"),
  AT: eu("EUR", "de"),
  GR: eu("EUR", "el"),
  IE: { ...eu("EUR", "en", "G", "left"), emergency: { general: "112 ou 999" } },
  CH: { ...eu("CHF", "de", "C, J") },
  GB: { currency: "GBP", language: "en", emergency: { general: "999 ou 112" }, plugs: "G", voltage: "230 V", drive: "left" },
  US: { currency: "USD", language: "en", emergency: { general: "911" }, plugs: "A, B", voltage: "120 V", drive: "right" },
  CA: { currency: "CAD", language: "en", emergency: { general: "911" }, plugs: "A, B", voltage: "120 V", drive: "right" },
  MX: { currency: "MXN", language: "es", emergency: { general: "911" }, plugs: "A, B", voltage: "127 V", drive: "right" },
  AR: { currency: "ARS", language: "es", emergency: { general: "911", ambulance: "107", fire: "100" }, plugs: "I, C", voltage: "220 V", drive: "right" },
  CL: { currency: "CLP", language: "es", emergency: { police: "133", ambulance: "131", fire: "132" }, plugs: "C, L", voltage: "220 V", drive: "right" },
  UY: { currency: "UYU", language: "es", emergency: { general: "911" }, plugs: "C, F, L", voltage: "220 V", drive: "right" },
  CO: { currency: "COP", language: "es", emergency: { general: "123" }, plugs: "A, B", voltage: "110 V", drive: "right" },
  PE: { currency: "PEN", language: "es", emergency: { police: "105", ambulance: "106", fire: "116" }, plugs: "A, C", voltage: "220 V", drive: "right" },
  JP: { currency: "JPY", language: "ja", emergency: { police: "110", ambulance: "119", fire: "119" }, plugs: "A, B", voltage: "100 V", drive: "left" },
  KR: { currency: "KRW", language: "ko", emergency: { police: "112", ambulance: "119", fire: "119" }, plugs: "C, F", voltage: "220 V", drive: "right" },
  CN: { currency: "CNY", language: "zh", emergency: { police: "110", ambulance: "120", fire: "119" }, plugs: "A, C, I", voltage: "220 V", drive: "right" },
  AU: { currency: "AUD", language: "en", emergency: { general: "000" }, plugs: "I", voltage: "230 V", drive: "left" },
  NZ: { currency: "NZD", language: "en", emergency: { general: "111" }, plugs: "I", voltage: "230 V", drive: "left" },
  ZA: { currency: "ZAR", language: "en", emergency: { police: "10111", ambulance: "10177" }, plugs: "M, N", voltage: "230 V", drive: "left" },
  TH: { currency: "THB", language: "th", emergency: { police: "191", ambulance: "1669" }, plugs: "A, B, C, O", voltage: "220 V", drive: "left" },
  AE: { currency: "AED", language: "ar", emergency: { police: "999", ambulance: "998", fire: "997" }, plugs: "G", voltage: "230 V", drive: "right" },
  TR: { currency: "TRY", language: "tr", emergency: { general: "112" }, plugs: "C, F", voltage: "230 V", drive: "right" },
  IN: { currency: "INR", language: "en", emergency: { general: "112" }, plugs: "C, D, M", voltage: "230 V", drive: "left" },
};

/** Moedas que o Banco Central Europeu publica (cotação gratuita via Frankfurter). */
export const ecbCurrencies = "AUD BRL CAD CHF CNY CZK DKK EUR GBP HKD HUF IDR ILS INR ISK JPY KRW MXN MYR NOK NZD PHP PLN RON SEK SGD THB TRY USD ZAR".split(" ");

/** Frases úteis. Só para idiomas que conferimos. */
export const phraseKeys = ["Olá", "Obrigado(a)", "Por favor", "Com licença", "Quanto custa?", "Onde fica o banheiro?", "Não entendo", "Você fala inglês?", "A conta, por favor", "Preciso de ajuda"] as const;
export const phrases: Record<string, { name: string; list: string[]; romaji?: string[] }> = {
  en: { name: "Inglês", list: ["Hello", "Thank you", "Please", "Excuse me", "How much is it?", "Where is the restroom?", "I don't understand", "Do you speak English?", "The check, please", "I need help"] },
  es: { name: "Espanhol", list: ["Hola", "Gracias", "Por favor", "Disculpe", "¿Cuánto cuesta?", "¿Dónde está el baño?", "No entiendo", "¿Habla inglés?", "La cuenta, por favor", "Necesito ayuda"] },
  fr: { name: "Francês", list: ["Bonjour", "Merci", "S'il vous plaît", "Excusez-moi", "Combien ça coûte ?", "Où sont les toilettes ?", "Je ne comprends pas", "Parlez-vous anglais ?", "L'addition, s'il vous plaît", "J'ai besoin d'aide"] },
  it: { name: "Italiano", list: ["Ciao", "Grazie", "Per favore", "Mi scusi", "Quanto costa?", "Dov'è il bagno?", "Non capisco", "Parla inglese?", "Il conto, per favore", "Ho bisogno di aiuto"] },
  de: { name: "Alemão", list: ["Hallo", "Danke", "Bitte", "Entschuldigung", "Wie viel kostet das?", "Wo ist die Toilette?", "Ich verstehe nicht", "Sprechen Sie Englisch?", "Die Rechnung, bitte", "Ich brauche Hilfe"] },
  ja: {
    name: "Japonês",
    list: ["こんにちは", "ありがとうございます", "お願いします", "すみません", "いくらですか？", "トイレはどこですか？", "わかりません", "英語を話せますか？", "お会計をお願いします", "助けてください"],
    romaji: ["Konnichiwa", "Arigatō gozaimasu", "Onegaishimasu", "Sumimasen", "Ikura desu ka?", "Toire wa doko desu ka?", "Wakarimasen", "Eigo o hanasemasu ka?", "Okaikei o onegaishimasu", "Tasukete kudasai"],
  },
};
