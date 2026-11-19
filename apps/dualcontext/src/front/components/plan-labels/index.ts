import type { ContextMode, ItemStatus, PlanStop } from "dualcontext_domain/common";
import type { Texts } from "../../i18n";
import type { PlanProgressStage } from "../../lib/run";
import { RSC } from "./resource";

/** 계약의 값마다 키 하나. 값이 늘면 Record 가 컴파일 오류로 알려 준다(키를 조합해 만들지 않는다). */
const modeText: Record<ContextMode, RSC> = {
  classic: RSC.PLAN_MODE_CLASSIC_TEXT,
  decompose: RSC.PLAN_MODE_DECOMPOSE_TEXT,
  reevaluate: RSC.PLAN_MODE_REEVALUATE_TEXT
};

const modeMessage: Record<ContextMode, RSC> = {
  classic: RSC.PLAN_MODE_CLASSIC_MESSAGE,
  decompose: RSC.PLAN_MODE_DECOMPOSE_MESSAGE,
  reevaluate: RSC.PLAN_MODE_REEVALUATE_MESSAGE
};

const stopText: Record<PlanStop, RSC> = {
  "mode-decompose": RSC.PLAN_STOP_MODEDECOMPOSE_TEXT,
  passed: RSC.PLAN_STOP_PASSED_TEXT,
  "max-rounds": RSC.PLAN_STOP_MAXROUNDS_TEXT,
  "no-missing": RSC.PLAN_STOP_NOMISSING_TEXT,
  "no-new-items": RSC.PLAN_STOP_NONEWITEMS_TEXT,
  "no-items": RSC.PLAN_STOP_NOITEMS_TEXT,
  "evaluation-failed": RSC.PLAN_STOP_EVALUATIONFAILED_TEXT,
  "answer-failed": RSC.PLAN_STOP_ANSWERFAILED_TEXT,
  deadline: RSC.PLAN_STOP_DEADLINE_TEXT
};

const statusText: Record<ItemStatus, RSC> = {
  pending: RSC.PLAN_ITEM_PENDING_TEXT,
  built: RSC.PLAN_ITEM_BUILT_TEXT,
  empty: RSC.PLAN_ITEM_EMPTY_TEXT,
  error: RSC.PLAN_ITEM_ERROR_TEXT
};

const progressText: Record<PlanProgressStage, RSC> = {
  analyze: RSC.PLAN_PROGRESS_ANALYZE_TEXT,
  dependencies: RSC.PLAN_PROGRESS_DEPENDENCIES_TEXT,
  build: RSC.PLAN_PROGRESS_BUILD_TEXT,
  answer: RSC.PLAN_PROGRESS_ANSWER_TEXT,
  evaluate: RSC.PLAN_PROGRESS_EVALUATE_TEXT,
  reinforce: RSC.PLAN_PROGRESS_REINFORCE_TEXT,
  done: RSC.PLAN_PROGRESS_DONE_TEXT
};

export const CONTEXT_MODES: ContextMode[] = ["classic", "decompose", "reevaluate"];

export const planModeText = (mode: ContextMode, t: Texts) => t[modeText[mode]] ?? mode;
export const planModeMessage = (mode: ContextMode, t: Texts) => t[modeMessage[mode]] ?? "";
/** 서버가 계약 밖의 값을 보내면 원문을 그대로 보인다(빈 라벨로 숨기지 않는다). */
export const planStopText = (stop: PlanStop, t: Texts) => (stopText[stop] ? t[stopText[stop]] : stop);
export const planProgressText = (stage: PlanProgressStage, t: Texts) => (progressText[stage] ? t[progressText[stage]] : stage);
export const itemStatusText = (status: ItemStatus, t: Texts) => (statusText[status] ? t[statusText[status]] : status);
