const maxQueryChars = 120;

const prompt = (query: string) => `다음 질의를 웹 검색엔진(덕덕고)에 넣을 검색어 한 줄로 바꿔라.

규칙:
- 공개 웹에 없는 내부 이름(사내 프로젝트 · 저장소 · 도구의 고유 이름)은 검색어에 넣지 않고, 그것이 가리키는 일반 개념어로 바꾸거나 뺀다. 알 수 없는 낱말을 둘로 쪼개 의미가 달라지게 쓰지 않는다.
- 질의의 핵심 주제와 찾고 싶은 것만 남긴다. 조사 · 말투 · 군더더기는 뺀다.
- 기술 용어는 영어가 검색에 유리하면 영어로 쓴다.
- 검색어 한 줄만 답한다. 설명 · 따옴표 · 목록은 쓰지 않는다.

질의: ${query}`;

/** 모델 답에서 검색어 한 줄만 꺼낸다. 비었거나 지나치게 길면 null. */
export function cleanQuery(answer: string): string | null {
  const line = answer.split("\n").map((part) => part.trim()).find((part) => part !== "") ?? "";
  const text = line.replace(/^(검색어|query)\s*[:：]\s*/i, "").replace(/^["'“”‘’`]+|["'“”‘’`]+$/g, "").trim();
  return text === "" || text.length > maxQueryChars ? null : text;
}

/**
 * 웹 검색에 보낼 검색어를 만든다. 질의 원문은 다른 조사원(코드 · 자료)용 문장이라 웹 검색어로는 맞지 않다
 * (실행 227: 내부 이름 vibeagent 가 「바이브 코딩」 글로 풀렸다). 모델이 실패하거나 답이 쓸 수 없으면 원문을 그대로 쓴다.
 * 어떤 검색어를 썼는지는 호출자가 자료에 남긴다.
 */
export async function webSearchQuery(chat: (prompt: string) => Promise<string>, query: string): Promise<string> {
  try {
    return cleanQuery(await chat(prompt(query))) ?? query;
  } catch {
    return query;
  }
}
