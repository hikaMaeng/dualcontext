import { z } from "zod";
import type { ItemDraft, PlanEvaluation } from "dualcontext_domain/common";

/**
 * 계획기 모델 응답 해석. 모델은 JSON 만 내라고 지시받지만 코드펜스 · 앞뒤 잡설 · 추론 문장을 붙이기도 한다.
 * 그래서 `{` 또는 `[` 마다 괄호가 균형 잡힌 구간을 차례로 시도하고, **파서가 기대하는 최상위 모양을 갖춘 첫 후보**를 쓴다
 * (문자열 안의 괄호는 세지 않는다). 「Consider [1,2] first. Final JSON: {"items":[…]}」 에서 [1,2] 를 집지 않기 위해서다.
 * 아이템 목록(analyze · prerequisites)은 항목 단위로 검증해 잘못된 항목만 버린다. 평가 응답은 통과 판정에 쓰이므로 엄격하다:
 * score · missing 배열이 없거나 missing 항목이 하나라도 틀리면 던진다(플래너가 evaluation-failed 로 멈춘다).
 * 기대 모양의 후보가 없으면 던진다(플래너가 격리한다). see docs/internals.md#컨텍스트-계획기-결정
 */

/** 이름 · 설명 · 이유 길이 상한(문자). 넘으면 자른다: 긴 글이 다음 프롬프트와 실행 로그를 불리지 않게. */
export const limits = Object.freeze({ name: 80, description: 600, reason: 400, items: 40, missing: 100 });

export class PlanParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlanParseError";
  }
}

/** text 에서 index 의 여는 괄호와 짝이 맞는 닫는 괄호까지의 구간. 짝이 없으면 null. */
function balanced(text: string, start: number): string | null {
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "{" || char === "[") stack.push(char === "{" ? "}" : "]");
    else if (char === "}" || char === "]") {
      if (stack.pop() !== char) return null;
      if (stack.length === 0) return text.slice(start, index + 1);
    }
  }
  return null;
}

/**
 * 응답에서 JSON 값 하나를 꺼낸다. 후보(균형 잡힌 구간)를 앞에서부터 해석해 accept 를 통과한 첫 값을 돌려준다.
 * accept 가 없으면 처음 해석되는 값. 없으면 PlanParseError.
 */
export function extractJson(text: string, accept: (value: unknown) => boolean = () => true): unknown {
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] !== "{" && text[index] !== "[") continue;
    const candidate = balanced(text, index);
    if (candidate === null) continue;
    let value: unknown;
    try {
      value = JSON.parse(candidate);
    } catch {
      // 추론 문장 속 `{x}` 같은 것은 건너뛰고 다음 괄호를 본다.
      continue;
    }
    if (accept(value)) return value;
  }
  throw new PlanParseError(`응답에서 기대한 모양의 JSON 을 찾지 못했다: ${text.slice(0, 120)}`);
}

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
/** 최상위가 key 배열을 가진 객체, 또는 (항목이 객체인) 맨 배열. 숫자 배열 같은 잡설 속 배열은 받지 않는다. */
const listShape = (key: string) => (value: unknown) =>
  (isRecord(value) && Array.isArray(value[key])) || (Array.isArray(value) && value.length > 0 && value.every(isRecord));

const clip = (max: number) => z.string().transform((value) => value.replace(/\s+/g, " ").trim().slice(0, max));
const draftSchema = z.object({ name: clip(limits.name), description: clip(limits.description) }).refine((draft) => draft.name !== "" && draft.description !== "");
const missingSchema = z.object({ name: clip(limits.name), description: clip(limits.description), reason: clip(limits.reason).optional() }).refine((draft) => draft.name !== "" && draft.description !== "");

/** 배열에서 schema 를 통과한 항목만 남긴다(잘못된 항목은 버린다). */
function keepValid<T>(values: unknown, schema: z.ZodType<T>, max: number): T[] {
  if (!Array.isArray(values)) return [];
  const kept: T[] = [];
  for (const value of values) {
    const parsed = schema.safeParse(value);
    if (parsed.success) kept.push(parsed.data);
    if (kept.length >= max) break;
  }
  return kept;
}

/**
 * 일부 모델이 배열의 둘째 이후 객체에서 여는 중괄호를 빠뜨린다(`...},"name":"x",...` · `...},"{"name":"x",...`).
 * 같은 입력엔 같은 출력이 나와 재시도로 풀리지 않으므로, 정상 해석이 실패했을 때만 `{` 를 되살려 한 번 더 해석한다.
 * 키가 `name` 인 객체 시작 자리만 고친다: 정상 JSON 에는 적용하지 않는다(실패 뒤 대체 경로).
 */
