import { t as tr } from "./i18n";
import { decisionLabels, type Decision } from "./choices";
export function ChoiceButtons({
  value,
  onChoose,
  disabled,
}: {
  value?: Decision;
  onChoose: (d: Decision) => void;
  disabled: boolean;
}) {
  return (
    <div className="choice-buttons" aria-label={tr("Sua decisão")}>
      {(Object.keys(decisionLabels) as Decision[]).map((d) => (
        <button
          key={d}
          className={value === d ? "primary small" : "secondary small"}
          aria-pressed={value === d}
          disabled={disabled}
          onClick={() => onChoose(d)}
        >
          {tr(decisionLabels[d])}
        </button>
      ))}
    </div>
  );
}
