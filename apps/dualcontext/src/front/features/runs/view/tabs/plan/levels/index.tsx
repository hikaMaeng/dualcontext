import { Fragment } from "react";
import type { PlanItem, PlanTrace } from "dualcontext_domain/common";
import type { Texts } from "../../../../../../i18n";
import { itemName } from "../model";
import { RSC } from "./resource";

/**
 * 의존성 분석 단계별 로그 표: 분석한 아이템 수, 찾은 후보 수, 중복 정리 뒤 새로 만든 수, 기존 아이템에 연결한 수.
 * 사전 요구 분석 호출이 실패한 아이템이 있는 단계는 바로 아래 줄에 「사전 요구 분석 실패: n」을 두고, 펼치면 아이템과 오류가 보인다
 * (그 아이템은 사전 요구가 없는 것으로 진행됐다). failed 의 item 이 아이템 id 와 맞으면 이름으로, 아니면 받은 그대로 보인다.
 */
export function PlanLevels({ levels, items, t }: { levels: PlanTrace["levels"]; items: PlanItem[]; t: Texts }) {
  return (
    <section aria-labelledby="plan-levels-heading" className="grid gap-1">
      <h3 id="plan-levels-heading" className="text-sm font-semibold text-muted">{t[RSC.RUNS_PLAN_LEVELS_HEADING_TEXT]}</h3>
      {levels.length === 0 ? (
        <p data-testid="plan-levels-empty" className="text-sm text-muted">{t[RSC.RUNS_PLAN_LEVELS_EMPTY_MESSAGE]}</p>
      ) : (
        <div className="overflow-auto">
          <table data-testid="plan-levels" aria-labelledby="plan-levels-heading" className="w-full border-collapse text-start text-sm">
            <thead>
              <tr className="text-muted">
                <th scope="col" className="border border-line px-2 py-1 text-start font-medium">{t[RSC.RUNS_PLAN_LEVELS_LEVEL_LABEL]}</th>
                <th scope="col" className="border border-line px-2 py-1 text-start font-medium">{t[RSC.RUNS_PLAN_LEVELS_ANALYZED_LABEL]}</th>
                <th scope="col" className="border border-line px-2 py-1 text-start font-medium">{t[RSC.RUNS_PLAN_LEVELS_CANDIDATES_LABEL]}</th>
                <th scope="col" className="border border-line px-2 py-1 text-start font-medium">{t[RSC.RUNS_PLAN_LEVELS_CREATED_LABEL]}</th>
                <th scope="col" className="border border-line px-2 py-1 text-start font-medium">{t[RSC.RUNS_PLAN_LEVELS_LINKED_LABEL]}</th>
              </tr>
            </thead>
            <tbody>
              {levels.map((row) => (
                <Fragment key={row.level}>
                <tr data-testid="plan-level-row" data-level={row.level} data-failed={row.failed?.length ?? 0}>
                  <td className="border border-line px-2 py-1">{row.level}</td>
                  <td className="border border-line px-2 py-1">{row.analyzed}</td>
                  <td className="border border-line px-2 py-1">{row.candidates}</td>
                  <td className="border border-line px-2 py-1">{row.created}</td>
                  <td className="border border-line px-2 py-1">{row.linked}</td>
                </tr>
                {row.failed && row.failed.length > 0 && (
                  <tr>
                    <td colSpan={5} className="border border-line px-2 py-1">
                      <details data-testid="plan-level-failed" data-level={row.level}>
                        <summary className="cursor-pointer text-danger">{t[RSC.RUNS_PLAN_LEVELS_FAILED_TEXT]}: {row.failed.length}</summary>
                        <ul className="mt-1 grid gap-0.5">
                          {row.failed.map((failure, index) => (
                            <li key={index}><strong className="text-fg">{itemName(items, failure.item)}</strong> <span className="text-danger">{failure.error}</span></li>
                          ))}
                        </ul>
                      </details>
                    </td>
                  </tr>
                )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
