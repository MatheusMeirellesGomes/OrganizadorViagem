import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Accessibility,
  Archive,
  ArrowLeft,
  Bell,
  Bus,
  Camera,
  ChevronRight,
  Cloud,
  Compass,
  Download,
  Eraser,
  Globe2,
  LogIn,
  LogOut,
  Luggage,
  MapPin,
  Pencil,
  Settings,
  Shield,
  Trash2,
  Upload,
  UserPlus,
  UserRound,
  Utensils,
} from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { t as tr, tf, formatNumber, useLanguage, setLanguage, type Language } from "../i18n";
import type { Trip } from "../model";
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

/*
 * Meu Espaço: uma tela inicial curta (foto, nome, números e cinco categorias)
 * e uma página para cada categoria, com Voltar. O endereço muda para
 * #espaco/<categoria>, então o botão Voltar do navegador e do celular também
 * funciona.
 */
export const profileSections = [
  ["conta", "Minha conta"],
  ["viajante", "Meu perfil de viajante"],
  ["dados", "Meus dados"],
  ["privacidade", "Privacidade e segurança"],
  ["configuracoes", "Configurações"],
] as const;
export type SectionId = (typeof profileSections)[number][0];
const sectionIcons: Record<SectionId, typeof Cloud> = {
  conta: UserRound,
  viajante: Luggage,
  dados: Archive,
  privacidade: Shield,
  configuracoes: Settings,
};

const currencies = ["BRL", "EUR", "USD", "GBP", "ARS", "CLP", "JPY"];
const hashPrefix = "#espaco/";
export function sectionFromHash(hash: string): SectionId | null {
  if (!hash.startsWith(hashPrefix)) return null;
  const id = hash.slice(hashPrefix.length);
  return profileSections.some(([s]) => s === id) ? (id as SectionId) : null;
}

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

