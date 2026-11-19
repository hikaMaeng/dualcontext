import type { WorkerName } from "../location/index.js";

/**
 * 풀 관리자의 공통부: 작업 장부와 종료 등록. 세 소비자(search · build · regex)는 각자 스레드를 다루지만
 * 「어떤 작업이 누구 것이고 어떻게 끝내는가」는 한 곳에 적는다.
 *
 * 종료 방식(mode): `flag` 는 공유 취소 플래그를 켜서 스레드가 스스로 멈추게 하고(스레드를 죽이지 않는다, 색인 캐시를 지킨다),
 * `terminate` 는 스레드를 죽이고 종료 확인까지 기다린다(작업 단위 스레드 · 종료 가능한 정규식 스레드).
 */
export type TaskMode = "flag" | "terminate";
export type TaskState = "queued" | "running";
export type TaskInfo = { id: string; kind: WorkerName; owner: string | undefined; mode: TaskMode; state: TaskState; queuedAt: number; startedAt: number | null };

/**
 * 진행 중인 작업 장부. 키 = 작업 id(호출마다 새로 만든 유일 값), 범위 = 프로세스, 작업이 정착(성공 · 실패 · 취소)하면 `end` 가 지운다.
 * 크기는 대기 + 실행 중인 작업 수다(요청 접수를 거절하지 않으므로 상한은 생산자가 정한다).
 */
const tasks = new Map<string, TaskInfo>();

export type TaskHandle = { start(): void; end(): void };

export function registerTask(id: string, kind: WorkerName, mode: TaskMode, owner?: string): TaskHandle {
  tasks.set(id, { id, kind, owner, mode, state: "queued", queuedAt: Date.now(), startedAt: null });
  return {
    start() {
      const info = tasks.get(id);
      if (info !== undefined) {
        info.state = "running";
        info.startedAt = Date.now();
      }
    },
    end() {
      tasks.delete(id);
    }
  };
}

/** 계측용 스냅샷(종류별 대기 · 실행 수와 작업 목록). */
export function taskSnapshot(): { queued: number; running: number; tasks: TaskInfo[] } {
  const list = [...tasks.values()].map((task) => ({ ...task }));
  return { queued: list.filter((task) => task.state === "queued").length, running: list.filter((task) => task.state === "running").length, tasks: list };
}

/** 소유자(실행 id)의 작업 id 들. 소유자별 정리 · 계측용. */
export function tasksOf(owner: string): string[] {
  return [...tasks.values()].filter((task) => task.owner === owner).map((task) => task.id);
}

/** 프로세스 종료 때 부를 정리 함수 등록: 각 풀이 자기 `close` 를 올린다. 키 = 함수 자체(풀마다 하나). */
const closers = new Set<() => Promise<void>>();

export function onShutdown(close: () => Promise<void>): () => void {
  closers.add(close);
  return () => void closers.delete(close);
}

/** 모든 풀을 닫고 모든 스레드의 종료를 확인한 뒤 돌아온다. 종료(SIGTERM) 경로가 부른다. */
export async function shutdownWorkers(): Promise<void> {
  await Promise.allSettled([...closers].map((close) => close()));
}
