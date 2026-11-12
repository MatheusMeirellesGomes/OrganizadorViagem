import { useId, useMemo, useState } from "react";
import { MapPin } from "lucide-react";
import { t as tr } from "../i18n";
import { wikiLanguage } from "../catalog-service";
import { debounced, suggest, type Suggestion } from "../explore/search";
import type { Stop } from "./types";

/**
 * Name of a place with optional suggestions (Wikidata). Choosing one keeps
 * its coordinates for routes and the map; typing freely keeps just the name.
 */
export function PlaceField({ label, value, onChange, required }: { label: string; value: Stop; onChange: (s: Stop) => void; required?: boolean }) {
  const id = useId();
  const [items, setItems] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const lookup = useMemo(() => debounced((t, signal) => suggest(t, wikiLanguage(), { signal })), []);

  function type(name: string) {
    onChange({ ...value, name, point: undefined });
    setActive(-1);
    if (name.trim().length < 3) return setItems([]);
    lookup(name).then((r) => {
      if (r) {
        setItems(r.slice(0, 6));
        setOpen(true);
      }
    });
  }
  function choose(s: Suggestion) {
    onChange({ ...value, name: s.name, point: s.point });
    setItems([]);
    setOpen(false);
  }
  return (
    <div className="place-field">
      <label htmlFor={id}>
        {label}
        {value.point && (
          <span className="place-field-pin" title={tr("Com localização no mapa")}>
            <MapPin size={12} aria-hidden="true" /> {tr("no mapa")}
          </span>
        )}
      </label>
      <input
        id={id}
        value={value.name}
        required={required}
        maxLength={120}
        autoComplete="off"
        role="combobox"
        aria-expanded={open && items.length > 0}
        aria-controls={id + "-list"}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${id}-o${active}` : undefined}
        onChange={(e) => type(e.target.value)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onFocus={() => items.length && setOpen(true)}
        onKeyDown={(e) => {
          if (!open || !items.length) return;
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => (a + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length);
          } else if (e.key === "Enter" && active >= 0) {
            e.preventDefault();
            choose(items[active]);
          } else if (e.key === "Escape") setOpen(false);
        }}
      />
      {open && items.length > 0 && (
        <ul id={id + "-list"} role="listbox" className="place-field-list">
          {items.map((s, i) => (
            <li
              key={(s.qid ?? s.name) + i}
              id={`${id}-o${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(s);
              }}
            >
              <b>{s.name}</b>
              <small>{s.context}</small>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
