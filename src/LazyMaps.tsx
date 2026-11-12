import {
  Component,
  lazy,
  Suspense,
  type ComponentProps,
  type ReactNode,
} from "react";
import { t as tr } from "./i18n";

/*
 * Leaflet (the interactive map) and the catalog are large. They are loaded
 * only when needed, so the first screen opens faster. To keep offline use
 * safe, preloadHeavyParts() downloads them in the background right after the
 * app opens, and a failed download shows a message instead of breaking the app.
 */
const loaders = {
  map: () => import("./TravelMap"),
  route: () => import("./RouteMap"),
  catalog: () => import("./Catalog"),
  meals: () => import("./explore/MealFinder"),
  tripMap: () => import("./journey/TripMapView"),
};

export function preloadHeavyParts() {
  for (const load of Object.values(loaders)) load().catch(() => {});
}

const TravelMapLazy = lazy(() =>
  loaders.map().then((m) => ({ default: m.TravelMap })),
);
const RouteMapLazy = lazy(() =>
  loaders.route().then((m) => ({ default: m.RouteMap })),
);
const MealFinderLazy = lazy(() =>
  loaders.meals().then((m) => ({ default: m.MealFinder })),
);
const TripMapLazy = lazy(() =>
  loaders.tripMap().then((m) => ({ default: m.TripMapView })),
);
const CatalogLazy = lazy(() =>
  loaders.catalog().then((m) => ({ default: m.Catalog })),
);

class LoadBoundary extends Component<
  { children: ReactNode; map?: boolean },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div
        className={
          this.props.map ? "lazy-loading lazy-map lazy-failed" : "lazy-loading lazy-failed"
        }
        role="status"
      >
        <p>
          {this.props.map
            ? tr("Mapa indisponível sem conexão. O restante da viagem continua funcionando.")
            : tr("Esta parte precisa de conexão para abrir pela primeira vez.")}
        </p>
        <button className="secondary small" onClick={() => location.reload()}>
          {tr("Tentar novamente")}
        </button>
      </div>
    );
  }
}

function Loading({ map }: { map?: boolean }) {
  return (
    <div className={map ? "lazy-loading lazy-map" : "lazy-loading"} role="status">
      {tr("Carregando…")}
    </div>
  );
}

export function TravelMap(
  props: ComponentProps<typeof import("./TravelMap").TravelMap>,
) {
  return (
    <LoadBoundary map>
      <Suspense fallback={<Loading map />}>
        <TravelMapLazy {...props} />
      </Suspense>
    </LoadBoundary>
  );
}

export function RouteMap(
  props: ComponentProps<typeof import("./RouteMap").RouteMap>,
) {
  return (
    <LoadBoundary map>
      <Suspense fallback={<Loading map />}>
        <RouteMapLazy {...props} />
      </Suspense>
    </LoadBoundary>
  );
}

export function Catalog(
  props: ComponentProps<typeof import("./Catalog").Catalog>,
) {
  return (
    <LoadBoundary>
      <Suspense fallback={<Loading />}>
        <CatalogLazy {...props} />
      </Suspense>
    </LoadBoundary>
  );
}

export function MealFinder(
  props: ComponentProps<typeof import("./explore/MealFinder").MealFinder>,
) {
  return (
    <LoadBoundary>
      <Suspense fallback={<Loading />}>
        <MealFinderLazy {...props} />
      </Suspense>
    </LoadBoundary>
  );
}

export function TripMapView(
  props: ComponentProps<typeof import("./journey/TripMapView").TripMapView>,
) {
  return (
    <LoadBoundary map>
      <Suspense fallback={<Loading map />}>
        <TripMapLazy {...props} />
      </Suspense>
    </LoadBoundary>
  );
}
