import type { Material } from "dualcontext_domain/common";
import type { BuildDeps } from "./build.js";
import { queryIndex } from "./acquire/index.js";
import { codebaseConfigSchema } from "./config/index.js";
import { collectProjects } from "./projects/index.js";

export { codebaseConfigSchema } from "./config/index.js";

/**
 * 코드베이스 조사원: 레포(서버 안에서 클론하거나 볼륨 안 폴더)를 심볼 · 호출 · import 구조 인덱스로 만들어 질의에 답한다.
 * 인덱스 읽기 · 검색은 검색 스레드, 만들기는 빌드 스레드가 한다(`workers/`). `deps.signal` 은 이 요청의 취소 신호다.
 * `projects` 이면 path 폴더의 하위 폴더 각각을 개별 프로젝트로 인식한다(projects/).
 */
export async function collectCodebase(dataDir: string, rawConfig: Record<string, unknown>, query: string, deps: BuildDeps = {}): Promise<Material[]> {
  const parsed = codebaseConfigSchema.safeParse(rawConfig);
  if (!parsed.success) throw new Error(`invalid codebase config: ${parsed.error.issues.map((issue) => issue.path.join(".")).join(", ")}`);
  const config = parsed.data;
  if (config.projects) return collectProjects(dataDir, config, query, deps);
  return (await queryIndex(dataDir, config, query, deps)).materials;
}
