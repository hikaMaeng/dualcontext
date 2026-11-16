import { useEffect, useState } from "react";
import { loadFilterOptions } from "../../api";
import type { RunFilterOptions } from "../../api/types";

const none: RunFilterOptions = { researchers: [], procedures: [] };

/** 필터 선택지(`/runs/filters`)를 한 번 읽는다. 못 읽으면 선택지가 비고, 이미 고른 칩과 검색은 그대로 동작한다. */
export function useFilterOptions(): { options: RunFilterOptions; failed: boolean } {
  const [options, setOptions] = useState<RunFilterOptions>(none);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let stale = false;
    loadFilterOptions()
      .then((loaded) => !stale && setOptions(loaded))
      .catch(() => !stale && setFailed(true));
    return () => {
      stale = true;
    };
  }, []);
  return { options, failed };
}
