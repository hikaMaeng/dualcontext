import { planModeMessage, planModeText } from "../../../../../components/plan-labels";
import type { Texts } from "../../../../../i18n";
import { cn } from "../../../../../lib/utils";
import { readExecutionPlan, type ExecutionPlan } from "./model";
import { RSC } from "./resource";

type Props = { settings: unknown; tracedMode?: string | null; t: Texts };

type Row = { key: string; label: string; value: string; badge: boolean };

/** 모드가 쓰는 한도만 행으로 만든다(classic 은 한도가 없고, decompose 는 재평가 한도를 쓰지 않는다). 값이 기록에 없으면 행을 만들지 않는다. */
function rowsOf(plan: ExecutionPlan, t: Texts): Row[] {
  const { limits, reevaluate, writer } = plan;
  const rows: Row[] = [];
  const add = (key: string, label: string, value: number | string | undefined, badge: boolean) => {
    if (value !== undefined) rows.push({ key, label, value: String(value), badge });
  };
  if (plan.mode !== "classic") {
    add("maxlevels", t[RSC.RUNS_EXECUTION_MAXLEVELS_LABEL], limits.maxLevels, true);
    add("maxneeds", t[RSC.RUNS_EXECUTION_MAXNEEDS_LABEL], limits.maxNeedsPerItem, false);
    add("maxitems", t[RSC.RUNS_EXECUTION_MAXITEMS_LABEL], limits.maxItems, true);
    add("maxprovided", t[RSC.RUNS_EXECUTION_MAXPROVIDED_LABEL], limits.maxProvidedChars, false);
    add("dedupe", t[RSC.RUNS_EXECUTION_DEDUPE_LABEL], limits.dedupe === undefined ? undefined : t[limits.dedupe === "llm" ? RSC.RUNS_EXECUTION_DEDUPE_LLM_TEXT : RSC.RUNS_EXECUTION_DEDUPE_NAME_TEXT], false);
  }
  if (plan.mode === "reevaluate") {
    add("maxrounds", t[RSC.RUNS_EXECUTION_MAXROUNDS_LABEL], reevaluate.maxRounds, true);
    add("passscore", t[RSC.RUNS_EXECUTION_PASSSCORE_LABEL], reevaluate.passScore, true);
    add("maxmissing", t[RSC.RUNS_EXECUTION_MAXMISSING_LABEL], reevaluate.maxMissing, false);
    add("maxnew", t[RSC.RUNS_EXECUTION_MAXNEW_LABEL], reevaluate.maxNewItems, false);
  }
  if (writer) {
    const mode = writer.mode === null ? "" : ` (${t[writer.mode === "batch" ? RSC.RUNS_EXECUTION_WRITERMODE_BATCH_TEXT : RSC.RUNS_EXECUTION_WRITERMODE_PERPAIR_TEXT]})`;
    add("writer", t[RSC.RUNS_EXECUTION_WRITER_LABEL], `${writer.name}${mode}`, true);
  }
  return rows;
}

/**
 * 「실행 계획」: 이 질의를 어떤 모드와 한도로 수행했는지. 모드 배지와 핵심 한도 배지를 한 줄로 보이고,
 * 펼치면 모드 설명과 쓴 한도 전체(표)가 나온다. 데이터는 실행 로그 스냅샷(settings.plan · settings.writer)이며,
 * 옛 실행은 계획 기록의 모드만(그것도 없으면 기본 classic)으로 보이고 한도는 「기록 없음」이다.
 */
export function RunExecutionPlan({ settings, tracedMode, t }: Props) {
  const plan = readExecutionPlan(settings, tracedMode);
  const rows = rowsOf(plan, t);
  return (
    <section aria-labelledby="run-execution-heading" data-testid="run-execution-plan" data-mode={plan.mode} className="grid gap-1 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <h3 id="run-execution-heading" className="text-muted">{t[RSC.RUNS_EXECUTION_HEADING_TEXT]}</h3>
        <span data-testid="run-execution-mode" className="rounded border border-accent px-2 py-0.5 text-accent">{planModeText(plan.mode, t)}</span>
        {rows.filter((row) => row.badge).map((row) => (
          <span key={row.key} data-testid={`run-execution-badge-${row.key}`} className="rounded border border-line px-2 py-0.5">
            <span className="text-muted">{row.label}: </span>{row.value}
          </span>
        ))}
      </div>
      <details data-testid="run-execution-details">
        <summary className="cursor-pointer text-muted">{t[RSC.RUNS_EXECUTION_LIMITS_BUTTON]}</summary>
        <p data-testid="run-execution-mode-message" className="mt-1 text-muted">{planModeMessage(plan.mode, t)}</p>
        {plan.mode !== "classic" && !plan.hasLimits && <p data-testid="run-execution-nolimits" className="mt-1 text-muted">{t[RSC.RUNS_EXECUTION_NOLIMITS_MESSAGE]}</p>}
        {rows.length > 0 && (
          <table data-testid="run-execution-limits" aria-label={t[RSC.RUNS_EXECUTION_LIMITS_LABEL]} className="mt-2 border-collapse text-start">
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} data-testid={`run-execution-row-${row.key}`}>
                  <th scope="row" className={cn("border border-line px-2 py-1 text-start font-normal text-muted")}>{row.label}</th>
                  <td className="border border-line px-2 py-1">{row.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </details>
    </section>
  );
}
