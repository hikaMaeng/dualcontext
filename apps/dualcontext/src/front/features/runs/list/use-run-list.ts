import { useEffect, useState } from "react";
import { listRuns } from "../api";
import type { RunListPage } from "../api/types";
import type { ListQuery } from "../query";

const refreshMs = 5000;

/**
 * 조회 조건에 맞는 실행 로그 한 쪽을 읽는다. 조건이 바뀌면 다시 읽고(이전 쪽은 새 쪽이 올 때까지 남겨 깜빡이지 않게 한다),
 * 진행 중인 실행이 목록에 있는 동안은 주기적으로 새로 읽는다. 늦게 도착한 옛 응답은 버린다.
 */
export function useRunList(query: ListQuery): { data: RunListPage | null; failed: boolean; loading: boolean } {
  const [data, setData] = useState<RunListPage | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let stale = false;
    setLoading(true);
    listRuns(query)
      .then((page) => {
        if (stale) return;
        setData(page);
        setFailed(false);
      })
      .catch(() => {
        if (!stale) setFailed(true);
      })
      .finally(() => {
        if (!stale) setLoading(false);
      });
    return () => {
      stale = true;
    };
  }, [query, tick]);

  const anyRunning = data?.items.some((item) => item.status === "running") ?? false;
  useEffect(() => {
    if (!anyRunning) return;
    // 숨은 탭에서는 읽지 않고, 다시 보이는 순간 한 번 읽는다(의미 검색 중이면 폴링마다 서버가 질의를 다시 임베딩하므로 불필요한 호출을 줄인다).
    const timer = window.setInterval(() => {
      if (!document.hidden) setTick((n) => n + 1);
    }, refreshMs);
    const onVisible = () => {
      if (!document.hidden) setTick((n) => n + 1);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [anyRunning]);

  return { data, failed, loading };
}