/** Convite discreto para quem usa sem conta. */
export function GuestInvite({ onSignIn, onSignUp, compact }: { onSignIn: () => void; onSignUp: () => void; compact?: boolean }) {
  return (
    <section className={"guest-invite" + (compact ? " is-compact" : "")} aria-labelledby="guest-invite-title">
      <span className="guest-invite-icon" aria-hidden="true">
        <Globe2 size={20} />
      </span>
      <div>
        <h3 id="guest-invite-title">{tr("Suas viagens podem ir ainda mais longe! 🌍")}</h3>
        <p>{tr("Crie uma conta para sincronizar e acessar suas informações em outros aparelhos. Suas viagens deste navegador não se perdem.")}</p>
      </div>
      <div className="guest-invite-actions">
        <button type="button" className="secondary small" onClick={onSignIn}>
          <LogIn size={15} /> {tr("Entrar")}
        </button>
        <button type="button" className="primary small" onClick={onSignUp}>
          <UserPlus size={15} /> {tr("Criar conta")}
        </button>
      </div>
    </section>
  );
}

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
  localTrips = 0,
  onExport,
  onImport,
  onSignOut,
  onSignIn,
  onSignUp,
  onReviewLocal,
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
  /** Viagens salvas só neste navegador (fora da conta). */
  localTrips?: number;
  onExport: (includeDocuments?: boolean) => void;
  onImport: () => void;
  onSignOut: () => void;
  onSignIn: () => void;
  onSignUp?: () => void;
  /** Mostra de novo a escolha de enviar as viagens deste navegador para a conta. */
  onReviewLocal?: () => void;
  onOpenTrip: (t: Trip) => void;
  settings?: ReactNode;
}) {
  const language = useLanguage();
  const [section, setSection] = useState<SectionId | null>(() => sectionFromHash(location.hash));
  const [editing, setEditing] = useState(false);
  const [file, setFile] = useState<Blob>();
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [notif, setNotif] = useState<NotificationPermission | "unsupported">(() => (typeof Notification === "undefined" ? "unsupported" : Notification.permission));
  const input = useRef<HTMLInputElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const lastSection = useRef<SectionId | null>(null);
  const stats = personalStats(trips);
  const cloud = Boolean(client && userId);
  const signUp = onSignUp ?? onSignIn;

  // Voltar do navegador fecha a categoria.
  useEffect(() => {
    const sync = () => setSection(sectionFromHash(location.hash));
    addEventListener("popstate", sync);
    addEventListener("hashchange", sync);
    return () => {
      removeEventListener("popstate", sync);
      removeEventListener("hashchange", sync);
    };
  }, []);
  // Foco no título ao trocar de tela; ao voltar, na categoria de onde veio.
  useEffect(() => {
    if (section) {
      heading.current?.focus();
      window.scrollTo({ top: 0 });
      lastSection.current = section;
    } else if (lastSection.current) {
      document.querySelector<HTMLElement>(`[data-section="${lastSection.current}"]`)?.focus();
    }
    setMessage("");
  }, [section]);

  function open(id: SectionId, edit = false) {
    if (location.hash !== hashPrefix + id) history.pushState({ espaco: id }, "", hashPrefix + id);
    setSection(id);
    setEditing(edit);
  }
  function back() {
    if (history.state?.espaco) history.back();
    else {
      history.replaceState(null, "", location.pathname + location.search);
      setSection(null);
    }
  }

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
  const languageName = language === "en" ? "English" : language === "es" ? "Español" : "Português";
  const summaries: Record<SectionId, string> = {
    conta: userId ? email || tr("Conta conectada") : tr("Visitante · salvo neste navegador"),
    viajante: [tr(paces[profile.pace]), ...(profile.styles || []).slice(0, 2).map((s) => tr(travelStyles[s]))].join(" · "),
    dados: localTrips && userId ? tf("{count} viagens só neste navegador", { count: localTrips }) : tr("Backup, importação e armazenamento"),
    privacidade: tr("Localizadores e documentos só seus"),
    configuracoes: [tr("Aparência"), languageName, tr("Tutorial")].join(" · "),
  };

  const avatarButton = (
    <>
      <button type="button" className="icon-button profile-photo-button" aria-label={tr("Trocar foto de perfil")} onClick={() => input.current?.click()} disabled={busy || pending}>
        <Camera size={16} />
      </button>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => pickFile(e.target.files?.[0])} aria-label={tr("Escolher foto de perfil")} />
    </>
  );
  const status = (
    <p role="status" className="muted profile-status">
      {tr(message)}
    </p>
  );

  // ---------- Tela inicial ----------
  const hub = (
    <div className="space-hub">
      <section className="space-header" aria-labelledby="perfil-title">
        <div className="profile-hero-avatar">
          <ProfileAvatar profile={profile} client={client} size={88} />
          {avatarButton}
        </div>
        <div className="space-header-text">
          <span className="profile-kicker">{tr("Meu perfil de viajante")}</span>
          <h2 id="perfil-title">{profile.name || tr("Viajante sem nome")}</h2>
          {profile.bio ? <p>{profile.bio}</p> : profile.homeCity ? null : <p>{tr("Conte um pouco do seu jeito de viajar.")}</p>}
          {profile.homeCity && (
            <p className="space-home">
              <MapPin size={14} aria-hidden="true" /> {tf("Saindo de {city}", { city: profile.homeCity })}
            </p>
          )}
        </div>
        <button type="button" className="secondary small space-edit" onClick={() => open("conta", true)}>
          <Pencil size={15} /> {tr("Editar perfil")}
        </button>
      </section>
      {status}

      {hasSupabase && !userId && <GuestInvite onSignIn={onSignIn} onSignUp={signUp} />}

      <ul className="space-stats" aria-label={tr("Seus números")}>
        {statItems.slice(0, 3).map(([n, label]) => (
          <li key={label}>
            <strong>{formatNumber(n, 0)}</strong>
            <span>{tr(label)}</span>
          </li>
        ))}
        <li className="space-next">
          <span>{tr("Próxima viagem")}</span>
          {stats.next ? (
            <button className="text-button" onClick={() => onOpenTrip(stats.next!.trip)}>
              <b>{stats.next.trip.title}</b>
              <small>{stats.next.days === 0 ? tr("Começa hoje") : tf("Em {count} dias", { count: stats.next.days ?? 0 })}</small>
            </button>
          ) : (
            <small>{tr("Nenhuma viagem com data marcada")}</small>
          )}
        </li>
      </ul>

      <nav className="space-list" aria-label={tr("Categorias do Meu Espaço")}>
        <ul>
          {profileSections.map(([id, label]) => {
            const Icon = sectionIcons[id];
            return (
              <li key={id}>
                <button type="button" className={"space-row space-" + id} data-section={id} data-tour={id === "configuracoes" ? "espaco-config" : id === "conta" ? "espaco-conta" : undefined} onClick={() => open(id)}>
                  <span className="space-row-icon" aria-hidden="true">
                    <Icon size={18} strokeWidth={2.1} />
                  </span>
                  <span className="space-row-text">
                    <b>{tr(label)}</b>
                    <small>{summaries[id]}</small>
                  </span>
                  <ChevronRight size={18} className="space-row-go" aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );

  // ---------- Páginas de cada categoria ----------
  const pages: Record<SectionId, ReactNode> = {
    conta: (
      <>
        {hasSupabase && !userId && <GuestInvite onSignIn={onSignIn} onSignUp={signUp} compact />}
        <section className="space-group" aria-labelledby="conta-perfil">
          <h3 id="conta-perfil">{tr("Dados pessoais")}</h3>
          <div className="space-card space-identity">
            <div className="profile-hero-avatar">
              <ProfileAvatar profile={profile} client={client} size={64} />
              {avatarButton}
            </div>
            <span>
              <b>{profile.name || tr("Viajante sem nome")}</b>
              <small>{profile.homeCity ? tf("Saindo de {city}", { city: profile.homeCity }) : tr("Cidade de origem não informada")}</small>
            </span>
            <span className="space-identity-actions">
              <button className="secondary small" onClick={() => setEditing((x) => !x)} aria-expanded={editing}>
                <Pencil size={15} /> {tr("Editar")}
              </button>
              {profile.avatar && (
                <button className="text-button small" onClick={removePhoto} disabled={busy || pending}>
                  <Trash2 size={14} /> {tr("Remover foto")}
                </button>
              )}
            </span>
          </div>
          {editing && (
            <form
              className="profile-edit space-card"
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
        </section>
        <section className="space-group" aria-labelledby="conta-acesso">
          <h3 id="conta-acesso">{tr("Acesso")}</h3>
          <ul className="settings-rows">
            <li>
              <span>
                <b>{userId ? tr("Conta sincronizada") : tr("Modo visitante")}</b>
                <small>{userId ? email : tr("Suas viagens ficam só neste navegador.")}</small>
              </span>
              <span className={"settings-badge" + (userId ? " is-ok" : "")}>{userId ? tr("Conectada") : tr("Local")}</span>
            </li>
            {userId ? (
              <>
                <li>
                  <span>
                    <b>{tr("Preferências e foto")}</b>
                    <small>{tr("Acompanham você em qualquer aparelho conectado.")}</small>
                  </span>
                  <span className="settings-badge is-ok">{tr("Na conta")}</span>
                </li>
                <li>
                  <span>
                    <b>{tr("Sair deste aparelho")}</b>
                    <small>{tr("Suas viagens continuam guardadas na conta.")}</small>
                  </span>
                  <button className="secondary small" onClick={onSignOut}>
                    <LogOut size={15} /> {tr("Sair")}
                  </button>
                </li>
              </>
            ) : (
              <>
                {!hasSupabase && (
                  <li>
                    <span>
                      <b>{tr("Sincronizar aparelhos")}</b>
                      <small>{tr("Disponível depois de configurar o Supabase (veja o README).")}</small>
                    </span>
                  </li>
                )}
                <li>
                  <span>
                    <b>{tr("Não perca suas viagens")}</b>
                    <small>{tr("Sem conta, limpar o navegador apaga os dados. Exporte um backup de vez em quando.")}</small>
                  </span>
                  <button className="secondary small" onClick={() => onExport(true)} disabled={busy}>
                    <Download size={15} /> {tr("Backup")}
                  </button>
                </li>
              </>
            )}
          </ul>
        </section>
      </>
    ),
    viajante: (
      <>
        <section className="space-group" aria-labelledby="viajante-numeros">
          <h3 id="viajante-numeros">{tr("Seus números")}</h3>
          <ul className="space-stats is-full">
            {statItems.map(([n, label]) => (
              <li key={label}>
                <strong>{formatNumber(n, 0)}</strong>
                <span>{tr(label)}</span>
              </li>
            ))}
          </ul>
          <p className="muted space-note">{tr("Contados a partir das viagens concluídas, dos lugares salvos e das visitas marcadas.")}</p>
        </section>
        <section className="space-group" aria-labelledby="viajante-pref">
          <h3 id="viajante-pref">{tr("Preferências")}</h3>
          <form
            className="profile-prefs space-card"
            onSubmit={(e) => {
              e.preventDefault();
              submit(e.currentTarget, "prefs");
            }}
          >
            <div className="profile-prefs-grid">
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
              <label>
                {tr("Moeda preferida")}
                <select name="currency" defaultValue={profile.currency ?? ""}>
                  <option value="">{tr("Sem preferência")}</option>
                  {currencies.map((c) => (
                    <option key={c}>{c}</option>
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
              <span className="muted">{tr("Tudo opcional. Ajuda a sugerir roteiros, restaurantes e moedas.")}</span>
              <button className="primary" disabled={busy || pending}>
                {tr("Salvar preferências")}
              </button>
            </footer>
          </form>
        </section>
      </>
    ),
    dados: (
      <>
        <section className="space-group" aria-labelledby="dados-backup">
          <h3 id="dados-backup">{tr("Backup")}</h3>
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
          <p className="muted space-note">{tr("Backups ficam com você. Guarde em local privado.")}</p>
        </section>
        <section className="space-group" aria-labelledby="dados-local">
          <h3 id="dados-local">{tr("Armazenado neste aparelho")}</h3>
          <ul className="settings-rows">
            <li>
              <span>
                <b>{userId ? tr("Viagens só deste navegador") : tr("Suas viagens")}</b>
                <small>
                  {userId
                    ? localTrips
                      ? tr("Criadas antes de entrar. Enviar para a conta não apaga nada daqui.")
                      : tr("Nenhuma viagem pendente. Tudo está na conta.")
                    : tr("Guardadas só neste navegador.")}
                </small>
              </span>
              {userId && localTrips > 0 && onReviewLocal ? (
                <button className="secondary small" onClick={onReviewLocal}>
                  <Cloud size={15} /> {tf("Revisar {count}", { count: localTrips })}
                </button>
              ) : (
                <span className="settings-badge">{formatNumber(userId ? localTrips : trips.length, 0)}</span>
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
      </>
    ),
    privacidade: (
      <>
        <section className="space-group" aria-labelledby="priv-quem">
          <h3 id="priv-quem">{tr("Quem vê o quê")}</h3>
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
          </ul>
        </section>
        <section className="space-group" aria-labelledby="priv-compart">
          <h3 id="priv-compart">{tr("Compartilhamento")}</h3>
          <ul className="settings-rows">
            <li>
              <span>
                <b>{tr("Viagens compartilhadas com você")}</b>
                <small>{tr("Convites e papéis ficam em cada viagem, na aba Informações.")}</small>
              </span>
              <span className="settings-badge">{formatNumber(sharedWithMe, 0)}</span>
            </li>
          </ul>
        </section>
        <section className="space-group" aria-labelledby="priv-seg">
          <h3 id="priv-seg">{tr("Segurança")}</h3>
          <ul className="settings-rows">
            <li>
              <span>
                <b>{tr("Backups")}</b>
                <small>{tr("Localizadores de reserva nunca entram no backup.")}</small>
              </span>
            </li>
            {userId && (
              <li>
                <span>
                  <b>{tr("Ao sair da conta")}</b>
                  <small>{tr("A cópia da conta guardada neste aparelho é apagada. As viagens do modo visitante continuam aqui.")}</small>
                </span>
              </li>
            )}
          </ul>
        </section>
      </>
    ),
    configuracoes: (
      <>
        <section className="space-group" aria-labelledby="config-geral">
          <h3 id="config-geral">{tr("Geral")}</h3>
          <ul className="settings-rows">
            {settings}
            <li>
              <span>
                <b id="idioma-titulo">{tr("Idioma")}</b>
                <small>{tr("Textos do app e formatos de data e moeda.")}</small>
              </span>
              <select className="space-select" aria-labelledby="idioma-titulo" value={language} onChange={(e) => setLanguage(e.target.value as Language)}>
                <option value="pt-BR">Português brasileiro</option>
                <option value="en">English</option>
                <option value="es">Español</option>
              </select>
            </li>
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
          </ul>
        </section>
      </>
    ),
  };

  return (
    <div className={"profile-page space" + (section ? " has-section" : "")}>
      {section ? (
        <div className="space-layout">
          <nav className="space-rail" aria-label={tr("Categorias do Meu Espaço")}>
            <button type="button" className="space-rail-home" onClick={back}>
              <ProfileAvatar profile={profile} client={client} size={28} />
              <span>{tr("Meu espaço")}</span>
            </button>
            {profileSections.map(([id, label]) => {
              const Icon = sectionIcons[id];
              return (
                <button
                  key={id}
                  type="button"
                  className={"space-rail-item space-" + id + (id === section ? " active" : "")}
                  aria-current={id === section ? "page" : undefined}
                  onClick={() => {
                    if (id === section) return;
                    history.replaceState({ espaco: id }, "", hashPrefix + id);
                    setSection(id);
                    setEditing(false);
                  }}
                >
                  <span className="space-row-icon" aria-hidden="true">
                    <Icon size={16} strokeWidth={2.1} />
                  </span>
                  {tr(label)}
                </button>
              );
            })}
          </nav>
          <div className="space-page">
            <header className="space-page-head">
              <button type="button" className="space-back" onClick={back}>
                <ArrowLeft size={18} /> <span>{tr("Meu espaço")}</span>
              </button>
              <h2 ref={heading} tabIndex={-1}>
                {tr(profileSections.find(([s]) => s === section)![1])}
              </h2>
            </header>
            {status}
            {pages[section]}
          </div>
        </div>
      ) : (
        hub
      )}
      {file && <AvatarEditor file={file} onDone={usePhoto} onCancel={() => setFile(undefined)} />}
    </div>
  );
}

