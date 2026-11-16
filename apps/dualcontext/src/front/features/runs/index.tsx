import { useState } from "react";
import type { Texts } from "../../i18n";
import { RunList } from "./list";
import { initialQuery, type ListQuery } from "./query";
import { RSC } from "./resource";
import { useRunsRoute } from "./route/use-runs-route";
import { RunView } from "./view";

/**
 * 실행 로그. 목록(`#runs`)과 뷰(`#runs/<id>`)는 분리된 화면이고 해시로 오가므로 브라우저 뒤로가기가 동작한다.
 * 목록 조회 조건(필터 · 검색 · 쪽)은 이 컴포넌트가 들고 있어, 뷰에서 「목록으로」 돌아와도 직전 상태 그대로다.
 */
export function RunsView({ t }: { t: Texts }) {
  const route = useRunsRoute();
  const [query, setQuery] = useState<ListQuery>(initialQuery);

  return (
    <section aria-labelledby="page-title" className="grid gap-4">
      <h1 id="page-title" className="text-2xl font-semibold">{t[RSC.RUNS_TITLE_TEXT]}</h1>
      {route.kind === "view" ? <RunView key={route.id} id={route.id} t={t} /> : <RunList query={query} onQuery={setQuery} t={t} />}
    </section>
  );
}