export function restoreObjectOpeners(text: string): string {
  return text.replace(/\}\s*,\s*(?:"\{)?"(?=name"\s*:)/g, '},{"');
}

/** 객체의 key 배열, 또는 맨 배열 자체. 그런 후보가 없으면 던진다(빠진 `{` 를 되살려도 없을 때). */
function listOf(text: string, key: string): unknown[] {
  let value: unknown;
  try {
    value = extractJson(text, listShape(key));
  } catch (error) {
    const repaired = restoreObjectOpeners(text);
    if (repaired === text) throw error;
    try {
      value = extractJson(repaired, listShape(key));
    } catch {
      throw error;
    }
  }
  return Array.isArray(value) ? value : ((value as Record<string, unknown[]>)[key]);
}

/** 같은 이름(공백 · 대소문자 무시)이 두 번 나오면 처음 것만 남긴다. */
function uniqueByName<T extends { name: string }>(drafts: T[]): T[] {
  const seen = new Set<string>();
  return drafts.filter((draft) => {
    const key = draft.name.toLowerCase().replace(/\s+/g, "");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** analyze 응답 {"items":[...]} → 아이템 초안. max 로 자른다. */
export function parseAnalyze(text: string, max: number = limits.items): ItemDraft[] {
  return uniqueByName(keepValid(listOf(text, "items"), draftSchema, limits.items)).slice(0, max);
}

/** prerequisites 응답 {"needs":[...]} → 아이템 초안. max 로 자른다. */
export function parsePrerequisites(text: string, max: number): ItemDraft[] {
  return uniqueByName(keepValid(listOf(text, "needs"), draftSchema, limits.items)).slice(0, max);
}

/**
 * dedupe 응답 {"groups":[[..]],"existing":{"idx":"id"}}. 범위 밖 번호, 알 수 없는 기존 id, 정수가 아닌 값은 버린다.
 * 한 후보는 한 묶음에만 들어간다(먼저 나온 묶음). 길이 1 이하가 된 묶음은 버린다.
 */
export function parseDedupe(text: string, candidateCount: number, existingIds: string[]): { groups: number[][]; existing: Record<number, string> } {
  const record = extractJson(text, (value) => isRecord(value) && ("groups" in value || "existing" in value)) as Record<string, unknown>;
  const valid = (index: unknown): index is number => typeof index === "number" && Number.isInteger(index) && index >= 0 && index < candidateCount;
  const used = new Set<number>();
  const groups: number[][] = [];
  for (const group of Array.isArray(record.groups) ? record.groups : []) {
    if (!Array.isArray(group)) continue;
    const members = [...new Set(group.map((entry) => (typeof entry === "string" && /^\d+$/.test(entry) ? Number(entry) : entry)).filter(valid))].filter((index) => !used.has(index));
    if (members.length < 2) continue;
    for (const index of members) used.add(index);
    groups.push(members);
  }
  const existing: Record<number, string> = {};
  const known = new Set(existingIds);
  const map = record.existing;
  if (map && typeof map === "object" && !Array.isArray(map)) {
    for (const [key, id] of Object.entries(map as Record<string, unknown>)) {
      const index = Number(key);
      if (/^\d+$/.test(key) && valid(index) && typeof id === "string" && known.has(id)) existing[index] = id;
    }
  }
  return { groups, existing };
}

/**
 * evaluate 응답 → 점수(0~100 정수로 클램프) · 이유(없으면 "") · 부족 항목 전부(보존 상한 limits.missing).
 * 형식 오류는 던진다: score 가 숫자가 아님, missing 키가 없거나 배열이 아님, missing 항목 하나라도 검증 실패.
 * 빈 missing 을 「부족 없음」으로 통과시키면 형식이 틀린 평가가 합격 판정이 되기 때문이다.
 * 보강 상한(maxNewItems)으로 자르지 않는다: 통과조건 maxMissing 은 잘리지 않은 개수로 판정해야 한다(플래너가 보강 수를 자른다).
 */
export function parseEvaluate(text: string): Omit<PlanEvaluation, "pass"> {
  // 완전한 모양(score + missing 배열)의 후보를 먼저 찾고, 없으면 score 만 있는 후보로 내려가 무엇이 틀렸는지 알린다.
  let record: Record<string, unknown>;
  try {
    record = extractJson(text, (value) => isRecord(value) && "score" in value && Array.isArray(value.missing)) as Record<string, unknown>;
  } catch {
    record = extractJson(text, (value) => isRecord(value) && "score" in value) as Record<string, unknown>;
  }
  const raw = typeof record.score === "string" && record.score.trim() !== "" ? Number(record.score.trim()) : record.score;
  if (typeof raw !== "number" || !Number.isFinite(raw)) throw new PlanParseError("평가 응답에 숫자 score 가 없다");
  if (!Array.isArray(record.missing)) throw new PlanParseError("평가 응답에 missing 배열이 없다");
  const score = Math.min(100, Math.max(0, Math.round(raw)));
  const reason = typeof record.reason === "string" ? record.reason.replace(/\s+/g, " ").trim().slice(0, limits.reason) : "";
  const parsed = record.missing.map((entry, index) => {
    const result = missingSchema.safeParse(entry);
    if (!result.success) throw new PlanParseError(`평가 응답의 missing[${index}] 형식이 틀렸다(name · description 문자열 필요)`);
    return result.data;
  });
  const missing = uniqueByName(parsed)
    .slice(0, limits.missing)
    .map((entry) => (entry.reason ? entry : { name: entry.name, description: entry.description }));
  return { score, reason, missing };
}
