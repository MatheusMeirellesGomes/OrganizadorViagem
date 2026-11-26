/*
 * Avatar desenhado pelo próprio app (SVG em camadas, sem biblioteca e sem
 * internet). Guardamos só as escolhas, então dá para editar depois e o avatar
 * acompanha a conta sem enviar nenhuma imagem.
 */
export const characterOptions = {
  face: ["round", "oval", "square"],
  skin: ["#f6d7c3", "#eec1a1", "#d9a07a", "#b97a51", "#8d5a3b", "#5e3a26"],
  hair: ["none", "short", "buzz", "side", "curly", "long", "bun", "afro"],
  hairColor: ["#1d1512", "#4a2e1d", "#7a4a26", "#b9772f", "#d9b26a", "#9a9a9a", "#a83a2a"],
  eyes: ["dots", "round", "smile", "sleepy"],
  brows: ["flat", "arched", "thick", "none"],
  nose: ["small", "round", "long"],
  mouth: ["smile", "grin", "neutral", "open"],
  beard: ["none", "stubble", "goatee", "full"],
  mustache: ["none", "classic"],
  glasses: ["none", "round", "square", "sun"],
  hat: ["none", "cap", "beanie", "sunhat", "explorer"],
  clothes: ["tshirt", "hoodie", "jacket", "hawaiian", "winter"],
  clothesColor: ["#2f6b55", "#2b7a8a", "#3e6fb0", "#c7862f", "#a8473b", "#6b4f8a", "#2d2d2d", "#e9e4d8"],
  accessory: ["none", "backpack", "camera", "scarf", "headphones"],
  background: ["#dfeee6", "#dbe8f4", "#f4e6cf", "#f1dcdc", "#e6e0f1", "#e8e8e3", "#244f43", "#1d3557"],
} as const;

export type CharacterKey = keyof typeof characterOptions;
export type Character = { [K in CharacterKey]: (typeof characterOptions)[K][number] };

export const defaultCharacter: Character = {
  face: "oval",
  skin: "#d9a07a",
  hair: "short",
  hairColor: "#4a2e1d",
  eyes: "round",
  brows: "arched",
  nose: "small",
  mouth: "smile",
  beard: "none",
  mustache: "none",
  glasses: "none",
  hat: "none",
  clothes: "tshirt",
  clothesColor: "#2f6b55",
  accessory: "none",
  background: "#dfeee6",
};

/** Aceita só valores da lista; o resto volta ao padrão. Nunca confia no que veio guardado. */
export function parseCharacter(raw: unknown): Character | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const v = raw as Record<string, unknown>;
  const out = { ...defaultCharacter } as Record<string, string>;
  for (const key of Object.keys(characterOptions) as CharacterKey[]) {
    const options = characterOptions[key] as readonly string[];
    if (typeof v[key] === "string" && options.includes(v[key] as string)) out[key] = v[key] as string;
  }
  return out as Character;
}

export function randomCharacter(random = Math.random): Character {
  const out = {} as Record<string, string>;
  for (const key of Object.keys(characterOptions) as CharacterKey[]) {
    const options = characterOptions[key] as readonly string[];
    // Acessórios e chapéus aparecem com menos frequência para não carregar o desenho.
    const sparse = key === "hat" || key === "glasses" || key === "accessory" || key === "beard" || key === "mustache";
    out[key] = sparse && random() < 0.55 ? options[0] : options[Math.floor(random() * options.length)];
  }
  return out as Character;
}

const shade = (hex: string, amount: number) => {
  const n = parseInt(hex.slice(1), 16);
  const c = (s: number) => Math.max(0, Math.min(255, ((n >> s) & 255) + amount));
  return `rgb(${c(16)} ${c(8)} ${c(0)})`;
};

