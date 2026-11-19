export type WorkerName = "search" | "build" | "regex";

/**
 * 워커 번들의 위치. 서버 번들(`dist/server/index.js`)에서는 같은 폴더의 `workers/<이름>.js`(esbuild 진입점 이름)이고,
 * 소스를 직접 돌리는 개발 · 시험(tsx)에서는 각 폴더의 `worker.ts` 다. 서버 엔트리를 워커로 실행하지 않는다.
 * `base` 는 시험용이며 기본은 이 모듈의 `import.meta.url`(번들 안에서는 서버 번들의 URL 이 된다).
 */
export function workerUrl(name: WorkerName, base: string = import.meta.url): URL {
  return base.endsWith(".ts") ? new URL(`../${name}/worker.ts`, base) : new URL(`./workers/${name}.js`, base);
}
