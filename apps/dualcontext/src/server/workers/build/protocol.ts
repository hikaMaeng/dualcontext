import type { CodeIndex, IndexSource, Limits } from "../../collect/codebase/model/index.js";

/**
 * 빌드 작업 하나: 스캔 → 심볼 · 그래프 → 인덱스 파일 쓰기. 스레드 하나가 작업 하나를 하고 끝난다.
 * 임시 파일 이름은 `jobId` 로 나뉘고(같은 키의 두 작업이 서로의 임시 파일을 밟지 않는다) 정리는 부모가 한다.
 */
export type BuildJob = { jobId: string; root: string; source: IndexSource; limits: Limits; dataDir: string; key: string };

/** 메인에는 요약만 돌려준다(색인은 파일로 남기고 복제하지 않는다). */
export type BuildOutcome = { builtAt: string; stats: CodeIndex["stats"] };

export type BuildReply = ({ type: "done" } & BuildOutcome) | { type: "failed"; message: string };
