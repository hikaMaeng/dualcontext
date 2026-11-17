import type { Texts } from "../../../../../i18n";
import type { RunDetail } from "../../../../../lib/run";
import type { RunGraph, RunGraphNode } from "../model";
import type { NodeDoc } from "../use-node-detail";

/** 노드 상세 본문(종류별 컴포넌트)이 받는 것. */
export type KindProps = {
  run: RunDetail;
  graph: RunGraph;
  node: RunGraphNode;
  /** 서버에 저장된 이 노드의 상세 문서(없을 수 있다). */
  doc: NodeDoc;
  /** 이 실행이 진행 중인가. */
  running: boolean;
  /** 다른 노드를 고른다(이름 링크). */
  onSelect: (id: string) => void;
  t: Texts;
};
