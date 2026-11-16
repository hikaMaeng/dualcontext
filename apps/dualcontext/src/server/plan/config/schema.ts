import { z } from "zod";

/** 계약(ContextPlanConfig) 주석의 범위를 그대로 옮긴 한도 스키마. 저장 · 읽기 · 실행 한 번 override 가 같은 범위를 쓴다. */
const limitsShape = {
  maxLevels: z.number().int().min(1).max(6),
  maxNeedsPerItem: z.number().int().min(1).max(8),
  maxItems: z.number().int().min(1).max(40),
  maxProvidedChars: z.number().int().min(500).max(20000)
};
const reevaluateShape = {
  maxRounds: z.number().int().min(0).max(5),
  passScore: z.number().int().min(0).max(100),
  // 계약에 상한이 없어 maxItems 의 상한(40)을 쓴다.
  maxMissing: z.number().int().min(0).max(40),
  maxNewItems: z.number().int().min(1).max(8)
};

export const contextModeSchema = z.enum(["classic", "decompose", "reevaluate"]);

/** 계획 설정 전체의 검증 스키마(PUT /api/admin/plan/config 본문, plan_config.config 읽기). 모르는 필드는 버린다. */
export const planConfigSchema = z.object({
  mode: contextModeSchema,
  ...limitsShape,
  dedupe: z.enum(["name", "llm"]),
  reevaluate: z.object(reevaluateShape),
  prompts: z.object({
    analyze: z.string().trim().min(1).max(20000),
    prerequisites: z.string().trim().min(1).max(20000),
    dedupe: z.string().trim().min(1).max(20000),
    evaluate: z.string().trim().min(1).max(20000)
  })
});

/** 실행 한 번에만 적용하는 부분 설정(POST /api/admin/augment 의 plan). 숫자 한도만 받는다: 프롬프트 · 모드 · 중복 정리 방법은 받지 않는다. */
export const planOverrideSchema = z
  .object({
    maxLevels: limitsShape.maxLevels.optional(),
    maxNeedsPerItem: limitsShape.maxNeedsPerItem.optional(),
    maxItems: limitsShape.maxItems.optional(),
    maxProvidedChars: limitsShape.maxProvidedChars.optional(),
    reevaluate: z
      .object({
        maxRounds: reevaluateShape.maxRounds.optional(),
        passScore: reevaluateShape.passScore.optional(),
        maxMissing: reevaluateShape.maxMissing.optional(),
        maxNewItems: reevaluateShape.maxNewItems.optional()
      })
      .strict()
      .optional()
  })
  .strict();

export type PlanOverride = z.infer<typeof planOverrideSchema>;
