/*
 * Passos do tour guiado e o que fica guardado neste aparelho.
 * Cada passo aponta para um elemento marcado com data-tour="...". Se o
 * elemento não existir na tela (aba desligada, por exemplo), o passo é pulado.
 * O tour só mostra; não cria viagens nem muda dados.
 */
export type TourName = "home" | "trip";
export type TourStatus = "done" | "skipped";
export type TourStep = { target?: string; title: string; text: string };

export const tourKey = "gomes-tour";

export const tours: Record<TourName, TourStep[]> = {
  home: [
    {
      target: "nav-trips",
      title: "Minhas viagens",
      text: "Aqui ficam todas as suas viagens: as que estão em planejamento, as próximas e as que já aconteceram.",
    },
    {
      target: "modo-viajante",
      title: "Modo Viajante",
      text: "Abra quando estiver no destino: mostra onde você está, o que tem perto, o que fazer agora e como chegar a pé, de bicicleta ou de carro.",
    },
    {
      target: "nav-bookings",
      title: "Central de Reservas",
      text: "Voos, hotéis, carros e ingressos de todas as viagens num lugar só, com prazos de cancelamento e alertas de conflito. Dá para importar colando o e-mail de confirmação.",
    },
    {
      target: "nav-search",
      title: "Pesquisar e comparar",
      text: "Abra Google Voos, Booking e outros sites já preenchidos com a sua viagem e salve as opções que achar para comparar.",
    },
    {
      target: "criar-viagem",
      title: "Criar uma viagem",
      text: "Comece por aqui. Só o destino é obrigatório; datas e detalhes podem vir depois.",
    },
    {
      target: "nav-explore",
      title: "Explorar",
      text: "Busque atrações, restaurantes e lugares perto do destino e salve direto no roteiro.",
    },
    {
      target: "nav-map",
      title: "Meu mapa",
      text: "Todos os lugares das suas viagens num só mapa.",
    },
    {
      target: "nav-profile",
      title: "Meu espaço",
      text: "No Meu espaço ficam seu passaporte de viagens, os lugares que você quer conhecer, sua conta, backups, privacidade e configurações como tema e idioma. Usando sem conta? É lá que você entra ou cria uma, sem perder suas viagens.",
    },
    {
      title: "Tudo pronto!",
      text: "Ao abrir uma viagem, mostramos rapidinho o roteiro, os transportes, as despesas e o Modo Viagem.",
    },
  ],
  trip: [
    {
      target: "roteiro",
      title: "Roteiro",
      text: "Organize as atividades dia a dia. O botão + acrescenta mais um dia.",
    },
    {
      target: "aba-Guia",
      title: "Guia do destino",
      text: "Clima dos próximos dias, câmbio, hora local, tomadas, números de emergência e frases úteis. O que for carregado fica salvo para usar sem internet.",
    },
    {
      target: "aba-Transportes",
      title: "Transportes",
      text: "Voos, trens, ônibus e carro, com horários, trechos e localizadores.",
    },
    {
      target: "aba-Hospedagens",
      title: "Hospedagens",
      text: "Onde você dorme em cada noite, com check-in, check-out e endereço.",
    },
    {
      target: "aba-Despesas",
      title: "Despesas",
      text: "Orçamento da viagem e divisão de gastos entre as pessoas.",
    },
    {
      target: "aba-Diário",
      title: "Diário",
      text: "Escreva sobre cada dia, com fotos e como você se sentiu. No fim, a viagem ganha uma retrospectiva.",
    },
    {
      target: "modo-viagem",
      title: "Modo Viagem",
      text: "Durante a viagem, mostra o que vem agora: próxima atividade, horários, endereços e atalhos para o mapa.",
    },
    {
      title: "Boa viagem!",
      text: "Você pode rever este tutorial quando quiser em Meu espaço, na seção Configurações.",
    },
  ],
};

export function loadTourState(): Partial<Record<TourName, TourStatus>> {
  try {
    const raw = localStorage.getItem(tourKey);
    if (!raw) return {};
    if (raw === "done") return { home: "done", trip: "done" };
    const v = JSON.parse(raw) as Record<string, unknown>;
    const ok = (x: unknown): x is TourStatus => x === "done" || x === "skipped";
    return { ...(ok(v.home) ? { home: v.home } : {}), ...(ok(v.trip) ? { trip: v.trip } : {}) };
  } catch {
    return {};
  }
}

export function saveTourStatus(name: TourName, status: TourStatus) {
  try {
    localStorage.setItem(tourKey, JSON.stringify({ ...loadTourState(), [name]: status }));
  } catch {
    /* sem armazenamento: o tour pode aparecer de novo */
  }
}

export const restartEvent = "gomes-tour-reiniciar";
export function restartTour() {
  try {
    localStorage.removeItem(tourKey);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(restartEvent));
}

/** Primeiro elemento visível com data-tour igual ao alvo. */
export function findTarget(target: string, doc: Document = document): HTMLElement | null {
  for (const el of doc.querySelectorAll<HTMLElement>(`[data-tour="${CSS.escape(target)}"]`)) {
    const r = el.getBoundingClientRect();
    const onScreen = r.right > 0 && r.left < innerWidth; // menu lateral fechado fica fora da tela
    if (r.width > 0 && r.height > 0 && onScreen && getComputedStyle(el).visibility !== "hidden") return el;
  }
  return null;
}

/** Posição do cartão: abaixo, acima ou encaixado na borda, sem cobrir o alvo. */
export function placeCard(
  target: { top: number; bottom: number; left: number; width: number } | null,
  card: { width: number; height: number },
  view: { width: number; height: number; bottomInset?: number },
  gap = 14,
) {
  const margin = 16;
  const maxLeft = Math.max(margin, view.width - card.width - margin);
  if (!target) return { top: Math.max(margin, (view.height - card.height) / 2), left: Math.max(margin, (view.width - card.width) / 2), side: "center" as const };
  const left = Math.min(maxLeft, Math.max(margin, target.left + target.width / 2 - card.width / 2));
  const below = target.bottom + gap;
  const floor = view.height - (view.bottomInset ?? 0) - margin;
  if (below + card.height <= floor) return { top: below, left, side: "below" as const };
  const above = target.top - gap - card.height;
  if (above >= margin) return { top: above, left, side: "above" as const };
  // Sem espaço dos dois lados: encosta na borda oposta ao alvo.
  const targetInTop = target.top + (target.bottom - target.top) / 2 < view.height / 2;
  return { top: targetInTop ? floor - card.height : margin, left, side: targetInTop ? ("bottom" as const) : ("top" as const) };
}
