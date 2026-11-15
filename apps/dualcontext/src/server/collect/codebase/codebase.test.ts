import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildClone, cloneShallow, redact, type Runner } from "./clone/index.js";
import { codebaseConfigSchema, collectCodebase } from "./index.js";
import { buildIndex } from "./graph/index.js";
import { isBlockedAddress, parseRepoUrl, resolveSafe, assertRef, assertSubPath } from "./guard/index.js";
import { search } from "./rank/index.js";
import { scanTree } from "./scan/index.js";
import { tokenize } from "./rank/tokenize.js";

const limits = () => ({ maxFiles: 100, maxFileBytes: 100_000, maxTotalBytes: 5_000_000, deadline: Date.now() + 30_000 });

test("레포 URL: https 공개 호스트만, 계정 정보 · 포트 · 내부 호스트는 거부한다", () => {
  assert.equal(parseRepoUrl("https://github.com/octocat/Hello-World").hostname, "github.com");
  for (const bad of [
    "http://github.com/a/b", "ssh://git@github.com/a/b", "file:///etc", "https://user:tok@github.com/a/b", "https://github.com:8443/a/b",
    "https://localhost/a/b", "https://intranet/a/b", "https://git.internal/a/b", "https://127.0.0.1/a/b", "https://[::1]/a/b",
    "https://169.254.169.254/a/b", "https://2130706433/a/b", "https://10.0.0.5/a/b", "https://github.com/a/b?x=1", "https://github.com/only"
  ]) {
    assert.throws(() => parseRepoUrl(bad), Error, bad);
  }
});

test("내부 · 예약 주소 대역을 막고 공개 주소는 허용한다", () => {
  for (const blocked of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "::1", "fe80::1", "fc00::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "0.0.0.0", "not-an-ip"]) {
    assert.equal(isBlockedAddress(blocked), true, blocked);
  }
  for (const open of ["140.82.112.3", "8.8.8.8", "2606:4700::6810:84e5"]) assert.equal(isBlockedAddress(open), false, open);
});

test("호스트가 내부 주소로 풀리면(재바인딩 포함) 하나라도 있으면 거부한다", async () => {
  await assert.rejects(resolveSafe("evil.example.com", async () => ["8.8.8.8", "127.0.0.1"]), /private or reserved/);
  assert.equal(await resolveSafe("ok.example.com", async () => ["140.82.112.3"]), "140.82.112.3");
  await assert.rejects(resolveSafe("none.example.com", async () => []), /did not resolve/);
});

test("ref 와 하위 경로: 옵션 · 상위 경로 · 절대 경로를 거부한다", () => {
  assert.equal(assertRef("v1.2.3"), "v1.2.3");
  assert.equal(assertRef("feature/a-b"), "feature/a-b");
  for (const bad of ["--upload-pack=x", "-b", "a..b", "a b", "a;b", "", "a//b", "x.lock"]) assert.throws(() => assertRef(bad), Error, bad);
  assert.equal(assertSubPath("packages/core/"), "packages/core");
  assert.equal(assertSubPath(undefined), "");
  for (const bad of ["../x", "a/../../x", "/etc", "a\\b", "a\0b"]) assert.throws(() => assertSubPath(bad), Error, bad);
});

test("클론 명령: 토큰은 argv 가 아니라 환경으로만, 훅 · 리다이렉트 · 서브모듈 차단, 부모 환경 미상속", () => {
  const url = parseRepoUrl("https://github.com/o/r");
  const { args, env, secrets } = buildClone({ url, ref: "main", destination: "/work/x", tokenEnv: "DUALCONTEXT_GIT_TOKEN", timeoutMs: 1, maxBytes: 1 }, "140.82.112.3", {
    PATH: "/usr/bin", DUALCONTEXT_GIT_TOKEN: "ghp_SECRET123", DUALCONTEXT_LLM_API_KEY: "llm-key"
  });
  assert.ok(!args.join(" ").includes("ghp_SECRET123"));
  assert.ok(!JSON.stringify(args).includes("SECRET"));
  assert.ok(args.includes("--depth") && args.includes("--no-recurse-submodules") && args.includes("http.followRedirects=false"));
  assert.ok(args.includes("http.curloptResolve=github.com:443:140.82.112.3"));
  assert.ok(args.indexOf("--") < args.indexOf("https://github.com/o/r"));
  assert.ok(env.GIT_CONFIG_VALUE_0?.startsWith("Authorization: Basic "));
  assert.equal(env.DUALCONTEXT_LLM_API_KEY, undefined);
  assert.equal(secrets[0], "ghp_SECRET123");
  assert.equal(redact("fatal: bad ghp_SECRET123 and " + secrets[1], secrets), "fatal: bad *** and ***");
});

