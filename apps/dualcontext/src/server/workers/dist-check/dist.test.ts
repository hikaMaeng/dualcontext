import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const appRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const require = createRequire(import.meta.url);

/** package.json 의 `build:server` 스크립트를 인자로 쪼갠다(따옴표 안 공백 유지, 바깥 따옴표 제거). */
async function buildServerArgs(): Promise<string[]> {
  const pkg = JSON.parse(await readFile(path.join(appRoot, "package.json"), "utf8")) as { scripts: Record<string, string> };
  const script = pkg.scripts["build:server"] as string;
  assert.ok(script.startsWith("esbuild "), script);
  return (script.slice("esbuild ".length).match(/(?:[^\s"]|"[^"]*")+/g) ?? []).map((token) => token.replace(/"/g, ""));
}

test("build:server 는 서버 번들 하나와 워커 번들 셋을 dist/server 아래 고정된 이름으로 낸다", async () => {
  const args = await buildServerArgs();
  const entries = args.filter((arg) => !arg.startsWith("--"));
  assert.deepEqual(entries.map((entry) => entry.split("=")[0]), ["index", "workers/search", "workers/build", "workers/regex"]);
  assert.ok(args.includes("--outdir=dist/server"), "Dockerfile 이 실행하는 dist/server/index.js 경로가 유지된다");
  assert.ok(args.includes("--bundle") && args.includes("--format=esm") && args.includes("--platform=node"));
  assert.ok(args.some((arg) => arg.startsWith("--banner:js=") && arg.includes("createRequire")), "각 번들에 createRequire 배너");
  for (const entry of entries) assert.match(entry, /^[\w/]+=src\/server\/.+\.ts$/);
});

test("dist 만으로 워커 스레드가 실제로 뜬다: 같은 esbuild 옵션으로 묶고 node_modules · package.json 없는 폴더에서 정규식 · 빌드 · 검색 스레드를 한 바퀴 돈다", async () => {
  const work = await mkdtemp(path.join(os.tmpdir(), "dist-only-"));
  try {
    const built = path.join(work, "built");
    const args = (await buildServerArgs()).map((arg) => {
      if (arg === "index=src/server/index.ts") return "smoke=src/server/workers/dist-check/main.ts";
      if (arg === "--outdir=dist/server") return `--outdir=${built}`;
      return arg;
    });
    const esbuildBin = path.join(path.dirname(require.resolve("esbuild/package.json")), "bin", "esbuild");
    const bundled = spawnSync(process.execPath, [esbuildBin, ...args], { cwd: appRoot, encoding: "utf8" });
    assert.equal(bundled.status, 0, bundled.stderr);
    assert.deepEqual((await readdir(path.join(built, "workers"))).sort(), ["build.js", "regex.js", "search.js"]);

    // 컨테이너가 복사하는 것은 dist 뿐이다: 번들만 따로 복사한 폴더에서, 소스 트리와 node_modules 밖에서 실행한다.
    const dist = path.join(work, "dist-only", "server");
    await cp(built, dist, { recursive: true });
    const ran = spawnSync(process.execPath, [path.join(dist, "smoke.js")], { cwd: path.join(work, "dist-only"), encoding: "utf8", timeout: 60_000 });
    assert.equal(ran.status, 0, `${ran.stderr}\n${ran.stdout}`);
    const result = JSON.parse(ran.stdout.trim().split("\n").pop() as string) as { wanted: boolean[]; titles: string[]; again: number };
    assert.deepEqual(result.wanted, [true, false, false], "cpu.regex 스레드");
    assert.ok(result.titles.length > 0 && /login\.ts:\d+-\d+ function (hashPassword|salt)/.test(result.titles[0] as string), `cpu.build + cpu.search: ${result.titles.join("|")}`);
    assert.equal(result.again > 0, true);
  } finally {
    await rm(work, { recursive: true, force: true });
  }
});
