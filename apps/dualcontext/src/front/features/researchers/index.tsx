import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import type { Texts } from "../../i18n";
import { RSC as SHARED } from "../../resource";
import { ResearcherForm } from "./form";
import { RSC as FORM } from "./form/resource";
import { ResearcherList } from "./list";
import { initialQuery, type ResearcherQuery } from "./query";
import { RSC } from "./resource";
import { LIST_HASH, viewHash } from "./route";
import { useResearchersRoute } from "./route/use-researchers-route";
import { useResearchers } from "./use-researchers";

/**
 * 조사원. 목록(`#researchers`)과 뷰(`#researchers/<id>`, 새로 만들기는 `#researchers/new`)는 분리된 화면이고 해시로 오가므로 브라우저 뒤로가기가 동작한다.
 * 검색 · 정렬 · 쪽은 이 컴포넌트가 들고 있어, 뷰에서 「목록으로」 돌아와도 직전 상태 그대로다.
 * 새로 저장하면 그 조사원의 뷰로 옮기고(주소가 id 를 가진다), 삭제하면 목록으로 돌아간다.
 */
export function ResearchersView({ t }: { t: Texts }) {
  const route = useResearchersRoute();
  const data = useResearchers();
  const [query, setQuery] = useState<ResearcherQuery>(initialQuery);
  const current = route.kind === "view" ? data.items.find((item) => item.id === route.id) ?? null : null;

  return (
    <section aria-labelledby="page-title" className="grid gap-4">
      <h1 id="page-title" className="text-2xl font-semibold">{t[RSC.RESEARCHERS_TITLE_TEXT]}</h1>
      {data.failed && <p role="alert" className="text-sm text-danger">{t[SHARED.COMMON_ERROR_ALERT]}</p>}
      {route.kind === "list" ? (
        data.loaded ? (
          <ResearcherList items={data.items} procedures={data.procedures} query={query} onQuery={setQuery} t={t} />
        ) : (
          <p role="status" className="text-sm text-muted">{t[FORM.RESEARCHERS_VIEW_LOADING_STATUS]}</p>
        )
      ) : (
        <div className="grid gap-4">
          <a href={LIST_HASH} data-testid="researcher-back" className="inline-flex items-center gap-1 justify-self-start text-sm text-accent underline">
            <ArrowLeft aria-hidden="true" className="h-4 w-4 rtl:rotate-180" />
            {t[FORM.RESEARCHERS_VIEW_BACK_BUTTON]}
          </a>
          {!data.loaded && <p role="status" className="text-sm text-muted">{t[FORM.RESEARCHERS_VIEW_LOADING_STATUS]}</p>}
          {data.loaded && route.kind === "view" && current === null && (
            <p role="status" data-testid="researcher-notfound" className="text-sm text-muted">{t[FORM.RESEARCHERS_VIEW_NOTFOUND_MESSAGE]}</p>
          )}
          {data.loaded && (route.kind === "new" || current !== null) && (
            <article aria-labelledby="researcher-heading" data-testid="researcher-view" className="grid max-w-4xl gap-4">
              <h2 id="researcher-heading" className="text-lg font-semibold">{current ? current.name : t[FORM.RESEARCHERS_VIEW_NEW_HEADING_TEXT]}</h2>
              <ResearcherForm
                key={current ? current.id : "new"}
                item={current}
                procedures={data.procedures}
                individualPrompt={data.individualPrompt}
                t={t}
                onSaved={(saved) => {
                  void data.reload();
                  if (route.kind === "new") window.location.hash = viewHash(saved.id);
                }}
                onDeleted={() => {
                  void data.reload();
                  window.location.hash = LIST_HASH;
                }}
              />
            </article>
          )}
        </div>
      )}
    </section>
  );
}
