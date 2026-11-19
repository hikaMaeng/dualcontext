/**
 * 조사원 수집 큐의 종류와 소비자(일꾼) 수. 소비자 수 = 그 종류의 수집이 동시에 처리하는 호출의 상한(부하의 상한)이다.
 * 큐는 모든 요청을 받으므로 아이템 · 조사원이 아무리 많이 동시에 발동해도 실제 부하는 이 수에 묶인다.
 *
 * - web      덕덕고 HTML 요청. 외부 서비스를 정중히 쓴다(봇 차단 방지). 기본 2.
 * - store    pgvector · 폴더 조사원의 DB 조회. DB 풀(10)을 수집이 독점해 실행 기록 쓰기와 관리자 API 를 굶기지 않게 한다. 기본 6.
 * - crawl    크롤러 조사원(헤드리스 브라우저 렌더링 + 크롤 갱신). 무겁다. 기본 2.
 * - codebase 코드베이스 조사원(git 클론 · 폴더 읽기 · 색인 · 검색). 무겁고 호스트 파일 공유를 지나간다. 기본 2.
 */
export const collectKinds = ["web", "store", "crawl", "codebase"] as const;
export type CollectKind = (typeof collectKinds)[number];

const positiveInt = (name: string, fallback: number): number => {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isInteger(value) && value > 0 ? value : fallback;
};

const defaults: Record<CollectKind, number> = { web: 2, store: 6, crawl: 2, codebase: 2 };

/** 환경 변수 DUALCONTEXT_COLLECT_<KIND>_WORKERS 로 바꾼다(양의 정수만 적용, 아니면 기본값). */
export function defaultCollectWorkers(): Record<CollectKind, number> {
  return {
    web: positiveInt("DUALCONTEXT_COLLECT_WEB_WORKERS", defaults.web),
    store: positiveInt("DUALCONTEXT_COLLECT_STORE_WORKERS", defaults.store),
    crawl: positiveInt("DUALCONTEXT_COLLECT_CRAWL_WORKERS", defaults.crawl),
    codebase: positiveInt("DUALCONTEXT_COLLECT_CODEBASE_WORKERS", defaults.codebase)
  };
}
