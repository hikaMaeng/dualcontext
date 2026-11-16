import { useCallback } from "react";
import { Button } from "../../../../components/ui/button";
import type { RunFilterOptions } from "../../api/types";
import type { Texts } from "../../../../i18n";
import { changeFilter, type ListQuery } from "../../query";
import { MultiSelect } from "./multi";
import { SearchBox } from "./search";
import { RSC } from "./resource";

type Props = { query: ListQuery; options: RunFilterOptions; onQuery: (query: ListQuery) => void; t: Texts };

/**
 * 목록 상단의 필터 묶음: 조사원 · 프로시저 멀티 셀렉트와 검색. 어떤 변경이든 1쪽으로 돌아간다.
 * 조사원과 프로시저 선택은 서로 OR, 검색어와는 AND 라는 점을 안내 문구로 밝힌다.
 */
export function FilterBar({ query, options, onQuery, t }: Props) {
  const setQ = useCallback((q: string) => onQuery(changeFilter(query, { q })), [onQuery, query]);
  const none = query.researchers.length === 0 && query.procedures.length === 0;
  return (
    <section aria-label={t[RSC.RUNS_FILTERS_LABEL]} data-testid="run-filters" className="grid gap-3 rounded-md border border-line p-3">
      <p id="run-filters-hint" data-testid="run-filters-hint" className="text-xs text-muted">{t[RSC.RUNS_FILTERS_HINT_MESSAGE]}</p>
      <div aria-describedby="run-filters-hint" className="grid gap-3 sm:grid-cols-2">
        <MultiSelect label={t[RSC.RUNS_FILTERS_RESEARCHERS_LABEL]} options={options.researchers} selected={query.researchers} testId="run-filter-researchers" t={t} onChange={(researchers) => onQuery(changeFilter(query, { researchers }))} />
        <MultiSelect label={t[RSC.RUNS_FILTERS_PROCEDURES_LABEL]} options={options.procedures} selected={query.procedures} testId="run-filter-procedures" t={t} onChange={(procedures) => onQuery(changeFilter(query, { procedures }))} />
      </div>
      {!none && (
        <Button variant="outline" size="sm" className="justify-self-start" data-testid="run-filter-clear" onClick={() => onQuery(changeFilter(query, { researchers: [], procedures: [] }))}>
          {t[RSC.RUNS_FILTERS_CLEAR_BUTTON]}
        </Button>
      )}
      <SearchBox q={query.q} mode={query.mode} onQuery={setQ} onMode={(mode) => onQuery(changeFilter(query, { mode }))} t={t} />
    </section>
  );
}