test("클론 실패 메시지와 작업 폴더에 토큰이 남지 않고, 내부 주소 호스트는 git 을 부르기 전에 거부한다", async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), "cb-"));
  try {
    const destination = path.join(tmp, "work");
    const url = parseRepoUrl("https://github.com/o/r");
    const calls: string[][] = [];
    const run: Runner = async (args, _env, options) => {
      calls.push(args);
      await mkdir(destination, { recursive: true });
      return { code: 128, stdout: "", stderr: `fatal: could not read from ${options.secrets.length}\n` };
    };
    await assert.rejects(cloneShallow({ url, destination, timeoutMs: 1000, maxBytes: 1e6 }, { run, resolver: async () => ["140.82.112.3"] }), /git clone failed/);
    assert.deepEqual(await readdir(tmp), []);
    await assert.rejects(cloneShallow({ url, destination, timeoutMs: 1000, maxBytes: 1e6 }, { run, resolver: async () => ["10.0.0.1"] }), /private or reserved/);
    assert.equal(calls.length, 1);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test("설정 검증: git 은 안전한 url, directory 는 path 가 필요하고 토큰 변수 이름만 받는다", () => {
  assert.ok(codebaseConfigSchema.safeParse({ source: "git", url: "https://github.com/o/r", ref: "main", subPath: "src" }).success);
  assert.ok(!codebaseConfigSchema.safeParse({ source: "git", url: "https://tok@github.com/o/r" }).success);
  assert.ok(!codebaseConfigSchema.safeParse({ source: "git", url: "https://github.com/o/r", ref: "--x" }).success);
  assert.ok(!codebaseConfigSchema.safeParse({ source: "git", url: "https://github.com/o/r", tokenEnv: "ghp_abc" }).success);
  assert.ok(!codebaseConfigSchema.safeParse({ source: "directory" }).success);
  assert.ok(codebaseConfigSchema.safeParse({ source: "directory", path: "repos/app" }).success);
});

test("토큰화: camelCase · snake_case 를 나누고 전체 식별자도 남기며 한글은 버린다", () => {
  assert.deepEqual(tokenize("collectFolder"), ["collect", "folder", "collectfolder"]);
  assert.deepEqual(tokenize("max_file_bytes"), ["max", "file", "bytes", "max_file_bytes"]);
  assert.deepEqual(tokenize("flask url_for", true), ["flask", "url", "url_for"], "밑줄 이름의 전체 토큰은 불용어 조각(for)이 빠져도 남는다");
  assert.deepEqual(tokenize("폴더 조사원"), []);
  assert.deepEqual(tokenize("how does the login work", true), ["login"]);
});

async function fixture(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "cb-repo-"));
  await mkdir(path.join(root, "src", "auth"), { recursive: true });
  await mkdir(path.join(root, "node_modules", "x"), { recursive: true });
  await writeFile(path.join(root, "README.md"), "# Demo\nA small service with login and billing.\n");
  await writeFile(path.join(root, "src", "auth", "login.ts"), `import { hashPassword } from "./hash.js";\nimport { audit } from "../audit";\n\nexport function login(user: string, pass: string) {\n  const hash = hashPassword(pass);\n  audit("login", user);\n  return hash;\n}\n`);
  await writeFile(path.join(root, "src", "auth", "hash.ts"), `export function hashPassword(pass: string) {\n  return pass.split("").reverse().join("");\n}\n`);
  await writeFile(path.join(root, "src", "audit.ts"), `export const audit = (event: string, user: string) => {\n  console.log(event, user);\n};\n`);
  await writeFile(path.join(root, "src", "billing.py"), `import os\n\nclass Invoice:\n    def total(self):\n        return compute_tax(10)\n\ndef compute_tax(amount):\n    return amount * 2\n`);
  await writeFile(path.join(root, ".env"), "SECRET=abc\n");
  await writeFile(path.join(root, "node_modules", "x", "index.js"), "export function ignored() {}\n");
  return root;
}

