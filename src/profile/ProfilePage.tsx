import { useRef, useState, type ReactNode } from "react";
import { Camera, Cloud, Download, HardDrive, LogIn, LogOut, MapPin, Pencil, Plus, Shield, Trash2 } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { t as tr, tf, formatNumber, useLanguage, setLanguage, type Language } from "../i18n";
import type { Trip } from "../model";
import { decor, hideOnError } from "../decor";
import { checkAvatarFile, blobToDataUrl } from "./avatar";
import { AvatarEditor } from "./AvatarEditor";
import { ProfileAvatar } from "./ProfileAvatar";
import { removeAvatar, uploadAvatar } from "./account";
import {
  accessibilityPrefs,
  foodPrefs,
  paces,
  parseProfile,
  personalStats,
  transportPrefs,
  travelStyles,
  type Pace,
  type Profile,
} from "./profile";

export const profileSections = [
  ["perfil", "Meu perfil"],
  ["preferencias", "Preferências"],
  ["conta", "Minha conta"],
  ["dados", "Meus dados"],
  ["privacidade", "Privacidade"],
  ["configuracoes", "Configurações"],
] as const;

const currencies = ["BRL", "EUR", "USD", "GBP", "ARS", "CLP", "JPY"];

function Chips({ name, options, value }: { name: string; options: Record<string, string>; value?: string[] }) {
  return (
    <div className="pref-chips">
      {Object.entries(options).map(([k, label]) => (
        <label key={k} className="pref-chip">
          <input type="checkbox" name={name} value={k} defaultChecked={value?.includes(k)} />
          <span>{tr(label)}</span>
        </label>
      ))}
    </div>
  );
}

