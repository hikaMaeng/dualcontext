export const defaultPageSize = 20;
export const maxPageSize = 100;
/** 필터 한 종류에 받는 이름 수와 이름·검색어 길이의 상한. 파라미터 폭주와 거대한 질의를 막는다. */
const maxNames = 50;
const maxNameLength = 200;
const maxQueryLength = 500;

export type ListParams = {
  page: number;
  pageSize: number;
  researchers: string[];
  procedures: string[];
  /** 빈 문자열이면 검색하지 않는다. */
  q: string;
  mode: "keyword" | "semantic";
};

export type ParseResult = { ok: true; params: ListParams } | { ok: false; error: string };

type Raw = Record<string, unknown>;

/** 같은 키가 여러 번 오면 배열, 한 번이면 문자열로 들어온다(Express 5 기본 쿼리 파서). 문자열 목록만 받는다. */
function strings(raw: unknown): string[] | null {
  if (raw === undefined) return [];
  const list = Array.isArray(raw) ? raw : [raw];
  return list.every((value) => typeof value === "string") ? (list as string[]) : null;
}

function integer(raw: unknown, fallback: number): number | null {
  if (raw === undefined || raw === "") return fallback;
  if (typeof raw !== "string" || !/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) ? value : null;
}

/** 쿼리 문자열을 목록 조건으로 바꾼다. 잘못된 값은 ok:false 와 이유를 돌려준다(400 으로 이어진다). */
export function parseListParams(query: Raw): ParseResult {
  const page = integer(query.page, 1);
  if (page === null || page < 1) return { ok: false, error: "page must be an integer >= 1" };
  const pageSize = integer(query.pageSize, defaultPageSize);
  if (pageSize === null || pageSize < 1 || pageSize > maxPageSize) return { ok: false, error: `pageSize must be an integer between 1 and ${maxPageSize}` };

  const researchers = strings(query.researcher);
  const procedures = strings(query.procedure);
  if (researchers === null || procedures === null) return { ok: false, error: "researcher and procedure must be strings" };
  if (researchers.length > maxNames || procedures.length > maxNames || [...researchers, ...procedures].some((name) => name.length === 0 || name.length > maxNameLength)) {
    return { ok: false, error: `researcher/procedure: at most ${maxNames} non-empty names of up to ${maxNameLength} characters each` };
  }

  if (query.q !== undefined && typeof query.q !== "string") return { ok: false, error: "q must be a single string" };
  const q = (query.q ?? "").trim();
  if (q.length > maxQueryLength) return { ok: false, error: `q must be at most ${maxQueryLength} characters` };

  if (query.mode !== undefined && query.mode !== "keyword" && query.mode !== "semantic") return { ok: false, error: "mode must be keyword or semantic" };
  return { ok: true, params: { page, pageSize, researchers: [...new Set(researchers)], procedures: [...new Set(procedures)], q, mode: query.mode ?? "keyword" } };
}
