import { monitorEventLoopDelay } from "node:perf_hooks";

/**
 * 이벤트 루프 지연(ms) 계측. 동기 CPU 작업이 루프를 막으면 여기 p99 · max 에 드러난다(LLM 호출 발행이 늦어지는 병렬성 손실의 직접 지표).
 * 히스토그램은 프로세스 시작부터 쌓고 snapshot() 이 읽은 뒤 비운다(읽은 구간의 값).
 */
const histogram = monitorEventLoopDelay({ resolution: 10 });
histogram.enable();

const ms = (nanoseconds: number) => Math.round((nanoseconds / 1e6) * 10) / 10;

export type EventLoopStats = { p50: number; p99: number; max: number; samples: number };

export function eventLoopSnapshot(): EventLoopStats {
  const stats = { p50: ms(histogram.percentile(50)), p99: ms(histogram.percentile(99)), max: ms(histogram.max), samples: histogram.count };
  histogram.reset();
  return stats;
}
