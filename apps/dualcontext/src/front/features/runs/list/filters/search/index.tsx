import { useEffect, useState, type FormEvent } from "react";
import { Field } from "../../../../../components/layout";
import { Input, Select } from "../../../../../components/ui/input";
import type { Texts } from "../../../../../i18n";
import type { SearchMode } from "../../../query";
import { RSC } from "./resource";

const debounceMs = 350;

type Props = { q: string; mode: SearchMode; onQuery: (q: string) => void; onMode: (mode: SearchMode) => void; t: Texts };

/**
 * 검색어 입력(디바운스 후 반영, Enter 는 즉시)과 검색 방식(키워드 / 의미). 입력 중인 글자는 이 컴포넌트가 들고 있고
 * 목록 조건에는 확정된 검색어만 올린다. 뷰를 다녀오면 확정된 검색어로 다시 채운다.
 */
export function SearchBox({ q, mode, onQuery, onMode, t }: Props) {
  const [draft, setDraft] = useState(q);

  useEffect(() => {
    if (draft === q) return;
    const timer = window.setTimeout(() => onQuery(draft), debounceMs);
    return () => window.clearTimeout(timer);
  }, [draft, q, onQuery]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (draft !== q) onQuery(draft);
  };

  return (
    <form role="search" aria-label={t[RSC.RUNS_SEARCH_FORM_LABEL]} onSubmit={submit} className="grid gap-3 sm:grid-cols-[1fr_12rem]">
      <Field label={t[RSC.RUNS_SEARCH_QUERY_LABEL]}>
        <Input type="search" value={draft} data-testid="run-search-input" onChange={(event) => setDraft(event.target.value)} />
      </Field>
      <Field label={t[RSC.RUNS_SEARCH_MODE_LABEL]}>
        <Select value={mode} data-testid="run-search-mode" onChange={(event) => onMode(event.target.value as SearchMode)}>
          <option value="keyword">{t[RSC.RUNS_SEARCH_MODE_KEYWORD_TEXT]}</option>
          <option value="semantic">{t[RSC.RUNS_SEARCH_MODE_SEMANTIC_TEXT]}</option>
        </Select>
      </Field>
    </form>
  );
}
