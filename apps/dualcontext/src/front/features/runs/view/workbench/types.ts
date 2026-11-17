import type { Texts } from "../../../../i18n";
import type { RunDetail } from "../../../../lib/run";
import type { RunPhase } from "../phase";

/** 탭 패널 하나가 받는 것: 실행 상세(SSE 로 계속 갱신됨), 진행 단계, 문구. */
export type PanelProps = { detail: RunDetail; phase: RunPhase; t: Texts };
