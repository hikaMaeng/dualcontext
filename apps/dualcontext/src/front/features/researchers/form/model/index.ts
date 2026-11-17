import type { Researcher, ResearcherType, StageConfig } from "dualcontext_domain/common";
import { splitList } from "../../../../lib/api";
import { blankCrawler, toCrawlerConfig, toCrawlerForm, type CrawlerForm } from "../../crawler/index";

export type Form = {
  id: number | null;
  name: string;
  description: string;
  keywords: string;
  enabled: boolean;
  type: ResearcherType;
  procedureIds: number[];
  /** 기본 프로시저 id(문자열, 빈 문자열 = 없음). 연결된 프로시저 안에서만 고른다. */
  defaultProcedureId: string;
  topK: string;
  table: string;
  vectorColumn: string;
  reducedColumn: string;
  reducedDim: string;
  textColumn: string;
  titleColumn: string;
  path: string;
  /** 코드베이스 조사원: 출처(git 클론 | 볼륨 폴더), 레포 URL · ref · 하위 경로 · 토큰 환경 변수 이름 · 갱신 주기. 상한 설정은 화면에 없어 저장할 때 그대로 되돌려 보낸다. */
  cbSource: "git" | "directory";
  cbUrl: string;
  cbRef: string;
  cbSubPath: string;
  cbTokenEnv: string;
  cbRefresh: string;
  cbProjects: boolean;
  cbLimits: Record<string, unknown>;
  crawler: CrawlerForm;
  /** 개별 라우터. null 이면 전역 라우터가 고른다. */
  router: StageConfig | null;
};

export const blank: Form = {
  id: null, name: "", description: "", keywords: "", enabled: true, type: "pgvector", procedureIds: [], defaultProcedureId: "", topK: "3",
  table: "", vectorColumn: "embedding", reducedColumn: "", reducedDim: "", textColumn: "body", titleColumn: "title", path: "", cbSource: "git", cbUrl: "", cbRef: "", cbSubPath: "", cbTokenEnv: "", cbRefresh: "24", cbProjects: false, cbLimits: {}, crawler: blankCrawler, router: null
};

export function toForm(item: Researcher): Form {
  const c = item.config as Record<string, string | number | undefined>;
  return {
    id: item.id, name: item.name, description: item.description, keywords: item.keywords.join(", "), enabled: item.enabled,
    type: item.type, procedureIds: item.procedureIds, defaultProcedureId: item.defaultProcedureId == null ? "" : String(item.defaultProcedureId), topK: String(c.topK ?? 3),
    table: String(c.table ?? ""), vectorColumn: String(c.vectorColumn ?? ""), reducedColumn: String(c.reducedColumn ?? ""),
    reducedDim: String(c.reducedDim ?? ""), textColumn: String(c.textColumn ?? ""), titleColumn: String(c.titleColumn ?? ""), path: String(c.path ?? ""), router: item.router ?? null,
    cbSource: c.source === "directory" ? "directory" : "git", cbUrl: String(c.url ?? ""), cbRef: String(c.ref ?? ""), cbSubPath: String(c.subPath ?? ""),
    cbTokenEnv: String(c.tokenEnv ?? ""), cbRefresh: String(c.refreshHours ?? 24), cbProjects: Boolean(c.projects),
    cbLimits: Object.fromEntries(["maxFiles", "maxRepoMB", "maxIndexSeconds"].filter((key) => c[key] !== undefined).map((key) => [key, c[key]])),
    crawler: toCrawlerForm(item.config)
  };
}

export function toBody(form: Form) {
  const config =
    form.type === "duckduckgo"
      ? { topK: Number(form.topK) }
      : form.type === "folder"
        ? { path: form.path, topK: Number(form.topK) }
        : form.type === "codebase"
          ? {
              ...form.cbLimits, source: form.cbSource, topK: Number(form.topK), refreshHours: Number(form.cbRefresh),
              ...(form.cbSource === "git"
                ? { url: form.cbUrl, ...(form.cbRef ? { ref: form.cbRef } : {}), ...(form.cbSubPath ? { subPath: form.cbSubPath } : {}), ...(form.cbTokenEnv ? { tokenEnv: form.cbTokenEnv } : {}) }
                : { path: form.path, ...(form.cbProjects ? { projects: true } : {}) })
            }
          : form.type === "crawler"
            ? toCrawlerConfig(form.crawler, Number(form.topK))
            : {
            table: form.table, vectorColumn: form.vectorColumn, textColumn: form.textColumn, topK: Number(form.topK),
            ...(form.titleColumn ? { titleColumn: form.titleColumn } : {}),
            ...(form.reducedColumn ? { reducedColumn: form.reducedColumn, reducedDim: Number(form.reducedDim) } : {})
          };
  return {
    name: form.name, description: form.description, keywords: splitList(form.keywords, /,/), enabled: form.enabled,
    type: form.type, config, procedureIds: form.procedureIds, defaultProcedureId: form.defaultProcedureId === "" || !form.procedureIds.includes(Number(form.defaultProcedureId)) ? null : Number(form.defaultProcedureId), router: form.router
  };
}
