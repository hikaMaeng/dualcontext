import type { McpEffort } from "dualcontext_domain/common";
import type { Texts } from "../../../i18n";
import { RSC } from "../resource";

/** MCP 호출이 고른 effort 단계의 화면 문구. 목록 항목과 뷰 제목이 같이 쓴다. */
export function effortText(effort: McpEffort, t: Texts): string {
  switch (effort) {
    case "light":
      return t[RSC.RUNS_EFFORT_LIGHT_TEXT];
    case "middle":
      return t[RSC.RUNS_EFFORT_MIDDLE_TEXT];
    case "high":
      return t[RSC.RUNS_EFFORT_HIGH_TEXT];
    case "xhigh":
      return t[RSC.RUNS_EFFORT_XHIGH_TEXT];
  }
}
