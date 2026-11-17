import { useSyncExternalStore } from "react";
import { parseResearchersHash, type ResearchersRoute } from "./index";

const subscribe = (onChange: () => void) => {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
};
const snapshot = () => window.location.hash;

/** 주소창의 해시를 구독해 현재 경로를 돌려준다. 뒤로가기도 해시 변화라 그대로 따라간다. */
export function useResearchersRoute(): ResearchersRoute {
  const hash = useSyncExternalStore(subscribe, snapshot, () => "");
  return parseResearchersHash(hash);
}
