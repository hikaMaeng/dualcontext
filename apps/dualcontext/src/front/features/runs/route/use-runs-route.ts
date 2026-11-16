import { useSyncExternalStore } from "react";
import { parseRunsHash, type RunsRoute } from "./index";

const subscribe = (onChange: () => void) => {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
};
const snapshot = () => window.location.hash;

/** 주소창의 해시를 구독해 현재 목록 · 뷰 경로를 돌려준다. 뒤로가기도 해시 변화라 그대로 따라간다. */
export function useRunsRoute(): RunsRoute {
  const hash = useSyncExternalStore(subscribe, snapshot, () => "");
  return parseRunsHash(hash);
}
