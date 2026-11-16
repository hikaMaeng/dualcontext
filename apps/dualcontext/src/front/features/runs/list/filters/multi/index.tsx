import { X } from "lucide-react";
import { Field } from "../../../../../components/layout";
import { Select } from "../../../../../components/ui/input";
import type { Texts } from "../../../../../i18n";
import { addName, removeName } from "../../../query";
import { RSC } from "./resource";

type Props = {
  label: string;
  options: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
  /** `data-testid` 접두어(`<testId>-select`, `<testId>-chips`). */
  testId: string;
  t: Texts;
};

/**
 * 여러 개 고르는 필터. 네이티브 셀렉트로 항목을 하나씩 더하고, 고른 항목은 칩으로 보이며 칩의 버튼으로 뺀다.
 * 이미 고른 항목은 선택지에서 빠진다.
 */
export function MultiSelect({ label, options, selected, onChange, testId, t }: Props) {
  const remaining = options.filter((name) => !selected.includes(name));
  return (
    <div className="grid content-start gap-2">
      <Field label={label}>
        <Select value="" data-testid={`${testId}-select`} onChange={(event) => event.target.value !== "" && onChange(addName(selected, event.target.value))}>
          <option value="">{t[RSC.RUNS_FILTERS_ADD_TEXT]}</option>
          {remaining.map((name) => <option key={name} value={name}>{name}</option>)}
        </Select>
      </Field>
      {selected.length > 0 && (
        <ul aria-label={`${label} · ${t[RSC.RUNS_FILTERS_CHOSEN_LABEL]}`} data-testid={`${testId}-chips`} className="flex flex-wrap gap-1">
          {selected.map((name) => (
            <li key={name} data-testid="run-filter-chip" data-name={name} className="flex max-w-full items-center gap-1 rounded-full border border-line bg-surface py-0.5 ps-2.5 pe-1 text-xs">
              <span className="min-w-0 truncate">{name}</span>
              <button type="button" aria-label={`${name} ${t[RSC.RUNS_FILTERS_REMOVE_BUTTON]}`} className="rounded-full p-0.5 text-muted hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent" onClick={() => onChange(removeName(selected, name))}>
                <X aria-hidden="true" className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