test("스캔: node_modules · 비밀 파일 · 심볼릭 링크는 건너뛴다", async () => {
  const root = await fixture();
  try {
    let linked = true;
    await symlink(os.tmpdir(), path.join(root, "src", "escape")).catch(() => { linked = false; });
    const scan = await scanTree(root, limits());
    const names = scan.files.map((file) => file.path);
    assert.deepEqual(names, ["README.md", "src/audit.ts", "src/auth/hash.ts", "src/auth/login.ts", "src/billing.py"]);
    assert.ok(scan.skipped >= 2 + (linked ? 1 : 0));
    const small = await scanTree(root, { ...limits(), maxFiles: 2 });
    assert.equal(small.truncated, true);
    await assert.rejects(scanTree(root, { ...limits(), deadline: Date.now() - 1 }), /time limit/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("구조 인덱스: 심볼 · import · 호출 관계를 만들고 호출 이웃이 검색에 끌려온다", async () => {
  const root = await fixture();
  try {
    const index = buildIndex(await scanTree(root, limits()), { kind: "directory", label: "x" });
    const byName = (name: string) => index.symbols.find((symbol) => symbol.name === name);
    const login = byName("login");
    assert.ok(login && byName("hashPassword") && byName("audit") && byName("Invoice") && byName("compute_tax"));
    assert.deepEqual(login.calls.map((id) => index.symbols[id]?.name).sort(), ["audit", "hashPassword"]);
    assert.deepEqual(byName("hashPassword")?.calledBy, [login.id]);
    assert.equal(byName("total")?.kind, "method");
    assert.deepEqual(byName("total")?.calls.map((id) => index.symbols[id]?.name), ["compute_tax"]);
    const loginFile = index.files[login.file];
    assert.deepEqual(loginFile?.imports.map((id) => index.files[id]?.path).sort(), ["src/audit.ts", "src/auth/hash.ts"]);

    const hits = search(index, "hash password", 3);
    assert.equal(index.symbols[hits[0]?.id ?? -1]?.name, "hashPassword");
    // 어휘로는 안 맞는 audit 이 login 의 호출 이웃으로 끌려온다.
    const related = search(index, "login", 5).find((hit) => index.symbols[hit.id]?.name === "audit");
    assert.ok(related?.via !== undefined);
    assert.deepEqual(search(index, "폴더 조사원", 3), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("collectCodebase: 볼륨 안 폴더를 인덱싱해 구조가 붙은 자료를 돌려주고, 볼륨 밖 · pgdata · 인덱스 캐시는 거부한다", async () => {
  const data = await mkdtemp(path.join(os.tmpdir(), "cb-data-"));
  try {
    const repo = await fixture();
    await mkdir(path.join(data, "repos"), { recursive: true });
    const { cp } = await import("node:fs/promises");
    await cp(repo, path.join(data, "repos", "app"), { recursive: true });
    await rm(repo, { recursive: true, force: true });

    const materials = await collectCodebase(data, { source: "directory", path: "repos/app", topK: 3 }, "login password hashing");
    assert.ok(materials.length > 0);
    assert.match(materials[0]?.title ?? "", /src\/auth\/(hash|login)\.ts:\d+-\d+ function/);
    assert.ok(materials.some((material) => /calls: .*hashPassword/.test(material.text)));
    assert.ok((await readdir(path.join(data, "codebase"))).length === 1);

    for (const bad of ["../outside", "/etc", "pgdata/x", "codebase/abc", "."]) {
      await assert.rejects(collectCodebase(data, { source: "directory", path: bad }, "login"), Error, bad);
    }
  } finally {
    await rm(data, { recursive: true, force: true });
  }
});

test("볼륨 안 폴더 소스: 폴더를 가리키는 심볼릭 링크로 볼륨 밖을 읽을 수 없다", async () => {
  const data = await mkdtemp(path.join(os.tmpdir(), "cb-data-"));
  const outside = await mkdtemp(path.join(os.tmpdir(), "cb-out-"));
  try {
    await writeFile(path.join(outside, "secret.ts"), "export function leaked() {}\n");
    const linked = await symlink(outside, path.join(data, "link"), "junction").then(() => true, () => false);
    if (!linked) return;
    await assert.rejects(collectCodebase(data, { source: "directory", path: "link" }, "leaked"), /escapes/);
  } finally {
    await rm(data, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});
