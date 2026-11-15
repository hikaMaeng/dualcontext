import { isIP } from "node:net";
import { isBlockedAddress } from "./address.js";

const blockedSuffixes = [".localhost", ".local", ".internal", ".lan", ".home.arpa", ".intranet", ".corp"];

/**
 * 클론할 레포 URL 의 정적 검사. https 만, 계정 정보(user:token@) 금지, 기본 포트만, 점이 있는 공개 호스트만.
 * DNS 가 내부 주소로 풀리는지는 클론 직전에 따로 본다(resolveSafe).
 */
export function parseRepoUrl(raw: unknown): URL {
  if (typeof raw !== "string" || raw.trim() === "" || raw.length > 300) throw new Error("repository url is empty or too long");
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error("repository url is not a valid url");
  }
  if (url.protocol !== "https:") throw new Error("repository url must be https");
  // 토큰이 URL 에 들어 있으면 DB · 화면 · 로그로 새므로 저장 전에 막는다. 인증은 환경 변수로만 준다.
  if (url.username !== "" || url.password !== "") throw new Error("repository url must not contain credentials; use the token environment variable");
  if (url.port !== "") throw new Error("repository url must use the default https port");
  if (url.search !== "" || url.hash !== "") throw new Error("repository url must not have a query or fragment");
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "") throw new Error("repository url has no host");
  if (isIP(host) !== 0) {
    if (isBlockedAddress(host)) throw new Error("repository host is a private or reserved address");
  } else if (!host.includes(".") || host === "localhost" || blockedSuffixes.some((suffix) => host.endsWith(suffix))) {
    throw new Error("repository host must be a public host name");
  }
  if (!/^\/[\w.~%+-]+(\/[\w.~%+-]+)+(\.git)?\/?$/.test(url.pathname)) throw new Error("repository path must look like /owner/name");
  return url;
}

/** 화면 · 로그에 쓸 라벨: 호스트와 경로만. */
export function repoLabel(url: URL): string {
  return `${url.hostname}${url.pathname.replace(/\.git\/?$/, "").replace(/\/$/, "")}`;
}
