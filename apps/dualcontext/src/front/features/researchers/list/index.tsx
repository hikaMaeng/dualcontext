import { useEffect } from "react";
import type { Procedure, Researcher } from "dualcontext_domain/common";
import type { Texts } from "../../../i18n";
import { RSC as SHARED } from "../../../resource";
import { clampPage, filterResearchers, PAGE_SIZE, pageOf, type ResearcherQuery } from "../query";
import { NEW_HASH } from "../route";
import { FilterBar } from "./filters";
import { ResearcherItem } from "./item";
import { Pager } from "./pager";
import { RSC } from "./resource";

type Props = { items: Researcher[]; procedures: Procedure[]; query: ResearcherQuery; onQuery: (query: ResearcherQuery) => void; t: Texts };

/**
 * 조사원 목록 화면: 검색 폼, 「새로 만들기」, 2줄 항목 목록(정렬 적용), 페이징.
 * 조건은 부모가 들고 있어 뷰에 다녀와도 검색 · 쪽이 그대로다. 목록은 한 번에 읽어 온 전체에서 화면이 걸러 쪽을 나눈다.
 * 총 개수는 조건에 맞는 개수이고 전체 개수와 다르면 함께 보인다.
 */
export function ResearcherList({ items, procedures, query, onQuery, t }: Props) {
  const matched = filterResearchers(items, query);

  // 조건이나 삭제로 쪽이 줄어 현재 쪽이 범위를 벗어나면 마지막 쪽으로 당긴다.
  useEffect(() => {
    const clamped = clampPage(query.page, matched.length, PAGE_SIZE);
    if (clamped !== query.page) onQuery({ ...query, page: clamped });
  });

  return (
    <div className="grid gap-4">
      <FilterBar query={query} procedures={procedures} onQuery={onQuery} t={t} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p role="status" data-testid="researcher-total" className="text-sm text-muted">
          {t[RSC.RESEARCHERS_LIST_TOTAL_STATUS]}: {matched.length}{matched.length !== items.length ? ` / ${items.length}` : ""}
        </p>
        <a href={NEW_HASH} data-testid="researcher-new" className="inline-flex h-9 items-center rounded-md border border-line px-3 text-sm hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">{t[SHARED.COMMON_NEW_BUTTON]}</a>
      </div>
      <ul aria-label={t[RSC.RESEARCHERS_LIST_LABEL]} data-testid="researcher-list" className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2">
        {pageOf(matched, query.page, PAGE_SIZE).map((item) => <ResearcherItem key={item.id} item={item} procedures={procedures} t={t} />)}
      </ul>
      {matched.length === 0 && <p role="status" data-testid="researcher-list-empty" className="text-sm text-muted">{t[RSC.RESEARCHERS_LIST_EMPTY_MESSAGE]}</p>}
      <Pager page={query.page} total={matched.length} pageSize={PAGE_SIZE} onPage={(page) => onQuery({ ...query, page })} t={t} />
    </div>
  );
}
