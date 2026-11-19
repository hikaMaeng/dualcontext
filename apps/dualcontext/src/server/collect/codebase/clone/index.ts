import { spawn } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { reasonOf } from "../../abort/index.js";
import { resolveSafe, type Lookup } from "../guard/index.js";
import { treeSize } from "../scan/size.js";

export type CloneRequest = {
  url: URL;
  ref?: string;
  /** 비어 있어야 하는(아직 없는) 새 폴더. 클론이 실패하면 지운다. */
  destination: string;
  /** 토큰을 담은 환경 변수의 이름. 값은 argv · 파일 · 로그에 쓰지 않고 git 의 환경 설정으로만 넘긴다. */
  tokenEnv?: string;
  timeoutMs: number;
  maxBytes: number;
  /** 이 클론 작업 자신의 신호: 취소되면 부모가 git 자식을 죽이고 종료를 확인한 뒤 취소 오류로 끝난다. */
  signal?: AbortSignal;
};

export type RunResult = { code: number; stdout: string; stderr: string };
export type Runner = (args: string[], env: Record<string, string>, options: { timeoutMs: number; secrets: string[]; watch?: () => Promise<boolean>; signal?: AbortSignal }) => Promise<RunResult>;

const outputCap = 64_000;
/** 서버는 리눅스(/dev/null)다. 윈도우 호스트에서 돌려 보는 경우에만 NUL 이다(os.devNull 의 백슬래시 경로는 git 설정 경로로 못 쓴다). */
const nullDevice = process.platform === "win32" ? "NUL" : "/dev/null";

/** 값에서 비밀(토큰, 그 base64)을 가린다. 오류 메시지와 로그에 들어가기 전에 모두 이 함수를 거친다. */
export function redact(text: string, secrets: string[]): string {
  let result = text;
  for (const secret of secrets) {
    if (secret.length >= 4) result = result.split(secret).join("***");
  }
  return result;
}

/**
 * git 에 줄 인자와 환경을 만든다. 클론한 코드는 실행하지 않는다: 훅 · fsmonitor 끄기, 서브모듈 안 받기,
 * 심볼릭 링크를 링크로 만들지 않기, 리다이렉트 안 따라가기, https 외 프로토콜 금지, 부모 프로세스 환경(키 포함) 미상속.
 */
export function buildClone(request: CloneRequest, address: string, source: NodeJS.ProcessEnv = process.env): { args: string[]; env: Record<string, string>; secrets: string[] } {
  const host = request.url.hostname.replace(/^\[|\]$/g, "");
  const args = [
    "-c", "core.hooksPath=" + nullDevice, "-c", "core.fsmonitor=false", "-c", "core.symlinks=false", "-c", "protocol.version=2",
    "-c", "http.followRedirects=false", "-c", `http.curloptResolve=${host}:443:${address}`,
    "clone", "--depth", "1", "--single-branch", "--no-tags", "--no-recurse-submodules", "--quiet"
  ];
  if (request.ref !== undefined) args.push("--branch", request.ref);
  args.push("--", request.url.href, request.destination);

  const env: Record<string, string> = {
    PATH: source.PATH ?? source.Path ?? "",
    HOME: os.tmpdir(),
    LANG: "C",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: nullDevice,
    GIT_TERMINAL_PROMPT: "0",
    GIT_ALLOW_PROTOCOL: "https"
  };
  if (source.SystemRoot !== undefined) env.SystemRoot = source.SystemRoot;

  const secrets: string[] = [];
  const token = request.tokenEnv === undefined ? undefined : source[request.tokenEnv];
  if (token !== undefined && token !== "") {
    const basic = Buffer.from(`x-access-token:${token}`).toString("base64");
    env.GIT_CONFIG_COUNT = "1";
    env.GIT_CONFIG_KEY_0 = "http.extraHeader";
    env.GIT_CONFIG_VALUE_0 = `Authorization: Basic ${basic}`;
    secrets.push(token, basic);
  }
  return { args, env, secrets };
}

/** 기본 실행기: git 을 셸 없이 argv 로 띄우고, 시간 상한과 출력 상한을 둔다. */
export const runGit: Runner = (args, env, options) =>
  new Promise((resolve, reject) => {
    const child = spawn("git", args, { env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let stdout = "";
    let stderr = "";
    let reason = "";
    const stop = (why: string) => {
      reason = why;
      child.kill("SIGKILL");
    };
    const timer = setTimeout(() => stop("git timed out"), options.timeoutMs);
    // 부모가 클론 자식을 직접 끝낸다: 신호가 취소되면 git 을 죽이고, 종료를 확인한 뒤(close) 취소 오류로 끝난다.
    let aborted = false;
    const onAbort = () => {
      aborted = true;
      child.kill("SIGKILL");
    };
    options.signal?.addEventListener("abort", onAbort, { once: true });
    if (options.signal?.aborted) onAbort();
    const poll = options.watch
      ? setInterval(() => void options.watch?.().then((over) => over && stop("repository is larger than the size limit"), () => undefined), 2000)
      : undefined;
    child.stdout.on("data", (chunk: Buffer) => { if (stdout.length < outputCap) stdout += chunk.toString("utf8"); });
    child.stderr.on("data", (chunk: Buffer) => { if (stderr.length < outputCap) stderr += chunk.toString("utf8"); });
    child.on("error", (error) => { clearTimeout(timer); clearInterval(poll); options.signal?.removeEventListener("abort", onAbort); reject(new Error(redact(error.message, options.secrets))); });
    child.on("close", (code) => {
      clearTimeout(timer);
      clearInterval(poll);
      options.signal?.removeEventListener("abort", onAbort);
      if (aborted && options.signal !== undefined) return reject(reasonOf(options.signal));
      if (reason !== "") return reject(new Error(reason));
      resolve({ code: code ?? 1, stdout: redact(stdout, options.secrets), stderr: redact(stderr, options.secrets) });
    });
  });

/**
 * 공개 레포를 얕게(깊이 1) 클론한다. 호스트가 내부 주소로 풀리면 클론하기 전에 거부하고,
 * 성공하면 커밋 해시를 읽고 .git 을 지워 작업 트리만 남긴다. 실패하면 destination 을 지운다.
 */
export async function cloneShallow(request: CloneRequest, deps: { run?: Runner; resolver?: Lookup } = {}): Promise<{ commit: string }> {
  const run = deps.run ?? runGit;
  const address = await resolveSafe(request.url.hostname, deps.resolver);
  const { args, env, secrets } = buildClone(request, address);
  await mkdir(path.dirname(request.destination), { recursive: true });
  try {
    const result = await run(args, env, { timeoutMs: request.timeoutMs, secrets, signal: request.signal, watch: async () => (await treeSize(request.destination, request.maxBytes)) > request.maxBytes });
    if (result.code !== 0) {
      const firstLine = result.stderr.split("\n").find((line) => line.trim() !== "") ?? "";
      throw new Error(`git clone failed: ${firstLine.slice(0, 200)}`);
    }
    const head = await run(["-C", request.destination, "rev-parse", "HEAD"], env, { timeoutMs: 10_000, secrets });
    const commit = /^[0-9a-f]{40,64}$/.test(head.stdout.trim()) ? head.stdout.trim() : "";
    await rm(path.join(request.destination, ".git"), { recursive: true, force: true });
    return { commit };
  } catch (error) {
    await rm(request.destination, { recursive: true, force: true });
    throw error;
  }
}
