import { Worker, type WorkerOptions } from "node:worker_threads";

/**
 * 소스(`.ts`)를 직접 돌리는 개발 · 시험에서 스레드를 띄우는 부트스트랩. 워커 스레드에는 부모의 tsx 로더가 이어지지 않으므로
 * 스레드 안에서 tsx 를 등록한 뒤 진입 파일을 불러온다. 번들(`.js`)에서는 쓰지 않는다.
 */
const sourceBootstrap = `import { register } from "tsx/esm/api"; import { workerData } from "node:worker_threads"; register(); await import(workerData.__entry);`;

/** 스레드를 띄운다. 놀고 있는 동안은 프로세스를 붙잡지 않는다(`unref`): 일이 있는 동안만 `busy` 로 붙잡는다. */
export function startThread(url: URL, options: WorkerOptions = {}): Worker {
  const worker = url.pathname.endsWith(".ts")
    ? new Worker(sourceBootstrap, { ...options, eval: true, workerData: { __entry: url.href, __data: options.workerData } })
    : new Worker(url, options);
  worker.unref();
  return worker;
}

/** 종료를 요청하고 스레드가 실제로 끝났음을 확인한 뒤 돌아온다(여러 번 불러도 된다). */
export async function stopThread(worker: Worker): Promise<void> {
  await worker.terminate();
}

/** 스레드가 일하는 동안 프로세스가 끝나지 않게 붙잡고, 끝나면 놓는다. */
export const busy = (worker: Worker): void => void worker.ref();
export const idle = (worker: Worker): void => void worker.unref();
