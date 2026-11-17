import type { Researcher } from "dualcontext_domain/common";

/** 목록 둘째 줄에 보일 「어디서 가져오나」. kind 마다 문구 키가 따로 있다(값은 표시하는 쪽이 붙인다). */
export type SourceKind = "table" | "folder" | "git" | "directory" | "crawler" | "web";
export type SourceSummary = { kind: SourceKind; value: string };

const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

/**
 * 조사원의 출처 한 줄 요약. 설정이 비었거나 모양이 달라도 던지지 않고 값을 빈 문자열로 둔다.
 * pgvector 는 테이블, folder · codebase(directory)는 경로, codebase(git)는 URL, crawler 는 첫 시작 URL(+나머지 개수), duckduckgo 는 값 없음.
 */
export function summarizeSource(item: Pick<Researcher, "type" | "config">): SourceSummary {
  const config = (item.config ?? {}) as Record<string, unknown>;
  switch (item.type) {
    case "pgvector":
      return { kind: "table", value: text(config.table) };
    case "folder":
      return { kind: "folder", value: text(config.path) };
    case "codebase":
      return config.source === "directory" ? { kind: "directory", value: text(config.path) } : { kind: "git", value: text(config.url) };
    case "crawler": {
      const urls = Array.isArray(config.startUrls) ? config.startUrls.map(text).filter((url) => url !== "") : [];
      return { kind: "crawler", value: urls.length === 0 ? "" : urls.length === 1 ? urls[0] : `${urls[0]} +${urls.length - 1}` };
    }
    default:
      return { kind: "web", value: "" };
  }
}
