import type { Texts } from "../../../../i18n";
import type { RunListItem } from "../../api/types";
import { formatWhen, joinNames } from "../../format";
import { RSC as SHARED } from "../../resource";
import { viewHash } from "../../route";
import { statusText } from "../../status";
import { RSC } from "./resource";

/**
 * 실행 로그 2줄 항목(링크). 1줄은 `일시 | 질의`(+ 작은 상태 표시), 2줄은 선택된 조사원들이다.
 * 두 줄 모두 줄바꿈 없이 한 줄로 자르고 엘립시스로 줄이며, 전체 내용은 title 과 접근 가능한 이름으로 남는다.
 */
export function RunItem({ item, t }: { item: RunListItem; t: Texts }) {
  const researchers = joinNames(item.researchers);
  return (
    <li>
      <a
        href={viewHash(item.id)}
        data-testid="run-item"
        data-run-id={item.id}
        data-status={item.status}
        className="grid min-w-0 gap-0.5 rounded-md border border-line px-3 py-2 hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <span className="flex min-w-0 items-baseline gap-2 text-sm">
          <time dateTime={item.createdAt} className="shrink-0 text-xs text-muted">{formatWhen(item.createdAt)}</time>
          <span aria-hidden="true" className="shrink-0 text-muted">{"|"}</span>
          <span data-testid="run-item-query" title={item.query} className="min-w-0 flex-1 truncate whitespace-nowrap">{item.query}</span>
          <span data-testid="run-item-status" className={item.status === "error" ? "shrink-0 text-xs text-danger" : "shrink-0 text-xs text-muted"}>{statusText(item.status, t)}</span>
        </span>
        <span className="flex min-w-0 gap-1 text-xs text-muted">
          <span className="sr-only">{t[SHARED.RUNS_RESEARCHERS_LABEL]}</span>
          <span data-testid="run-item-researchers" title={researchers} className="min-w-0 flex-1 truncate whitespace-nowrap">
            {researchers === "" ? t[RSC.RUNS_ITEM_NORESEARCHERS_TEXT] : researchers}
          </span>
        </span>
      </a>
    </li>
  );
}
