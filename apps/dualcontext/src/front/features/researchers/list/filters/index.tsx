import { Button } from "../../../../components/ui/button";
import { Input, Select } from "../../../../components/ui/input";
import { Field } from "../../../../components/layout";
import type { Procedure, ResearcherType } from "dualcontext_domain/common";
import type { Texts } from "../../../../i18n";
import { RSC as PARENT } from "../../resource";
import { changeFilter, initialQuery, isFiltering, type DefaultFilter, type EnabledFilter, type ResearcherQuery, type RouterFilter, type SortKey } from "../../query";
import { RSC } from "./resource";

type Props = { query: ResearcherQuery; procedures: Procedure[]; onQuery: (query: ResearcherQuery) => void; t: Texts };

const types: { value: ResearcherType; label: PARENT }[] = [
  { value: "pgvector", label: PARENT.RESEARCHERS_TYPE_PGVECTOR_TEXT },
  { value: "duckduckgo", label: PARENT.RESEARCHERS_TYPE_DUCKDUCKGO_TEXT },
  { value: "folder", label: PARENT.RESEARCHERS_TYPE_FOLDER_TEXT },
  { value: "codebase", label: PARENT.RESEARCHERS_TYPE_CODEBASE_TEXT },
  { value: "crawler", label: PARENT.RESEARCHERS_TYPE_CRAWLER_TEXT }
];

/**
 * 목록 상단의 검색 폼 묶음: 검색어 · 유형 · 사용 여부 · 연결된 프로시저 · 기본 프로시저 · 개별 라우터 · 정렬.
 * 조건은 서로 AND 이고 어떤 변경이든 1쪽으로 돌아간다(정렬 포함). 조건이 걸려 있을 때만 「조건 지우기」가 나온다.
 */
export function FilterBar({ query, procedures, onQuery, t }: Props) {
  const change = (patch: Partial<Omit<ResearcherQuery, "page">>) => onQuery(changeFilter(query, patch));
  return (
    <section aria-label={t[RSC.RESEARCHERS_FILTERS_LABEL]} data-testid="researcher-filters" className="grid gap-3 rounded-md border border-line p-3">
      <p className="text-xs text-muted">{t[RSC.RESEARCHERS_FILTERS_HINT_MESSAGE]}</p>
      <Field label={t[RSC.RESEARCHERS_FILTERS_Q_LABEL]}>
        <Input type="search" data-testid="researcher-filter-q" value={query.q} onChange={(event) => change({ q: event.target.value })} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label={t[RSC.RESEARCHERS_FILTERS_TYPE_LABEL]}>
          <Select data-testid="researcher-filter-type" value={query.type} onChange={(event) => change({ type: event.target.value as "" | ResearcherType })}>
            <option value="">{t[RSC.RESEARCHERS_FILTERS_TYPE_ALL_TEXT]}</option>
            {types.map((entry) => <option key={entry.value} value={entry.value}>{t[entry.label]}</option>)}
          </Select>
        </Field>
        <Field label={t[RSC.RESEARCHERS_FILTERS_ENABLED_LABEL]}>
          <Select data-testid="researcher-filter-enabled" value={query.enabled} onChange={(event) => change({ enabled: event.target.value as EnabledFilter })}>
            <option value="">{t[RSC.RESEARCHERS_FILTERS_ENABLED_ALL_TEXT]}</option>
            <option value="on">{t[RSC.RESEARCHERS_FILTERS_ENABLED_ON_TEXT]}</option>
            <option value="off">{t[RSC.RESEARCHERS_FILTERS_ENABLED_OFF_TEXT]}</option>
          </Select>
        </Field>
        <Field label={t[RSC.RESEARCHERS_FILTERS_PROCEDURE_LABEL]}>
          <Select data-testid="researcher-filter-procedure" value={query.procedure} onChange={(event) => change({ procedure: event.target.value })}>
            <option value="">{t[RSC.RESEARCHERS_FILTERS_PROCEDURE_ALL_TEXT]}</option>
            <option value="none">{t[RSC.RESEARCHERS_FILTERS_PROCEDURE_NONE_TEXT]}</option>
            {procedures.map((procedure) => <option key={procedure.id} value={String(procedure.id)}>{procedure.name}</option>)}
          </Select>
        </Field>
        <Field label={t[RSC.RESEARCHERS_FILTERS_DEFAULT_LABEL]}>
          <Select data-testid="researcher-filter-default" value={query.defaultProcedure} onChange={(event) => change({ defaultProcedure: event.target.value as DefaultFilter })}>
            <option value="">{t[RSC.RESEARCHERS_FILTERS_DEFAULT_ALL_TEXT]}</option>
            <option value="has">{t[RSC.RESEARCHERS_FILTERS_DEFAULT_HAS_TEXT]}</option>
            <option value="none">{t[RSC.RESEARCHERS_FILTERS_DEFAULT_NONE_TEXT]}</option>
          </Select>
        </Field>
        <Field label={t[RSC.RESEARCHERS_FILTERS_ROUTER_LABEL]}>
          <Select data-testid="researcher-filter-router" value={query.router} onChange={(event) => change({ router: event.target.value as RouterFilter })}>
            <option value="">{t[RSC.RESEARCHERS_FILTERS_ROUTER_ALL_TEXT]}</option>
            <option value="own">{t[RSC.RESEARCHERS_FILTERS_ROUTER_OWN_TEXT]}</option>
            <option value="global">{t[RSC.RESEARCHERS_FILTERS_ROUTER_GLOBAL_TEXT]}</option>
          </Select>
        </Field>
        <Field label={t[RSC.RESEARCHERS_FILTERS_SORT_LABEL]}>
          <Select data-testid="researcher-filter-sort" value={query.sort} onChange={(event) => change({ sort: event.target.value as SortKey })}>
            <option value="id">{t[RSC.RESEARCHERS_FILTERS_SORT_ID_TEXT]}</option>
            <option value="name">{t[RSC.RESEARCHERS_FILTERS_SORT_NAME_TEXT]}</option>
          </Select>
        </Field>
      </div>
      {isFiltering(query) && (
        <Button variant="outline" size="sm" className="justify-self-start" data-testid="researcher-filter-clear" onClick={() => onQuery({ ...initialQuery, sort: query.sort })}>
          {t[RSC.RESEARCHERS_FILTERS_CLEAR_BUTTON]}
        </Button>
      )}
    </section>
  );
}