/** Desenho do avatar. `title` vira o nome lido por leitores de tela. */
export function CharacterSvg({ c, size = 96, title }: { c: Character; size?: number; title?: string }) {
  const skinDark = shade(c.skin, -28);
  const hairDark = shade(c.hairColor, -20);
  const cloth = c.clothesColor;
  const clothDark = shade(cloth, -30);
  const faceRx = c.face === "round" ? 40 : c.face === "square" ? 36 : 36;
  const faceRy = c.face === "round" ? 40 : c.face === "square" ? 40 : 44;
  const faceR = c.face === "square" ? 18 : faceRx;
  const ink = "#2a1f1a";
  const lightBg = !["#244f43", "#1d3557"].includes(c.background);
  return (
    <svg viewBox="0 0 200 200" width={size} height={size} role="img" aria-label={title} className="character-svg">
      <rect width="200" height="200" fill={c.background} />
      {!lightBg && <circle cx="100" cy="92" r="70" fill="#ffffff" opacity="0.06" />}

      {/* Mochila atrás do corpo */}
      {c.accessory === "backpack" && (
        <g>
          <rect x="44" y="140" width="112" height="70" rx="22" fill="#7a5a36" />
          <rect x="52" y="146" width="96" height="10" rx="5" fill="#5f4528" />
        </g>
      )}
      {/* Cabelo comprido atrás da cabeça */}
      {(c.hair === "long" || c.hair === "afro") && (
        <path
          d={c.hair === "long" ? "M52 92 Q50 40 100 36 Q150 40 148 92 L152 150 Q100 166 48 150 Z" : "M44 90 Q40 30 100 26 Q160 30 156 90 Q160 128 140 136 L60 136 Q40 128 44 90 Z"}
          fill={c.hairColor}
        />
      )}
      {c.hair === "bun" && <circle cx="100" cy="34" r="16" fill={c.hairColor} />}

      {/* Corpo e roupa */}
      <path d="M40 200 Q42 150 100 146 Q158 150 160 200 Z" fill={cloth} />
      <rect x="88" y="128" width="24" height="22" rx="8" fill={skinDark} />
      {c.clothes === "tshirt" && <path d="M84 148 Q100 160 116 148" fill="none" stroke={clothDark} strokeWidth="3" />}
      {c.clothes === "hoodie" && (
        <g>
          <path d="M66 150 Q100 176 134 150 Q120 168 100 170 Q80 168 66 150 Z" fill={clothDark} />
          <line x1="94" y1="168" x2="92" y2="186" stroke="#f3efe6" strokeWidth="2.5" strokeLinecap="round" />
          <line x1="106" y1="168" x2="108" y2="186" stroke="#f3efe6" strokeWidth="2.5" strokeLinecap="round" />
        </g>
      )}
      {c.clothes === "jacket" && (
        <g>
          <path d="M100 150 L100 200" stroke={clothDark} strokeWidth="3" />
          <path d="M86 148 L100 170 L114 148" fill="#f3efe6" />
          <path d="M86 148 L96 176 L80 160 Z M114 148 L104 176 L120 160 Z" fill={clothDark} />
        </g>
      )}
      {c.clothes === "hawaiian" && (
        <g fill="#ffffff" opacity="0.85">
          <circle cx="70" cy="172" r="5" />
          <circle cx="128" cy="168" r="4" />
          <circle cx="112" cy="188" r="5" />
          <circle cx="84" cy="190" r="4" />
          <path d="M88 148 L100 164 L112 148" fill={clothDark} opacity="1" />
        </g>
      )}
      {c.clothes === "winter" && (
        <g>
          <path d="M40 200 Q42 150 100 146 Q158 150 160 200 Z" fill={cloth} />
          <path d="M60 176 H140 M56 190 H144" stroke="#ffffff" strokeWidth="4" strokeDasharray="6 6" opacity="0.8" />
          <rect x="80" y="140" width="40" height="16" rx="8" fill={clothDark} />
        </g>
      )}
      {c.accessory === "backpack" && (
        <g stroke="#5f4528" strokeWidth="7" strokeLinecap="round">
          <line x1="72" y1="152" x2="70" y2="200" />
          <line x1="128" y1="152" x2="130" y2="200" />
        </g>
      )}
      {c.accessory === "camera" && (
        <g>
          <path d="M76 150 L100 178 L124 150" fill="none" stroke="#2d2d2d" strokeWidth="2.5" />
          <rect x="86" y="172" width="28" height="20" rx="4" fill="#2d2d2d" />
          <circle cx="100" cy="182" r="6" fill="#6f8fb8" stroke="#ddd" strokeWidth="2" />
        </g>
      )}
      {c.accessory === "scarf" && <path d="M76 140 Q100 158 124 140 L126 152 Q100 170 74 152 Z M110 156 L118 186 L106 186 L102 160 Z" fill="#c0392b" />}

      {/* Rosto */}
      <circle cx={100 - faceRx - 2} cy="98" r="9" fill={skinDark} />
      <circle cx={100 + faceRx + 2} cy="98" r="9" fill={skinDark} />
      <rect x={100 - faceRx} y={96 - faceRy} width={faceRx * 2} height={faceRy * 2} rx={faceR} fill={c.skin} />

      {/* Cabelo por cima */}
      {c.hair === "short" && <path d="M62 84 Q60 44 100 42 Q142 44 138 84 Q130 64 100 62 Q74 62 62 84 Z" fill={c.hairColor} />}
      {c.hair === "buzz" && <path d="M64 78 Q66 48 100 46 Q134 48 136 78 Q120 62 100 62 Q80 62 64 78 Z" fill={c.hairColor} opacity="0.85" />}
      {c.hair === "side" && <path d="M60 90 Q56 40 104 40 Q144 44 140 86 Q128 58 92 66 Q74 70 60 90 Z" fill={c.hairColor} />}
      {c.hair === "curly" && (
        <g fill={c.hairColor}>
          {[66, 78, 90, 102, 114, 126, 136].map((x, i) => (
            <circle key={x} cx={x} cy={i % 2 ? 52 : 58} r="13" />
          ))}
          <circle cx="62" cy="74" r="10" />
          <circle cx="138" cy="74" r="10" />
        </g>
      )}
      {c.hair === "long" && <path d="M60 92 Q58 46 100 44 Q142 46 140 92 Q132 62 104 60 Q78 60 60 92 Z" fill={c.hairColor} />}
      {c.hair === "bun" && <path d="M62 82 Q62 46 100 46 Q138 46 138 82 Q124 62 100 62 Q76 62 62 82 Z" fill={c.hairColor} />}
      {c.hair === "afro" && <path d="M58 80 Q60 48 100 48 Q140 48 142 80 Q124 66 100 66 Q76 66 58 80 Z" fill={hairDark} />}

      {/* Sobrancelhas */}
      {c.brows !== "none" && (
        <g stroke={c.hair === "none" ? ink : hairDark} strokeWidth={c.brows === "thick" ? 5 : 3} strokeLinecap="round" fill="none">
          {c.brows === "arched" ? (
            <>
              <path d="M74 80 Q83 74 92 79" />
              <path d="M108 79 Q117 74 126 80" />
            </>
          ) : (
            <>
              <path d="M74 79 H92" />
              <path d="M108 79 H126" />
            </>
          )}
        </g>
      )}

      {/* Olhos */}
      {c.eyes === "dots" && (
        <g fill={ink}>
          <circle cx="83" cy="92" r="3.6" />
          <circle cx="117" cy="92" r="3.6" />
        </g>
      )}
      {c.eyes === "round" && (
        <g>
          <circle cx="83" cy="92" r="7" fill="#fff" />
          <circle cx="117" cy="92" r="7" fill="#fff" />
          <circle cx="84" cy="93" r="3.8" fill={ink} />
          <circle cx="118" cy="93" r="3.8" fill={ink} />
        </g>
      )}
      {c.eyes === "smile" && (
        <g stroke={ink} strokeWidth="3.2" strokeLinecap="round" fill="none">
          <path d="M76 94 Q83 86 90 94" />
          <path d="M110 94 Q117 86 124 94" />
        </g>
      )}
      {c.eyes === "sleepy" && (
        <g stroke={ink} strokeWidth="3.2" strokeLinecap="round" fill="none">
          <path d="M76 91 Q83 97 90 91" />
          <path d="M110 91 Q117 97 124 91" />
        </g>
      )}

      {/* Óculos */}
      {c.glasses !== "none" && (
        <g stroke="#2a2a2a" strokeWidth="3" fill={c.glasses === "sun" ? "#1f2933" : "#ffffff22"}>
          {c.glasses === "square" ? (
            <>
              <rect x="70" y="82" width="26" height="20" rx="4" />
              <rect x="104" y="82" width="26" height="20" rx="4" />
            </>
          ) : (
            <>
              <circle cx="83" cy="92" r="12" />
              <circle cx="117" cy="92" r="12" />
            </>
          )}
          <path d="M95 92 H105" fill="none" />
        </g>
      )}

      {/* Nariz */}
      {c.nose === "small" && <path d="M100 98 Q96 108 101 110" stroke={skinDark} strokeWidth="3" fill="none" strokeLinecap="round" />}
      {c.nose === "round" && <circle cx="100" cy="106" r="6" fill={skinDark} />}
      {c.nose === "long" && <path d="M100 94 L95 114 Q100 117 104 114" stroke={skinDark} strokeWidth="3" fill="none" strokeLinecap="round" />}

      {/* Barba e bigode */}
      {c.beard === "stubble" && <path d={`M${104 - faceRx} 112 Q100 ${150 + (faceRy - 44)} ${96 + faceRx} 112 Q100 134 ${104 - faceRx} 112 Z`} fill={hairDark} opacity="0.35" />}
      {c.beard === "full" && <path d={`M${102 - faceRx} 100 Q100 ${158 + (faceRy - 44)} ${98 + faceRx} 100 Q100 132 ${102 - faceRx} 100 Z`} fill={c.hairColor} />}
      {c.beard === "goatee" && <path d="M90 128 Q100 144 110 128 Q100 134 90 128 Z" fill={c.hairColor} />}
      {c.mustache === "classic" && <path d="M86 118 Q100 110 114 118 Q100 116 86 118 Z" fill={c.hairColor} stroke={c.hairColor} strokeWidth="3" />}

      {/* Boca */}
      {c.mouth === "smile" && <path d="M88 122 Q100 132 112 122" stroke={ink} strokeWidth="3" fill="none" strokeLinecap="round" />}
      {c.mouth === "grin" && <path d="M86 120 Q100 138 114 120 Z" fill="#fff" stroke={ink} strokeWidth="2.5" strokeLinejoin="round" />}
      {c.mouth === "neutral" && <path d="M90 124 H110" stroke={ink} strokeWidth="3" strokeLinecap="round" />}
      {c.mouth === "open" && <ellipse cx="100" cy="124" rx="7" ry="8" fill="#7a2e2e" />}

      {/* Chapéus */}
      {c.hat === "cap" && (
        <g>
          <path d="M62 72 Q62 40 100 40 Q138 40 138 72 Z" fill="#c0392b" />
          <path d="M100 70 H160 Q156 80 138 78 H100 Z" fill="#a5281d" />
        </g>
      )}
      {c.hat === "beanie" && (
        <g>
          <path d="M60 78 Q60 34 100 34 Q140 34 140 78 Z" fill="#2b7a8a" />
          <rect x="58" y="70" width="84" height="14" rx="7" fill="#1c5562" />
          <circle cx="100" cy="30" r="9" fill="#f3efe6" />
        </g>
      )}
      {c.hat === "sunhat" && (
        <g>
          <ellipse cx="100" cy="70" rx="64" ry="12" fill="#d9b26a" />
          <path d="M70 70 Q70 38 100 38 Q130 38 130 70 Z" fill="#e6c584" />
          <rect x="70" y="60" width="60" height="7" fill="#a8473b" />
        </g>
      )}
      {c.hat === "explorer" && (
        <g>
          <ellipse cx="100" cy="68" rx="58" ry="11" fill="#8a6a3f" />
          <path d="M68 68 Q68 34 100 34 Q132 34 132 68 Z" fill="#a8865a" />
          <rect x="68" y="58" width="64" height="6" fill="#5f4528" />
        </g>
      )}
      {c.accessory === "headphones" && (
        <g>
          <path d={`M${100 - faceRx - 6} 96 Q${100 - faceRx - 6} 36 100 36 Q${100 + faceRx + 6} 36 ${100 + faceRx + 6} 96`} fill="none" stroke="#2d2d2d" strokeWidth="6" />
          <rect x={100 - faceRx - 14} y="86" width="14" height="24" rx="6" fill="#2d2d2d" />
          <rect x={100 + faceRx} y="86" width="14" height="24" rx="6" fill="#2d2d2d" />
        </g>
      )}
    </svg>
  );
}
