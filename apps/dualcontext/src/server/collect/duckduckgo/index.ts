import type { Material } from "dualcontext_domain/common";

const entities: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#x27;": "'", "&#39;": "'", "&nbsp;": " " };

function text(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/&[#\w]+;/g, (entity) => entities[entity] ?? entity).replace(/\s+/g, " ").trim();
}

/**
 * 덕덕고 검색 조사원. API 가 없어 HTML 결과 페이지를 읽는다. 페이지 구조가 바뀌면 깨질 수 있고,
 * 봇 차단(202 등)이 오면 오류로 올려 라이터가 부족한 항목으로 표시하게 한다.
 */
export async function collectDuckDuckGo(config: Record<string, unknown>, query: string): Promise<Material[]> {
  const topK = Number(config.topK ?? 5);
  const response = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
    headers: { "user-agent": "Mozilla/5.0 (compatible; dualcontext)", "accept-language": "ko,en;q=0.8" },
    signal: AbortSignal.timeout(20_000)
  });
  if (response.status !== 200) throw new Error(`DuckDuckGo answered ${response.status}`);
  const html = await response.text();

  const results: Material[] = [];
  const pattern = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
  for (const match of html.matchAll(pattern)) {
    const target = new URL(match[1].replace(/&amp;/g, "&"), "https://duckduckgo.com");
    const url = target.searchParams.get("uddg") ?? target.href;
    results.push({ title: `${text(match[2])} (${url})`, text: text(match[3]) });
    if (results.length >= topK) break;
  }
  return results;
}
