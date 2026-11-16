import { useEffect } from "react";
import type { Texts } from "../../../i18n";
import { RSC as ROOT } from "../../../resource";
import { clampPage, type ListQuery } from "../query";
import { FilterBar } from "./filters";
import { useFilterOptions } from "./filters/use-filter-options";
import { RunItem } from "./item";
import { Pager } from "./pager";
import { RSC } from "./resource";
import { useRunList } from "./use-run-list";

type Props = { query: ListQuery; onQuery: (query: ListQuery) => void; t: Texts };

/**
 * 실행 로그 목록 화면: 필터 · 검색, 2줄 항목 목록(최근 순), 페이징.
 * 조회 조건은 부모가 들고 있어 뷰에 다녀와도 필터 · 검색 · 쪽이 그대로다.
 */
export function RunList({ query, onQuery, t }: Props) {
  const { data, failed, loading } = useRunList(query);
  const { options } = useFilterOptions();

  // 지워서 쪽이 줄어든 경우처럼 현재 쪽이 범위를 벗어나면 마지막 쪽으로 당긴다.
  useEffect(() => {
    if (!data || data.total === 0) return;
    const clamped = clampPage(query.page, data.total, data.pageSize);
    if (clamped !== query.page) onQuery({ ...query, page: clamped });
  }, [data, query, onQuery]);

  return (
    <div className="grid gap-4">
      <FilterBar query={query} options={options} onQuery={onQuery} t={t} />
      {failed && <p role="alert" className="text-sm text-danger">{t[ROOT.COMMON_ERROR_ALERT]}</p>}
      {data && (
        <p role="status" data-testid="run-total" className="text-sm text-muted">{t[RSC.RUNS_LIST_TOTAL_STATUS]}: {data.total}</p>
      )}
      {!data && loading && <p role="status" className="text-sm text-muted">{t[RSC.RUNS_LIST_LOADING_STATUS]}</p>}
      <ul aria-label={t[RSC.RUNS_LIST_LABEL]} aria-busy={loading} data-testid="run-list" className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2">
        {data?.items.map((item) => <RunItem key={item.id} item={item} t={t} />)}
      </ul>
      {data && data.items.length === 0 && <p role="status" data-testid="run-list-empty" className="text-sm text-muted">{t[RSC.RUNS_LIST_EMPTY_MESSAGE]}</p>}
      {data && <Pager page={query.page} total={data.total} pageSize={data.pageSize} onPage={(page) => onQuery({ ...query, page })} t={t} />}
    </div>
  );
}
