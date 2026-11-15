import type { Material } from "dualcontext_domain/common";
import { buildFor, keyOf, type BuildDeps } from "./build.js";
import { codebaseConfigSchema } from "./config/index.js";
import { toMaterials } from "./format/index.js";
import type { CodeIndex } from "./model/index.js";
import { search } from "./rank/index.js";
import { isStale, readIndex, writeIndex } from "./store/index.js";

export { codebaseConfigSchema } from "./config/index.js";

/**
 * 진행 중인 인덱스 만들기: 키 = 인덱스 키, 범위 = 프로세스, 같은 키의 동시 질의는 한 번의 클론 · 인덱싱을 기다린다.
 * 끝나면(성공 · 실패) 만든 쪽이 지운다. 키 개수는 조사원 수 이하다.
 */
const inflight = new Map<string, Promise<CodeIndex>>();
/** 최근 실패: 키 = 인덱스 키, 성공하면 지운다. 실패 직후 질의마다 클론을 되풀이하지 않도록 60초 동안은 같은 오류를 바로 돌려준다. */
const failures = new Map<string, { at: number; message: string }>();
const backoffMs = 60_000;

function ensure(dataDir: string, key: string, config: ReturnType<typeof codebaseConfigSchema.parse>, deps: BuildDeps): Promise<CodeIndex> {
  const running = inflight.get(key);
  if (running !== undefined) return running;
  const job = (async () => {
    try {
      const index = await buildFor(dataDir, config, deps);
      await writeIndex(dataDir, key, index);
      failures.delete(key);
      return index;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.set(key, { at: Date.now(), message });
      throw error;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, job);
  return job;
}

/**
 * 코드베이스 조사원: 레포(서버 안에서 클론하거나 볼륨 안 폴더)를 심볼 · 호출 · import 구조 인덱스로 만들어 질의에 답한다.
 * 인덱스가 없으면 첫 질의가 만들어 기다리고(시간 상한 있음), 오래됐으면(refreshHours) 옛 인덱스로 답하며 뒤에서 갱신한다.
 */
export async function collectCodebase(dataDir: string, rawConfig: Record<string, unknown>, query: string, deps: BuildDeps = {}): Promise<Material[]> {
  const parsed = codebaseConfigSchema.safeParse(rawConfig);
  if (!parsed.success) throw new Error(`invalid codebase config: ${parsed.error.issues.map((issue) => issue.path.join(".")).join(", ")}`);
  const config = parsed.data;
  const key = keyOf(config);

  let index = await readIndex(dataDir, key);
  if (index === null) {
    const failure = failures.get(key);
    if (failure !== undefined && Date.now() - failure.at < backoffMs) throw new Error(failure.message);
    index = await ensure(dataDir, key, config, deps);
  } else if (isStale(index, config.refreshHours) && !inflight.has(key)) {
    const failure = failures.get(key);
    if (failure === undefined || Date.now() - failure.at >= backoffMs) {
      ensure(dataDir, key, config, deps).catch((error: unknown) => console.error(`codebase refresh failed: ${error instanceof Error ? error.message : "unknown"}`));
    }
  }
  return toMaterials(index, search(index, query, config.topK));
}
