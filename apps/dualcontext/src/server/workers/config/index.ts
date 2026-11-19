import os from "node:os";

/**
 * CPU 격리 스레드의 배포 설정. 소비자 수는 비열화를 증명한 값이 아니라 관찰된 배포 형태 이상으로 잡은 기본값이며,
 * 수용 시험에서 처리량이 떨어지지 않는지 측정으로 확인한다(설계 문서 execution-design.md).
 */
export type WorkerSettings = {
  /** `cpu.search` 스레드 수. 색인 키 해시로 스레드에 고정한다(캐시 중복 방지). */
  searchWorkers: number;
  /** `cpu.build` 동시 작업 수(작업 하나가 스레드 하나). */
  cpuWorkers: number;
  /** 검색 스레드 하나의 힙 상한(MB, `resourceLimits.maxOldGenerationSizeMb`). 힙만 제한하며 RSS 는 따로 본다. */
  searchHeapMb: number;
  /** 모든 검색 스레드가 합쳐 잡을 색인 캐시 예산(MB). 추정은 색인 파일 바이트 × 4. */
  searchCacheMb: number;
  /** 빌드 스레드 하나의 힙 상한(MB). */
  buildHeapMb: number;
};

function readInt(source: NodeJS.ProcessEnv, name: string, fallback: number, min: number, max: number): number {
  const raw = source[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${name} must be an integer from ${min} to ${max}`);
  return value;
}

/** 환경 변수에서 읽는다: DUALCONTEXT_SEARCH_WORKERS(2), DUALCONTEXT_CPU_WORKERS(min(2, cpus-1), 최소 1), DUALCONTEXT_SEARCH_HEAP_MB(768), DUALCONTEXT_SEARCH_CACHE_MB(512), DUALCONTEXT_BUILD_HEAP_MB(2048). */
export function readWorkerSettings(source: NodeJS.ProcessEnv = process.env, cpus: number = os.availableParallelism()): WorkerSettings {
  return {
    searchWorkers: readInt(source, "DUALCONTEXT_SEARCH_WORKERS", 2, 1, 16),
    cpuWorkers: readInt(source, "DUALCONTEXT_CPU_WORKERS", Math.max(1, Math.min(2, cpus - 1)), 1, 16),
    searchHeapMb: readInt(source, "DUALCONTEXT_SEARCH_HEAP_MB", 768, 64, 16384),
    searchCacheMb: readInt(source, "DUALCONTEXT_SEARCH_CACHE_MB", 512, 16, 65536),
    buildHeapMb: readInt(source, "DUALCONTEXT_BUILD_HEAP_MB", 2048, 128, 16384)
  };
}
