import type { Procedure, Researcher } from "dualcontext_domain/common";
import type { Texts } from "../../../../i18n";
import { RSC as PARENT } from "../../resource";
import { viewHash } from "../../route";
import { summarizeSource, type SourceKind } from "../../summary";
import { RSC } from "./resource";

const sourceLabel: Record<SourceKind, RSC> = {
  table: RSC.RESEARCHERS_ITEM_SOURCE_TABLE_LABEL,
  folder: RSC.RESEARCHERS_ITEM_SOURCE_FOLDER_LABEL,
  git: RSC.RESEARCHERS_ITEM_SOURCE_GIT_LABEL,
  directory: RSC.RESEARCHERS_ITEM_SOURCE_DIRECTORY_LABEL,
  crawler: RSC.RESEARCHERS_ITEM_SOURCE_CRAWLER_LABEL,
  web: RSC.RESEARCHERS_ITEM_SOURCE_WEB_LABEL
};
const typeLabel: Record<Researcher["type"], PARENT> = {
  pgvector: PARENT.RESEARCHERS_TYPE_PGVECTOR_TEXT,
  duckduckgo: PARENT.RESEARCHERS_TYPE_DUCKDUCKGO_TEXT,
  folder: PARENT.RESEARCHERS_TYPE_FOLDER_TEXT,
  codebase: PARENT.RESEARCHERS_TYPE_CODEBASE_TEXT,
  crawler: PARENT.RESEARCHERS_TYPE_CRAWLER_TEXT
};

type Props = { item: Researcher; procedures: Procedure[]; selected?: boolean; t: Texts };

/**
 * 조사원 2줄 항목(링크). 1줄은 `이름 | 유형`(+ 비활성 · 개별 라우터 표시), 2줄은 `출처 · 연결된 프로시저 수 · 기본 프로시저 · 키워드`다.
 * 두 줄 모두 줄바꿈 없이 한 줄로 자르고 엘립시스로 줄이며, 전체 내용은 title 과 접근 가능한 이름으로 남는다.
 */
export function ResearcherItem({ item, procedures, selected, t }: Props) {
  const source = summarizeSource(item);
  const defaultName = procedures.find((procedure) => procedure.id === item.defaultProcedureId)?.name;
  const parts = [
    source.value === "" ? t[sourceLabel[source.kind]] : `${t[sourceLabel[source.kind]]}: ${source.value}`,
    `${t[RSC.RESEARCHERS_ITEM_PROCEDURES_LABEL]} ${item.procedureIds.length}`,
    ...(defaultName ? [`${t[PARENT.RESEARCHERS_DEFAULT_PROCEDURE_LABEL]}: ${defaultName}`] : []),
    ...(item.keywords.length > 0 ? [`${t[RSC.RESEARCHERS_ITEM_KEYWORDS_LABEL]}: ${item.keywords.join(", ")}`] : [])
  ];
  const detail = parts.join(" · ");
  return (
    <li>
      <a
        href={viewHash(item.id)}
        data-testid="researcher-item"
        data-researcher-id={item.id}
        data-enabled={String(item.enabled)}
        aria-current={selected ? "page" : undefined}
        className="grid min-w-0 gap-0.5 rounded-md border border-line px-3 py-2 hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <span className="flex min-w-0 items-baseline gap-2 text-sm">
          <span data-testid="researcher-item-name" title={item.name} className="min-w-0 flex-1 truncate whitespace-nowrap font-medium">{item.name}</span>
          {item.router && <span data-testid="researcher-item-router" className="shrink-0 rounded border border-accent px-1.5 text-xs text-accent">{t[RSC.RESEARCHERS_ITEM_ROUTER_TEXT]}</span>}
          {!item.enabled && <span data-testid="researcher-item-disabled" className="shrink-0 rounded border border-danger px-1.5 text-xs text-danger">{t[RSC.RESEARCHERS_ITEM_DISABLED_TEXT]}</span>}
          <span data-testid="researcher-item-type" className="shrink-0 text-xs text-muted">{t[typeLabel[item.type]]}</span>
        </span>
        <span data-testid="researcher-item-detail" title={detail} className="block min-w-0 truncate whitespace-nowrap text-xs text-muted">{detail}</span>
      </a>
    </li>
  );
}
