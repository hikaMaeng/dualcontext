import { realpath } from "node:fs/promises";
import path from "node:path";

/** 브랜치 · 태그 이름: 옵션처럼 보이는 앞 하이픈, 상위 경로(..), 공백 · 제어 문자를 막는다. */
export function assertRef(ref: unknown): string {
  if (typeof ref !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._/-]{0,99}$/.test(ref) || ref.includes("..") || ref.includes("//") || ref.endsWith("/") || ref.endsWith(".lock")) {
    throw new Error("ref must be a plain branch or tag name");
  }
  return ref;
}

/** 레포 안 하위 경로(상대, posix). 절대 경로 · .. · 역슬래시 · NUL 을 막는다. 빈 문자열은 레포 전체. */
export function assertSubPath(subPath: unknown): string {
  if (subPath === undefined || subPath === "") return "";
  if (typeof subPath !== "string" || subPath.length > 200 || subPath.includes("\0") || subPath.includes("\\") || subPath.startsWith("/")) throw new Error("sub path must be a relative posix path");
  const parts = subPath.split("/").filter((part) => part !== "" && part !== ".");
  if (parts.some((part) => part === "..")) throw new Error("sub path must not leave the repository");
  return parts.join("/");
}

/** 기준 폴더 안에 있는 경로인지 실제 경로(심볼릭 링크 해석 후)로 확인하고 그 실제 경로를 돌려준다. */
export async function resolveInside(base: string, relative: string): Promise<string> {
  const realBase = await realpath(base);
  const realTarget = await realpath(path.resolve(realBase, relative));
  const inside = path.relative(realBase, realTarget);
  if (inside.startsWith("..") || path.isAbsolute(inside)) throw new Error("path escapes the base folder");
  return realTarget;
}
