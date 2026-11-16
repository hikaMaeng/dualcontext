import type { Material } from "dualcontext_domain/common";
import type { BuildDeps } from "./build.js";
import { acquireIndex } from "./acquire/index.js";
import { codebaseConfigSchema } from "./config/index.js";
import { toMaterials } from "./format/index.js";
import { collectProjects } from "./projects/index.js";
import { search } from "./rank/index.js";

export { codebaseConfigSchema } from "./config/index.js";

/**
 * 코드베이스 조사원: 레포(서버 안에서 클론하거나 볼륨 안 폴더)를 심볼 · 호출 · import 구조 인덱스로 만들어 질의에 답한다.
 * `projects` 이면 path 폴더의 하위 폴더 각각을 개별 프로젝트로 인식한다(projects/).
 */
export async function collectCodebase(dataDir: string, rawConfig: Record<string, unknown>, query: string, deps: BuildDeps = {}): Promise<Material[]> {
  const parsed = codebaseConfigSchema.safeParse(rawConfig);
  if (!parsed.success) throw new Error(`invalid codebase config: ${parsed.error.issues.map((issue) => issue.path.join(".")).join(", ")}`);
  const config = parsed.data;
  if (config.projects) return collectProjects(dataDir, config, query, deps);
  const index = await acquireIndex(dataDir, config, deps);
  return toMaterials(index, search(index, query, config.topK));
}
