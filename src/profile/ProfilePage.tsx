import { useRef, useState, type ReactNode } from "react";
import { Accessibility, Archive, Bell, Bus, Camera, Cloud, Compass, Download, Eraser, HardDrive, LogIn, LogOut, MapPin, Pencil, Settings, Shield, SlidersHorizontal, Trash2, Upload, Utensils } from "lucide-react";
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
  const [notif, setNotif] = useState<NotificationPermission | "unsupported">(() => (typeof Notification === "undefined" ? "unsupported" : Notification.permission));
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

      <section id="preferencias" className="panel profile-section profile-prefs-section">
        <form
          className="profile-prefs"
          onSubmit={(e) => {
            e.preventDefault();
            submit(e.currentTarget, "prefs");
          }}
        >
          <header className="settings-head">
            <span className="settings-icon" aria-hidden="true">
              <SlidersHorizontal size={18} />
            </span>
            <div>
              <h2>{tr("Preferências")}</h2>
              <p>{tr("Tudo opcional. Ajuda a sugerir roteiros, restaurantes e moedas.")}</p>
            </div>
          </header>
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
          <div className="pref-groups">
            {(
              [
                ["styles", "Estilo de viagem", travelStyles, profile.styles, Compass],
                ["transport", "Como prefere se deslocar", transportPrefs, profile.transport, Bus],
                ["food", "Comida", foodPrefs, profile.food, Utensils],
                ["accessibility", "Acessibilidade", accessibilityPrefs, profile.accessibility, Accessibility],
              ] as const
            ).map(([name, legend, options, value, Icon]) => (
              <fieldset key={name} className="pref-group">
                <legend>
                  <Icon size={15} aria-hidden="true" /> {tr(legend)}
                </legend>
                <Chips name={name} options={options} value={value} />
              </fieldset>
            ))}
          </div>
          <footer className="settings-foot">
            <span className="muted">{tr("Marque quantas opções quiser.")}</span>
            <button className="primary" disabled={busy || pending}>
              {tr("Salvar preferências")}
            </button>
          </footer>
        </form>
      </section>

      <div className="settings-grid">
        <section id="conta" className="panel settings-card" aria-labelledby="conta-title">
          <header className="settings-head">
            <span className="settings-icon" aria-hidden="true">
              {userId ? <Cloud size={18} /> : <HardDrive size={18} />}
            </span>
            <div>
              <h2 id="conta-title">{tr("Minha conta")}</h2>
              <p>{userId ? tr("Viagens sincronizadas entre aparelhos") : tr("Viagens salvas só neste navegador")}</p>
            </div>
          </header>
          <ul className="settings-rows">
            <li>
              <span>
                <b>{userId ? tr("Conta sincronizada") : tr("Modo local")}</b>
                <small>{userId ? email : tr("Não sincroniza com outros aparelhos.")}</small>
              </span>
              <span className={"settings-badge" + (userId ? " is-ok" : "")}>{userId ? tr("Conectada") : tr("Local")}</span>
            </li>
            <li>
              <span>
                <b>{userId ? tr("Sair deste aparelho") : tr("Sincronizar aparelhos")}</b>
                <small>
                  {userId
                    ? tr("Suas viagens continuam guardadas na conta.")
                    : hasSupabase
                      ? tr("Entre para levar viagens, preferências e foto para outros aparelhos.")
                      : tr("Disponível depois de configurar o Supabase (veja o README).")}
                </small>
              </span>
              {userId ? (
                <button className="secondary small" onClick={onSignOut}>
                  <LogOut size={15} /> {tr("Sair")}
                </button>
              ) : (
                hasSupabase && (
                  <button className="secondary small" onClick={onSignIn}>
                    <LogIn size={15} /> {tr("Entrar")}
                  </button>
                )
              )}
            </li>
            <li>
              <span>
                <b>{userId ? tr("Preferências e foto") : tr("Não perca suas viagens")}</b>
                <small>{userId ? tr("Acompanham você em qualquer aparelho conectado.") : tr("Sem conta, limpar o navegador apaga os dados. Exporte um backup de vez em quando.")}</small>
              </span>
              {userId ? (
                <span className="settings-badge is-ok">{tr("Na conta")}</span>
              ) : (
                <button className="secondary small" onClick={() => onExport(true)} disabled={busy}>
                  <Download size={15} /> {tr("Backup")}
                </button>
              )}
            </li>
          </ul>
        </section>

        <section id="dados" className="panel settings-card" aria-labelledby="dados-title">
          <header className="settings-head">
            <span className="settings-icon" aria-hidden="true">
              <Archive size={18} />
            </span>
            <div>
              <h2 id="dados-title">{tr("Meus dados")}</h2>
              <p>{tr("Backups ficam com você. Guarde em local privado.")}</p>
            </div>
          </header>
          <ul className="settings-rows">
            <li>
              <span>
                <b>{tr("Backup completo")}</b>
                <small>{tr("Viagens, fotos e documentos da carteira.")}</small>
              </span>
              <button className="secondary small" onClick={() => onExport(true)} disabled={busy}>
                <Download size={15} /> {tr("Exportar")}
              </button>
            </li>
            <li>
              <span>
                <b>{tr("Backup sem documentos")}</b>
                <small>{tr("Viagens e fotos, sem os arquivos da carteira.")}</small>
              </span>
              <button className="secondary small" onClick={() => onExport(false)} disabled={busy}>
                <Download size={15} /> {tr("Exportar")}
              </button>
            </li>
            <li>
              <span>
                <b>{tr("Importar backup")}</b>
                <small>{tr("Entra como novas cópias; nada é substituído.")}</small>
              </span>
              <button className="secondary small" onClick={onImport} disabled={busy}>
                <Upload size={15} /> {tr("Importar")}
              </button>
            </li>
          </ul>
          <p className="settings-note">{tr("Localizadores de reserva nunca entram no backup.")}</p>
        </section>

        <section id="privacidade" className="panel settings-card" aria-labelledby="privacidade-title">
          <header className="settings-head">
            <span className="settings-icon" aria-hidden="true">
              <Shield size={18} />
            </span>
            <div>
              <h2 id="privacidade-title">{tr("Privacidade")}</h2>
              <p>{tr("Quem vê o quê")}</p>
            </div>
          </header>
          <ul className="settings-rows">
            <li>
              <span>
                <b>{tr("Foto e preferências")}</b>
                <small>{cloud ? tr("Pasta privada da sua conta.") : tr("Guardadas neste navegador.")}</small>
              </span>
              <span className="settings-badge is-ok">{tr("Só você")}</span>
            </li>
            <li>
              <span>
                <b>{tr("Localizadores e documentos")}</b>
                <small>{tr("Participantes das viagens não veem.")}</small>
              </span>
              <span className="settings-badge is-ok">{tr("Só você")}</span>
            </li>
            <li>
              <span>
                <b>{tr("Viagens compartilhadas com você")}</b>
                <small>{tr("Convites e papéis ficam em cada viagem, na aba Informações.")}</small>
              </span>
              <span className="settings-badge">{formatNumber(sharedWithMe, 0)}</span>
            </li>
          </ul>
        </section>

        <section id="configuracoes" className="panel settings-card" aria-labelledby="config-title">
          <header className="settings-head">
            <span className="settings-icon" aria-hidden="true">
              <Settings size={18} />
            </span>
            <div>
              <h2 id="config-title">{tr("Configurações")}</h2>
              <p>{tr("Ajustes deste aparelho")}</p>
            </div>
          </header>
          <ul className="settings-rows">
            {settings}
            <li>
              <span>
                <b>{tr("Notificações de lembretes")}</b>
                <small>
                  {notif === "granted"
                    ? tr("Ativadas. Aparecem com o app aberto.")
                    : notif === "denied"
                      ? tr("Bloqueadas nas configurações do navegador.")
                      : notif === "unsupported"
                        ? tr("Este navegador não oferece notificações.")
                        : tr("Os lembretes aparecem no topo do app.")}
                </small>
              </span>
              {notif === "default" ? (
                <button className="secondary small" onClick={async () => setNotif(await Notification.requestPermission())}>
                  <Bell size={15} /> {tr("Permitir")}
                </button>
              ) : (
                <span className={"settings-badge" + (notif === "granted" ? " is-ok" : "")}>{notif === "granted" ? tr("Ativas") : tr("Desligadas")}</span>
              )}
            </li>
            <li>
              <span>
                <b>{tr("Cache do Explorar")}</b>
                <small>{tr("Buscas guardadas por 24 horas. Suas viagens não são afetadas.")}</small>
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
                <Eraser size={15} /> {tr("Limpar")}
              </button>
            </li>
          </ul>
        </section>
      </div>

      {file && <AvatarEditor file={file} onDone={usePhoto} onCancel={() => setFile(undefined)} />}
    </div>
  );
}
