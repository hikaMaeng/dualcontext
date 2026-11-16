import type { Answer, AugmentResult, ContextPlanConfig, ItemDraft } from "dualcontext_domain/common";
import type { ItemBuild, PlanPorts, Provided } from "dualcontext_domain/server";
import { answerPrompts } from "../../answer/index.js";
import { augment, type Deps } from "../../augment/base/index.js";
import { parseAnalyze, parseDedupe, parseEvaluate, parsePrerequisites } from "../parse/index.js";
import { prepareProvided } from "../provided/index.js";

/** 한 번의 기본 증강. 테스트에서 가짜로 바꾼다. */
export type BaseAugment = (deps: Deps, query: string, writerId?: number, provided?: Provided[]) => Promise<AugmentResult>;

/**
 * 한 번의 계획 실행 동안 어댑터가 남기는 기록. 계획 trace 에는 아이템별 쌍 요약만 있어(자료 없음),
 * 실행 로그의 조사원 탭(자료 포함)과 「증강 후 답변」 재사용에 필요한 원본을 여기서 꺼낸다.
 * - builds: 키 = 아이템 이름 + "\u0000" + 설명(buildKey), 값 = 그 아이템의 AugmentResult. 범위 · 수명 = createPlanPorts 한 번(실행 하나),
 *   상한 = build 호출 수(플래너의 maxItems 가 묶는다). 같은 키를 다시 만들면 덮어쓴다. 실행이 끝나 참조가 사라지면 함께 사라진다(지우는 쪽 없음).
 * - lastAnswer: 마지막 answer 호출의 (컨텍스트, 답변). 하나만 둔다.
 */
export type PlanRecord = { builds: Map<string, AugmentResult>; lastAnswer: { context: string; answer: Answer } | null };

export const buildKey = (item: ItemDraft) => `${item.name}\u0000${item.description}`;

/** 아이템 하나를 조사할 때 쓰는 질의. 설명이 자기완결적이므로 원래 질의 없이도 라우팅 · 수집이 된다. */
export const itemQuery = (item: ItemDraft) => `${item.name}: ${item.description}`;

/**
 * 프롬프트 구분자(`<<<이름` · `이름>>>`)를 무력화한다. 질의 · 아이템 · 컨텍스트 · 답변 안에 구분자가 있으면
 * 데이터 구간을 일찍 닫고 지시를 끼워 넣을 수 있으므로, 꺾쇠 셋을 비슷한 모양의 다른 문자(‹‹‹ · ›››)로 바꾼다.
 */
export const neutralize = (text: string) => text.replace(/<{3,}/g, (marks) => "‹".repeat(marks.length)).replace(/>{3,}/g, (marks) => "›".repeat(marks.length));

/** 답변 프롬프트용. answer/index.ts 의 채우기와 같아야 한다(같은 입력이어야 실행 로그가 마지막 답을 「증강 후 답변」으로 재사용할 수 있다). */
const fill = (template: string, values: Record<string, string>) => template.replace(/\{\{(\w+)\}\}/g, (_m, key: string) => values[key] ?? "");

/** 계획 프롬프트를 채운다. 값은 모두 구분자를 무력화한 뒤 넣는다(템플릿 자체의 구분자는 그대로). */
export const fillPlanPrompt = (template: string, values: Record<string, string>) => template.replace(/\{\{(\w+)\}\}/g, (_m, key: string) => (key in values ? neutralize(values[key]) : ""));
const list = (lines: string[]) => (lines.length > 0 ? lines.join("\n") : "(없음)");

/**
 * 플래너 포트를 채운다. analyze · prerequisites · dedupe · evaluate 는 저장된(또는 이번 실행의) 프롬프트로 채팅 모델을 부르고,
 * answer 는 실행 로그의 「증강 후 답변」과 같은 프롬프트(answerPrompts.after, 컨텍스트가 비면 before)로,
 * build 는 기존 증강 경로(아이템 질의 + 사전 컨텍스트)로 만든다. 모델 호출 · 해석 실패는 던진다(플래너가 격리한다).
 */
export function createPlanPorts(deps: Deps, writerId: number | undefined, config: ContextPlanConfig, base: BaseAugment = augment): PlanPorts & { record: PlanRecord } {
  const record: PlanRecord = { builds: new Map(), lastAnswer: null };
  const { prompts } = config;
  return {
    record,
    async analyze(query) {
      return parseAnalyze(await deps.model.chat(fillPlanPrompt(prompts.analyze, { query, max: String(config.maxItems) })), config.maxItems);
    },
    async prerequisites(query, item, known) {
      const prompt = fillPlanPrompt(prompts.prerequisites, {
        query,
        item: itemQuery(item),
        known: list(known.map((entry) => `- ${entry.name}: ${entry.description}`)),
        max: String(config.maxNeedsPerItem)
      });
      return parsePrerequisites(await deps.model.chat(prompt), config.maxNeedsPerItem);
    },
    async dedupe(query, candidates, existing) {
      const prompt = fillPlanPrompt(prompts.dedupe, {
        query,
        candidates: list(candidates.map((entry, index) => `${index}: ${entry.name} — ${entry.description}`)),
        existing: list(existing.map((entry) => `${entry.id}: ${entry.name} — ${entry.description}`)),
        max: String(candidates.length)
      });
      return parseDedupe(await deps.model.chat(prompt), candidates.length, existing.map((entry) => entry.id));
    },
    async build(_query, item, provided): Promise<ItemBuild> {
      // 중첩된 사전 컨텍스트 섹션을 빼고 하나당 maxProvidedChars 로 잘라 넘긴다(깊은 의존성의 누적 방지).
      const result = await base(deps, itemQuery(item), writerId, prepareProvided(provided, config.maxProvidedChars));
      record.builds.set(buildKey(item), result);
      return {
        context: result.context,
        pairs: result.pairs.map((pair) => ({
          researcher: pair.researcher,
          procedure: pair.procedure,
          materialCount: pair.materialCount,
          ...(pair.error !== undefined ? { error: pair.error } : {}),
          procedureRouting: pair.procedureRouting
        }))
      };
    },
    async answer(query, context) {
      const started = Date.now();
      const prompt = context.trim() === "" ? fill(answerPrompts.before, { query }) : fill(answerPrompts.after, { query, context });
      const text = await deps.model.chat(prompt);
      record.lastAnswer = { context, answer: { text, error: null, ms: Date.now() - started } };
      return text;
    },
    async evaluate(query, context, answer) {
      const prompt = fillPlanPrompt(prompts.evaluate, { query, context: context.trim() === "" ? "(없음)" : context, answer, max: String(config.reevaluate.maxNewItems) });
      // 부족 항목은 자르지 않고 전부 돌려준다: 통과 판정(maxMissing)은 전체 개수로, 보강 수(maxNewItems)는 플래너가 자른다.
      return parseEvaluate(await deps.model.chat(prompt));
    }
  };
}
