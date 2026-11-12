import type { Point } from "../places";

/*
 * Transport, vehicles, packing, reminders and preparation (Etapa 16).
 * Everything is optional except what a record cannot exist without (the kind
 * of transport and, for a leg, where it starts and ends). Booking references
 * (PNR, rental number) are NEVER stored here: see secrets.ts.
 */

export const transportKinds = {
  flight: "Avião",
  own_car: "Carro próprio",
  rental_car: "Carro alugado",
  train: "Trem",
  bus: "Ônibus",
  ferry: "Transporte marítimo",
  transit: "Transporte público",
  taxi: "Táxi ou aplicativo",
  other: "Outros",
} as const;
export type TransportKind = keyof typeof transportKinds;
export const roadKinds: TransportKind[] = ["own_car", "rental_car"];

export type Stop = {
  name: string;
  /** IATA code for airports, station code, etc. */
  code?: string;
  point?: Point;
  terminal?: string;
};

export type Leg = {
  id: string;
  from: Stop;
  to: Stop;
  departDate: string;
  departTime: string;
  /** IANA time zone of the departure (e.g. America/Sao_Paulo). Empty = trip zone. */
  departZone?: string;
  arriveDate: string;
  arriveTime: string;
  arriveZone?: string;
  carrier?: string;
  number?: string;
  gate?: string;
  cabin?: string;
  seat?: string;
};

export const checkInStatuses = { unknown: "Não verificado", open: "Aberto", done: "Feito" } as const;
export type FlightInfo = {
  cabinBag?: string;
  checkedBag?: string;
  /** Opening entered by the person (from the airline); never guessed. */
  checkInDate?: string;
  checkInTime?: string;
  checkInStatus?: keyof typeof checkInStatuses;
  checkInUrl?: string;
};

export type RoadRoute = {
  provider: string;
  distanceKm: number;
  durationMin: number;
  /** Simplified line [lat, lng] for the map. */
  line: [number, number][];
  fetchedAt: string;
};
export type RoadInfo = {
  vehicleIds?: string[];
  /** Road distance: typed by the person or from a routing provider, never a straight line. */
  distanceKm?: number;
  distanceSource?: "manual" | "route";
  durationMin?: number;
  route?: RoadRoute;
  via?: Stop[];
};

export type Transport = {
  id: string;
  kind: TransportKind;
  title?: string;
  legs: Leg[];
  /** Participant ids (Fase 4 of the budget) or free names. */
  passengers?: string[];
  reservationId?: string;
  documentIds?: string[];
  notes?: string;
  flight?: FlightInfo;
  road?: RoadInfo;
  /** True when a booking reference is kept privately for this record. */
  hasSecret?: boolean;
};

export const fuelKinds = {
  gasoline: "Gasolina",
  ethanol: "Etanol",
  flex: "Flex",
  diesel: "Diesel",
  hybrid: "Híbrido",
  electric: "Elétrico",
  lpg: "GLP",
} as const;
export type FuelKind = keyof typeof fuelKinds;

export type Rental = {
  company?: string;
  pickupPlace?: string;
  pickupDate?: string;
  pickupTime?: string;
  dropoffPlace?: string;
  dropoffDate?: string;
  dropoffTime?: string;
  insurance?: string;
  /** Major units in `currency`. Unknown stays undefined. */
  deductible?: number;
  deposit?: number;
  currency?: string;
  drivers?: string[];
  countries?: string[];
  winterEquipment?: boolean;
};

export type Vehicle = {
  id: string;
  ownership: "own" | "rental";
  label?: string;
  make?: string;
  model?: string;
  year?: number;
  category?: string;
  fuel?: FuelKind;
  /** km per litre (or km per kWh for electric). */
  efficiency?: number;
  seats?: number;
  bags?: number;
  rental?: Rental;
  hasSecret?: boolean;
};

/** Expense link to a transport or vehicle, so the same cost is never added twice. */
export const costKeys = {
  fare: "Passagem",
  rental: "Aluguel",
  fuel: "Combustível",
  tolls: "Pedágios",
  parking: "Estacionamento",
  insurance: "Seguro",
  border: "Taxas de fronteira",
  driver: "Condutor adicional",
  equipment: "Equipamentos extras",
  other: "Outros custos",
} as const;
export type CostKey = keyof typeof costKeys;
