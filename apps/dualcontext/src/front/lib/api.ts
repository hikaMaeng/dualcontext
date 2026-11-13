/** 관리자 API 호출. 실패하면 서버가 돌려준 본문과 함께 던진다. */
export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const response = await fetch(`/api/admin${path}`, {
    method: init.method ?? "GET",
    headers: { "content-type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body)
  });
  if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}

/** 폼의 여러 줄·쉼표 입력을 항목 배열로 바꾼다. */
export function splitList(text: string, separator: RegExp): string[] {
  return text.split(separator).map((item) => item.trim()).filter((item) => item !== "");
}
