import { z } from "zod";

const onError = z.enum(["skip", "keyword", "none"]);
const base = { parts: z.boolean(), onError };
const topK = z.number().int().min(1).max(20);

const step = z.discriminatedUnion("type", [
  z.object({ type: z.literal("embedding"), topK, minScore: z.number().min(0).max(1), margin: z.number().min(0).max(1), ...base }),
  z.object({ type: z.literal("keyword"), topK, ...base }),
  z.object({ type: z.literal("llm"), topK, prompt: z.string().min(1), showScores: z.boolean(), allowNone: z.boolean(), ...base })
]);

const stage = z.object({ steps: z.array(step).min(1).max(6) });

/** 단계(stage) 하나의 검증 스키마. 조사원의 개별 라우터도 같은 모양이다. */
export const stageSchema = stage;

/** 라우터 설정의 검증 스키마. 저장할 때와 읽을 때 같은 것을 쓴다. */
export const routerConfigSchema = z.object({
  split: z.object({
    method: z.enum(["none", "heuristic", "llm"]),
    maxParts: z.number().int().min(2).max(8),
    minChars: z.number().int().min(1).max(100),
    partTopK: z.number().int().min(1).max(5),
    prompt: z.string().min(1)
  }),
  researcher: stage,
  procedure: stage
});
