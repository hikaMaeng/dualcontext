import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { collectCodebase } from "../../collect/codebase/index.js";
import { regexPool, shutdownWorkers } from "../index.js";

/**
 * `dist` 단독 실행 확인용 진입점. 서버 번들과 같은 esbuild 옵션으로 묶여 워커 번들(`workers/<이름>.js`) 옆에 놓이고,
 * 기본 워커 URL(번들 위치 기준)로 세 스레드를 실제로 띄워 한 바퀴 돈다: 정규식 판정 → 코드베이스 빌드(스캔 · 그래프 · 쓰기) → 검색.
 * 결과를 JSON 한 줄로 표준 출력에 낸다. 서버 엔트리(`index.ts`)는 DB 가 필요해 이 확인에 쓰지 않는다.
 */
const data = await mkdtemp(path.join(os.tmpdir(), "dist-check-"));
try {
  await mkdir(path.join(data, "repo"), { recursive: true });
  await writeFile(path.join(data, "repo", "login.ts"), "export function hashPassword(plain: string) {\n  return salt(plain);\n}\nexport function salt(plain: string) {\n  return plain + 'x';\n}\n");
  const wanted = await regexPool().filter(["^/docs"], ["^/docs/old"], ["/docs/a", "/docs/old/a", "/blog"]);
  const materials = await collectCodebase(data, { source: "directory", path: "repo", topK: 3 }, "hashPassword salt");
  const again = await collectCodebase(data, { source: "directory", path: "repo", topK: 3 }, "hashPassword salt");
  console.log(JSON.stringify({ wanted, titles: materials.map((material) => material.title), again: again.length }));
} finally {
  await shutdownWorkers();
  await rm(data, { recursive: true, force: true });
}
