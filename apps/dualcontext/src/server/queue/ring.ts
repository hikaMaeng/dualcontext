/**
 * 실행(runKey)별 FIFO 들을 라운드로빈으로 당겨 가는 ready 큐. **ready 작업만** 담는다(지연 작업은 delayed.ts).
 * 공정성은 당겨 가는 순서일 뿐 몫 상한이 아니다: 한 실행만 남으면 그 실행의 작업이 모든 소비자에게 간다.
 * 키: runKey. 범위 · 수명: 큐 하나. 상한: 없음(요청을 거절하지 않는다). 비우는 쪽: 당겨 가면 빈 실행은 즉시 제거한다.
 */
export class RunRing<T extends { runKey: string; submittedAt: number }> {
  private readonly lanes = new Map<string, T[]>();
  private order: string[] = [];
  private cursor = 0;

  get size(): number {
    let total = 0;
    for (const lane of this.lanes.values()) total += lane.length;
    return total;
  }

  push(task: T): void {
    const lane = this.lanes.get(task.runKey);
    if (lane) lane.push(task);
    else {
      this.lanes.set(task.runKey, [task]);
      this.order.push(task.runKey);
    }
  }

  /** 다음 실행의 선두를 꺼낸다. 비어 있으면 undefined. */
  shift(): T | undefined {
    if (this.order.length === 0) return undefined;
    if (this.cursor >= this.order.length) this.cursor = 0;
    const key = this.order[this.cursor] as string;
    const lane = this.lanes.get(key) as T[];
    const task = lane.shift() as T;
    if (lane.length === 0) this.drop(key, this.cursor);
    else this.cursor += 1;
    return task;
  }

  /** 가장 오래 기다린 선두 작업의 제출 시각(없으면 null). aging 판정용. */
  oldestSubmittedAt(): number | null {
    let oldest: number | null = null;
    for (const lane of this.lanes.values()) {
      const head = lane[0];
      if (head && (oldest === null || head.submittedAt < oldest)) oldest = head.submittedAt;
    }
    return oldest;
  }

  /** 가장 오래 기다린 선두 작업을 꺼낸다(aging 승격). */
  shiftOldest(): T | undefined {
    let pick: string | undefined;
    let at = Infinity;
    for (const [key, lane] of this.lanes) {
      const head = lane[0];
      if (head && head.submittedAt < at) {
        at = head.submittedAt;
        pick = key;
      }
    }
    if (pick === undefined) return undefined;
    const lane = this.lanes.get(pick) as T[];
    const task = lane.shift() as T;
    if (lane.length === 0) this.drop(pick, this.order.indexOf(pick));
    return task;
  }

  remove(task: T): boolean {
    const lane = this.lanes.get(task.runKey);
    const index = lane ? lane.indexOf(task) : -1;
    if (!lane || index < 0) return false;
    lane.splice(index, 1);
    if (lane.length === 0) this.drop(task.runKey, this.order.indexOf(task.runKey));
    return true;
  }

  drain(): T[] {
    const all = [...this.lanes.values()].flat();
    this.lanes.clear();
    this.order = [];
    this.cursor = 0;
    return all;
  }

  private drop(key: string, orderIndex: number): void {
    this.lanes.delete(key);
    if (orderIndex >= 0) {
      this.order.splice(orderIndex, 1);
      if (orderIndex < this.cursor) this.cursor -= 1;
    }
  }
}
