import { useEffect, useRef, useState } from "react";
import { Dices, RotateCcw, X } from "lucide-react";
import { t as tr, useLanguage } from "../i18n";
import { CharacterSvg, characterOptions, defaultCharacter, randomCharacter, type Character, type CharacterKey } from "./character";

/* Grupos de escolha, na ordem em que aparecem. Cores viram bolinhas; o resto, miniaturas. */
const groups: [string, CharacterKey[]][] = [
  ["Rosto", ["face", "skin", "nose"]],
  ["Cabelo", ["hair", "hairColor"]],
  ["Olhos e boca", ["eyes", "brows", "mouth"]],
  ["Barba", ["beard", "mustache"]],
  ["Acessórios", ["glasses", "hat", "accessory"]],
  ["Roupa", ["clothes", "clothesColor"]],
  ["Fundo", ["background"]],
];
const labels: Record<CharacterKey, string> = {
  face: "Formato do rosto",
  skin: "Tom de pele",
  nose: "Nariz",
  hair: "Cabelo",
  hairColor: "Cor do cabelo",
  eyes: "Olhos",
  brows: "Sobrancelhas",
  mouth: "Boca",
  beard: "Barba",
  mustache: "Bigode",
  glasses: "Óculos",
  hat: "Chapéu",
  accessory: "Acessório de viagem",
  clothes: "Roupa",
  clothesColor: "Cor da roupa",
  background: "Cor do fundo",
};
const optionNames: Record<string, string> = {
  round: "Redondo", oval: "Oval", square: "Quadrado", none: "Nenhum", short: "Curto", buzz: "Raspado", side: "De lado",
  curly: "Cacheado", long: "Comprido", bun: "Coque", afro: "Black power", dots: "Pontinhos", smile: "Sorrindo",
  sleepy: "Tranquilos", flat: "Retas", arched: "Arqueadas", thick: "Grossas", small: "Pequeno", grin: "Sorrisão",
  neutral: "Neutra", open: "Aberta", stubble: "Por fazer", goatee: "Cavanhaque", full: "Cheia", classic: "Clássico",
  sun: "De sol", cap: "Boné", beanie: "Gorro", sunhat: "De praia", explorer: "Explorador", tshirt: "Camiseta",
  hoodie: "Moletom", jacket: "Jaqueta", hawaiian: "Havaiana", winter: "De inverno", backpack: "Mochila",
  camera: "Câmera", scarf: "Cachecol", headphones: "Fones",
};
const isColor = (v: string) => v.startsWith("#");

/** Criador de avatar: prévia ao vivo, categorias, aleatório, restaurar e salvar. */
export function CharacterEditor({ initial, onSave, onCancel }: { initial?: Character; onSave: (c: Character) => Promise<void> | void; onCancel: () => void }) {
  useLanguage();
  const [c, setC] = useState<Character>(initial ?? defaultCharacter);
  const [group, setGroup] = useState(0);
  const [saving, setSaving] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal?.();
  }, []);
  const set = (key: CharacterKey, value: string) => setC((old) => ({ ...old, [key]: value }) as Character);
  return (
    <dialog ref={dialog} className="character-editor" aria-labelledby="character-title" onCancel={(e) => { e.preventDefault(); onCancel(); }}>
      <header className="character-head">
        <h2 id="character-title">{tr("Criar meu avatar")}</h2>
        <button type="button" className="icon-button" aria-label={tr("Fechar")} onClick={onCancel}>
          <X size={18} />
        </button>
      </header>
      <div className="character-body">
        <div className="character-preview">
          <CharacterSvg c={c} size={168} title={tr("Prévia do avatar")} />
          <div className="character-quick">
            <button type="button" className="secondary small" onClick={() => setC(randomCharacter())}>
              <Dices size={15} /> {tr("Aleatório")}
            </button>
            <button type="button" className="text-button small" onClick={() => setC(initial ?? defaultCharacter)}>
              <RotateCcw size={14} /> {tr("Restaurar")}
            </button>
          </div>
        </div>
        <div className="character-controls">
          <div className="character-tabs" role="tablist" aria-label={tr("Partes do avatar")}>
            {groups.map(([name], i) => (
              <button key={name} type="button" role="tab" aria-selected={i === group} className={i === group ? "is-on" : ""} onClick={() => setGroup(i)}>
                {tr(name)}
              </button>
            ))}
          </div>
          <div className="character-panel" role="tabpanel">
            {groups[group][1].map((key) => {
              const options = characterOptions[key] as readonly string[];
              return (
                <fieldset key={key} className="character-field">
                  <legend>{tr(labels[key])}</legend>
                  <div className={"character-options" + (isColor(options[0]) ? " is-colors" : "")}>
                    {options.map((value) => {
                      const on = c[key] === value;
                      const name = isColor(value) ? `${tr(labels[key])} ${options.indexOf(value) + 1}` : tr(optionNames[value] ?? value);
                      return (
                        <button
                          key={value}
                          type="button"
                          aria-pressed={on}
                          aria-label={name}
                          title={name}
                          className={on ? "is-on" : ""}
                          onClick={() => set(key, value)}
                        >
                          {isColor(value) ? (
                            <span className="character-swatch" style={{ background: value }} />
                          ) : (
                            <>
                              <CharacterSvg c={{ ...c, [key]: value } as Character} size={52} />
                              <small>{name}</small>
                            </>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
              );
            })}
          </div>
        </div>
      </div>
      <footer className="character-foot">
        <button type="button" className="secondary" onClick={onCancel}>
          {tr("Cancelar")}
        </button>
        <button
          type="button"
          className="primary"
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            try {
              await onSave(c);
            } finally {
              setSaving(false);
            }
          }}
        >
          {tr("Salvar avatar")}
        </button>
      </footer>
    </dialog>
  );
}