/** "Meu espaço" as a traveler profile (Etapa 16). */
export function ProfilePage({
  profile,
  onSave,
  trips,
  client,
  userId,
  email,
  hasSupabase,
  busy,
  sharedWithMe,
  onExport,
  onImport,
  onSignOut,
  onSignIn,
  onOpenTrip,
  settings,
}: {
  profile: Profile;
  onSave: (p: Profile) => Promise<boolean>;
  trips: Trip[];
  client?: SupabaseClient | null;
  userId?: string;
  email?: string;
  hasSupabase: boolean;
  busy: boolean;
  sharedWithMe: number;
  onExport: (includeDocuments?: boolean) => void;
  onImport: () => void;
  onSignOut: () => void;
  onSignIn: () => void;
  onOpenTrip: (t: Trip) => void;
  settings?: ReactNode;
}) {
  const language = useLanguage();
  const [editing, setEditing] = useState(false);
  const [file, setFile] = useState<Blob>();
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const stats = personalStats(trips);
  const cloud = Boolean(client && userId);

  async function pickFile(f?: File) {
    if (input.current) input.current.value = "";
    if (!f) return;
    try {
      await checkAvatarFile(f);
      setMessage("");
      setFile(f);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Não foi possível abrir a foto.");
    }
  }

  async function usePhoto(photo: Blob) {
    const old = profile.avatar;
    const avatar: Profile["avatar"] = cloud ? { kind: "cloud", path: await uploadAvatar(client!, userId!, photo) } : { kind: "local", data: await blobToDataUrl(photo) };
    if (!(await onSave({ ...profile, avatar }))) {
      if (avatar.kind === "cloud") await removeAvatar(client!, avatar.path).catch(() => undefined);
      throw new Error("Não foi possível salvar a foto.");
    }
    if (old?.kind === "cloud" && client) await removeAvatar(client, old.path).catch(() => undefined);
    setFile(undefined);
    setMessage("Foto atualizada.");
  }

  async function removePhoto() {
    if (!profile.avatar || !confirm(tr("Remover sua foto de perfil?"))) return;
    const old = profile.avatar;
    setPending(true);
    try {
      if (await onSave({ ...profile, avatar: undefined })) {
        if (old.kind === "cloud" && client) await removeAvatar(client, old.path).catch(() => undefined);
        setMessage("Foto removida.");
      }
    } finally {
      setPending(false);
    }
  }

  async function submit(form: HTMLFormElement, part: "about" | "prefs") {
    const f = new FormData(form);
    const all = (n: string) => f.getAll(n).map(String);
    const next = parseProfile(
      part === "about"
        ? { ...profile, name: f.get("name"), bio: f.get("bio"), homeCity: f.get("homeCity") }
        : { ...profile, pace: f.get("pace"), currency: f.get("currency"), styles: all("styles"), transport: all("transport"), food: all("food"), accessibility: all("accessibility") },
    );
    setPending(true);
    try {
      if (await onSave(next)) {
        setMessage(part === "about" ? "Perfil salvo." : cloud ? "Preferências salvas na sua conta." : "Preferências salvas neste aparelho.");
        if (part === "about") setEditing(false);
      }
    } finally {
      setPending(false);
    }
  }

  const statItems = [
    [stats.done, "Viagens realizadas"],
    [stats.countries, "Países visitados"],
    [stats.cities, "Cidades visitadas"],
    [stats.places, "Lugares conhecidos"],
  ] as const;

  return (
    <div className="profile-page">
      <nav className="profile-nav" aria-label={tr("Seções do perfil")}>
        {profileSections.map(([id, label]) => (
          <a key={id} href={"#" + id}>
            {tr(label)}
          </a>
        ))}
      </nav>

      <section id="perfil" className="profile-hero" aria-labelledby="perfil-title">
        <img className="profile-hero-photo" src={decor.lake} alt="" aria-hidden="true" onError={hideOnError} />
        <div className="profile-hero-card">
          <div className="profile-hero-avatar">
            <ProfileAvatar profile={profile} client={client} size={104} />
            <button type="button" className="icon-button profile-photo-button" aria-label={tr("Trocar foto de perfil")} onClick={() => input.current?.click()} disabled={busy || pending}>
              <Camera size={16} />
            </button>
            <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => pickFile(e.target.files?.[0])} aria-label={tr("Escolher foto de perfil")} />
          </div>
          <div className="profile-hero-text">
            <span className="profile-kicker">{tr("Meu perfil de viajante")}</span>
            <h2 id="perfil-title">{profile.name || tr("Viajante sem nome")}</h2>
            {profile.bio && <p>{profile.bio}</p>}
            <ul className="profile-facts">
              {profile.homeCity && (
                <li>
                  <MapPin size={14} aria-hidden="true" /> {tf("Saindo de {city}", { city: profile.homeCity })}
                </li>
              )}
              <li>{language === "en" ? "English" : language === "es" ? "Español" : "Português"}</li>
              <li>{tr(paces[profile.pace])}</li>
              {(profile.styles || []).map((s) => (
                <li key={s}>{tr(travelStyles[s])}</li>
              ))}
            </ul>
          </div>
          <div className="profile-hero-actions">
            <button className="secondary small" onClick={() => setEditing((x) => !x)} aria-expanded={editing}>
              <Pencil size={15} /> {tr("Editar perfil")}
            </button>
            {profile.avatar && (
              <button className="text-button small" onClick={removePhoto} disabled={busy || pending}>
                <Trash2 size={14} /> {tr("Remover foto")}
              </button>
            )}
          </div>
        </div>
        {editing && (
          <form
            className="profile-edit"
            onSubmit={(e) => {
              e.preventDefault();
              submit(e.currentTarget, "about");
            }}
          >
            <label>
              {tr("Nome de exibição")}
              <input name="name" defaultValue={profile.name} maxLength={80} placeholder={tr("Seu nome")} autoComplete="name" />
            </label>
            <label>
              {tr("Cidade de origem")} <small>{tr("opcional")}</small>
              <input name="homeCity" defaultValue={profile.homeCity} maxLength={80} placeholder={tr("Ex.: Belo Horizonte")} />
            </label>
            <label className="wide">
              {tr("Sobre você")} <small>{tr("opcional")}</small>
              <textarea name="bio" defaultValue={profile.bio} maxLength={280} rows={2} placeholder={tr("Uma frase sobre o seu jeito de viajar")} />
            </label>
            <div className="wide profile-edit-actions">
              <button type="button" className="secondary" onClick={() => setEditing(false)}>
                {tr("Cancelar")}
              </button>
              <button className="primary" disabled={busy || pending}>
                {tr("Salvar perfil")}
              </button>
            </div>
          </form>
        )}
        <p role="status" className="muted profile-status">
          {tr(message)}
        </p>
      </section>

      <section className="profile-stats" aria-label={tr("Seus números")}>
        {statItems.map(([n, label]) => (
          <div key={label} className="profile-stat">
            <strong>{formatNumber(n, 0)}</strong>
            <span>{tr(label)}</span>
          </div>
        ))}
        <div className="profile-stat profile-next">
          <span>{tr("Próxima viagem")}</span>
          {stats.next ? (
            <button className="text-button" onClick={() => onOpenTrip(stats.next!.trip)}>
              <b>{stats.next.trip.title}</b>
              <small>
                {stats.next.days === 0 ? tr("Começa hoje") : tf("Em {count} dias", { count: stats.next.days ?? 0 })}
              </small>
            </button>
          ) : (
            <small>{tr("Nenhuma viagem com data marcada")}</small>
          )}
        </div>
        <p className="muted profile-stats-note">{tr("Contados a partir das viagens concluídas, dos lugares salvos e das visitas marcadas.")}</p>
      </section>

      <section id="preferencias" className="panel profile-section">
        <h2>{tr("Preferências")}</h2>
        <p className="muted">{tr("Tudo opcional. Ajuda a sugerir roteiros, restaurantes e moedas.")}</p>
        <form
          className="profile-prefs"
          onSubmit={(e) => {
            e.preventDefault();
            submit(e.currentTarget, "prefs");
          }}
        >
          <div className="profile-prefs-grid">
            <label>
              {tr("Idioma")}
              <select value={language} onChange={(e) => setLanguage(e.target.value as Language)}>
                <option value="pt-BR">Português brasileiro</option>
                <option value="en">English</option>
                <option value="es">Español</option>
              </select>
            </label>
            <label>
              {tr("Moeda preferida")}
              <select name="currency" defaultValue={profile.currency ?? ""}>
                <option value="">{tr("Sem preferência")}</option>
                {currencies.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label>
              {tr("Ritmo de viagem")}
              <select name="pace" defaultValue={profile.pace}>
                {(Object.keys(paces) as Pace[]).map((k) => (
                  <option key={k} value={k}>
                    {tr(paces[k])}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <fieldset>
            <legend>{tr("Estilo de viagem")}</legend>
            <Chips name="styles" options={travelStyles} value={profile.styles} />
          </fieldset>
          <fieldset>
            <legend>{tr("Como prefere se deslocar")}</legend>
            <Chips name="transport" options={transportPrefs} value={profile.transport} />
          </fieldset>
          <fieldset>
            <legend>{tr("Comida")}</legend>
            <Chips name="food" options={foodPrefs} value={profile.food} />
          </fieldset>
          <fieldset>
            <legend>{tr("Acessibilidade")}</legend>
            <Chips name="accessibility" options={accessibilityPrefs} value={profile.accessibility} />
          </fieldset>
          <button className="primary" disabled={busy || pending}>
            {tr("Salvar preferências")}
          </button>
        </form>
      </section>

      <div className="profile-columns">
        <section id="conta" className="panel profile-section">
          <h2>{tr("Minha conta")}</h2>
          {userId ? (
            <>
              <p className="profile-line">
                <Cloud size={18} aria-hidden="true" />
                <span>
                  <b>{tr("Conta sincronizada")}</b>
                  <small>{email}</small>
                </span>
              </p>
              <p className="muted">{tr("Suas viagens, preferências e foto ficam na sua conta e aparecem em outros aparelhos.")}</p>
              <button className="secondary" onClick={onSignOut}>
                <LogOut size={16} /> {tr("Sair da conta")}
              </button>
            </>
          ) : (
            <>
              <p className="profile-line">
                <HardDrive size={18} aria-hidden="true" />
                <span>
                  <b>{tr("Modo local")}</b>
                  <small>{tr("Salvo neste navegador")}</small>
                </span>
              </p>
              <p className="muted">{tr("Você está no modo local. As viagens ficam neste navegador e não são sincronizadas com outros aparelhos.")}</p>
              {hasSupabase ? (
                <button className="secondary" onClick={onSignIn}>
                  <LogIn size={16} /> {tr("Entrar ou criar conta")}
                </button>
              ) : (
                <p className="muted">{tr("Para entrar na conta e sincronizar aparelhos, configure o projeto Supabase seguindo o README do repositório.")}</p>
              )}
            </>
          )}
        </section>

        <section id="dados" className="panel profile-section">
          <h2>{tr("Meus dados")}</h2>
          <p className="muted">{tr("O backup inclui informações, fotos e documentos, inclusive os arquivos baixados da conta. Guarde-o em local privado.")}</p>
          <div className="profile-buttons">
            <button className="secondary" onClick={() => onExport(true)} disabled={busy}>
              <Download size={16} /> {tr("Exportar backup das viagens")}
            </button>
            <button className="secondary" onClick={() => onExport(false)} disabled={busy}>
              <Download size={16} /> {tr("Exportar sem documentos")}
            </button>
            <button className="secondary" onClick={onImport} disabled={busy}>
              <Plus size={16} /> {tr("Importar backup")}
            </button>
          </div>
          <p className="muted">{tr("As viagens são adicionadas como novas cópias. Nenhuma viagem existente é substituída.")}</p>
          <p className="muted">{tr("Localizadores de reserva nunca entram no backup. Arquivos de viagens compartilhadas com você ficam com quem os enviou.")}</p>
        </section>

        <section id="privacidade" className="panel profile-section">
          <h2>{tr("Privacidade")}</h2>
          <ul className="profile-privacy">
            <li>
              <Shield size={16} aria-hidden="true" />
              {cloud ? tr("Sua foto fica numa pasta privada da sua conta e só aparece para você.") : tr("Sua foto e suas preferências ficam só neste navegador.")}
            </li>
            <li>
              <Shield size={16} aria-hidden="true" />
              {tr("Quem participa das suas viagens não vê seu perfil, seus localizadores de reserva nem seus documentos.")}
            </li>
            <li>
              <Shield size={16} aria-hidden="true" />
              {sharedWithMe ? tf("{count} viagens foram compartilhadas com você.", { count: sharedWithMe }) : tr("Nenhuma viagem de outra pessoa compartilhada com você.")}
            </li>
          </ul>
          <p className="muted">{tr("Convites e papéis ficam em cada viagem, na aba Informações.")}</p>
        </section>

        <section id="configuracoes" className="panel profile-section">
          <h2>{tr("Configurações")}</h2>
          {settings}
          <div className="profile-setting">
            <span>
              <b>{tr("Cache do Explorar")}</b>
              <small>{tr("Buscas guardadas por 24 horas para abrir mais rápido. Suas viagens não são afetadas.")}</small>
            </span>
            <button
              className="secondary small"
              onClick={() => {
                try {
                  ["gomes-explorar-cache-v2", "gomes-wikidata-classes-v2"].forEach((k) => localStorage.removeItem(k));
                } catch {
                  // Storage blocked: nothing cached.
                }
                setMessage("Cache do Explorar limpo.");
              }}
            >
              {tr("Limpar")}
            </button>
          </div>
        </section>
      </div>

      {file && <AvatarEditor file={file} onDone={usePhoto} onCancel={() => setFile(undefined)} />}
    </div>
  );
}
