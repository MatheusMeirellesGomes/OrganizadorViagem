import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { ZoomIn } from "lucide-react";
import { t as tr } from "../i18n";
import { clampCrop, loadImage, renderAvatar, scaleFor, type Crop } from "./avatar";

const VIEW = 260;

/** Square crop with drag, zoom and arrow keys, before the photo is saved. */
export function AvatarEditor({ file, onDone, onCancel }: { file: Blob; onDone: (photo: Blob) => Promise<void> | void; onCancel: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [img, setImg] = useState<HTMLImageElement>();
  const [src, setSrc] = useState("");
  const [crop, setCrop] = useState<Crop>({ zoom: 1, x: 0, y: 0 });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const drag = useRef<{ x: number; y: number; start: Crop } | undefined>(undefined);

  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal?.();
    const url = URL.createObjectURL(file);
    setSrc(url);
    loadImage(file).then(setImg, (e) => setError(e.message));
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const set = (c: Crop) => img && setCrop(clampCrop(img.naturalWidth, img.naturalHeight, VIEW, c));
  const s = img ? scaleFor(img.naturalWidth, img.naturalHeight, VIEW, crop.zoom) : 1;
  const w = img ? img.naturalWidth * s : VIEW;
  const h = img ? img.naturalHeight * s : VIEW;

  const down = (e: PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, start: crop };
  };
  const move = (e: PointerEvent) => {
    const d = drag.current;
    if (d) set({ ...d.start, x: d.start.x + e.clientX - d.x, y: d.start.y + e.clientY - d.y });
  };
  const key = (e: KeyboardEvent) => {
    const step = e.shiftKey ? 30 : 8;
    const moves: Record<string, Partial<Crop>> = {
      ArrowLeft: { x: crop.x - step },
      ArrowRight: { x: crop.x + step },
      ArrowUp: { y: crop.y - step },
      ArrowDown: { y: crop.y + step },
      "+": { zoom: crop.zoom + 0.1 },
      "=": { zoom: crop.zoom + 0.1 },
      "-": { zoom: crop.zoom - 0.1 },
    };
    if (moves[e.key]) {
      e.preventDefault();
      set({ ...crop, ...moves[e.key] });
    }
  };

  async function save() {
    if (!img) return;
    setBusy(true);
    setError("");
    try {
      await onDone(await renderAvatar(img, crop, VIEW));
      dialog.current?.close();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar a foto.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog ref={dialog} className="avatar-editor" aria-labelledby="avatar-editor-title" onClose={onCancel}>
      <h2 id="avatar-editor-title">{tr("Enquadrar foto")}</h2>
      <p className="muted">{tr("Arraste para posicionar e use o zoom. Também funciona com as setas do teclado.")}</p>
      <div
        className="avatar-crop"
        style={{ width: VIEW, height: VIEW }}
        tabIndex={0}
        role="application"
        aria-label={tr("Área de enquadramento da foto")}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={() => (drag.current = undefined)}
        onPointerCancel={() => (drag.current = undefined)}
        onKeyDown={key}
      >
        {src && img && (
          <img
            src={src}
            alt=""
            draggable={false}
            style={{ width: w, height: h, left: (VIEW - w) / 2 + crop.x, top: (VIEW - h) / 2 + crop.y }}
          />
        )}
        <span className="avatar-crop-ring" aria-hidden="true" />
      </div>
      <label className="avatar-zoom">
        <ZoomIn size={16} aria-hidden="true" />
        <span className="sr-only">{tr("Zoom")}</span>
        <input type="range" min={1} max={4} step={0.05} value={crop.zoom} onChange={(e) => set({ ...crop, zoom: Number(e.target.value) })} aria-label={tr("Zoom")} />
      </label>
      {error && <p role="alert">{tr(error)}</p>}
      <div className="avatar-editor-actions">
        <button type="button" className="secondary" onClick={() => dialog.current?.close()}>
          {tr("Cancelar")}
        </button>
        <button type="button" className="primary" disabled={!img || busy} onClick={save}>
          {busy ? tr("Salvando…") : tr("Usar esta foto")}
        </button>
      </div>
    </dialog>
  );
}
