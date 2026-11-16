import type { Material } from "dualcontext_domain/common";
import { acquireIndex, hasIndex } from "../acquire/index.js";
import { resolveDirectory, type BuildDeps } from "../build.js";
import type { CodebaseConfig } from "../config/index.js";
import { toMaterials } from "../format/index.js";
import { search } from "../rank/index.js";
import { listProjects, namedIn } from "./discover.js";

/** 하위 프로젝트 하나를 읽는 설정: 부모 설정에서 path 만 하위 폴더로 좁힌다(같은 경로의 단독 조사원과 같은 인덱스 키). */
const projectConfig = (config: CodebaseConfig, name: string): CodebaseConfig => ({ ...config, projects: false, path: `${(config.path ?? "").replace(/\/+$/, "")}/${name}` });

/**
 * 인덱스가 아직 없는 프로젝트를 뒤에서 하나씩 만든다. 키 = 없음(프로세스 하나), 한 번에 한 루프만 돈다.
 * 질의를 막지 않으려는 것이라 실패는 로그만 남기고 넘어간다.
 */
let warming = false;
async function warm(dataDir: string, config: CodebaseConfig, names: string[], deps: BuildDeps) {
  if (warming) return;
  warming = true;
  try {
    for (const name of names) {
      const target = projectConfig(config, name);
      if (await hasIndex(dataDir, target)) continue;
      await acquireIndex(dataDir, target, deps).catch((error: unknown) => console.error(`codebase warm failed (${name}): ${error instanceof Error ? error.message : "unknown"}`));
    }
  } finally {
    warming = false;
  }
}

/**
 * 폴더 아래 프로젝트들을 개별 인덱스로 다룬다.
 * - 질의에 프로젝트 이름이 나오면 그 프로젝트(들)만 읽는다(인덱스가 없으면 만들어 기다린다).
 * - 이름이 안 나오면 이미 인덱스가 있는 프로젝트 전체를 읽어 점수순으로 합친다(점수는 프로젝트마다 따로 계산돼 엄밀한 비교는 아니다).
 *   인덱스가 없는 프로젝트는 뒤에서 만든다. 아직 하나도 없으면 빈 결과다.
 * 자료 제목 앞에 `[프로젝트]` 를 붙인다.
 */
export async function collectProjects(dataDir: string, config: CodebaseConfig, query: string, deps: BuildDeps = {}): Promise<Material[]> {
  const root = await resolveDirectory(dataDir, config.path ?? "");
  const names = await listProjects(root);
  const named = namedIn(query, names);
  const missing: string[] = [];
  const targets: string[] = [];
  if (named.length > 0) targets.push(...named);
  else {
    for (const name of names) (await hasIndex(dataDir, projectConfig(config, name)) ? targets : missing).push(name);
  }
  if (named.length === 0 && missing.length > 0) void warm(dataDir, config, missing, deps);

  const scored: { score: number; material: Material }[] = [];
  const errors: string[] = [];
  for (const name of targets) {
    try {
      const target = projectConfig(config, name);
      const index = await acquireIndex(dataDir, target, deps);
      const hits = search(index, query, config.topK);
      toMaterials(index, hits).forEach((material, position) => scored.push({ score: (hits[position] as { score: number }).score, material: { ...material, title: `[${name}] ${material.title}` } }));
    } catch (error) {
      errors.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (scored.length === 0 && errors.length > 0) throw new Error(errors.join("; "));
  return scored.sort((a, b) => b.score - a.score).slice(0, config.topK).map((entry) => entry.material);
}
