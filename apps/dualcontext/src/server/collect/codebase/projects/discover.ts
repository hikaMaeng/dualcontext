import { readdir } from "node:fs/promises";

/** 프로젝트로 보지 않는 폴더: 숨김 폴더 · 의존성 · 빌드 산출물 폴더. */
const skipped = new Set(["node_modules", "dist", "build"]);
/** 이름이 너무 짧으면(예: "p4") 질의 속 우연한 글자와 겹친다. 이 길이 미만의 이름은 질의에 이름이 나와도 고른 것으로 치지 않는다. */
const minNameLength = 3;

/** root 바로 아래 폴더들의 이름(정렬). 심볼릭 링크는 따라가지 않는다. */
export async function listProjects(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith(".") && !skipped.has(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

const wordsOf = (text: string) => text.toLowerCase().split(/[^a-z0-9_.-]+/).filter(Boolean);

/**
 * 질의가 이름으로 가리킨 프로젝트. 질의의 영문 단어(대소문자 무시)가 프로젝트 이름과 같을 때만 고른다.
 * 부분 문자열 일치는 쓰지 않는다("p4" 가 "p4studio" 를 끌어오지 않도록).
 */
export function namedIn(query: string, names: string[]): string[] {
  const words = new Set(wordsOf(query));
  return names.filter((name) => name.length >= minNameLength && words.has(name.toLowerCase()));
}
