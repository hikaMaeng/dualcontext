/**
 * 재시도 대기(notBefore 가 미래인) 작업. 시각 순으로 정렬해 두고 타이머 하나로 깨운다.
 * 최솟값이 바뀔 때마다(삽입 · 취소 · 만료) 호출한 쪽이 `nextAt()` 으로 타이머를 다시 건다.
 * 키: 작업 객체. 수명: 큐 하나. 상한: 없음. 비우는 쪽: 만료 · 취소 · drain.
 */
export class DelayedSet<T extends { notBefore: number }> {
  private items: T[] = [];

  get size(): number {
    return this.items.length;
  }

  add(task: T): void {
    let low = 0;
    let high = this.items.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      if ((this.items[mid] as T).notBefore <= task.notBefore) low = mid + 1;
      else high = mid;
    }
    this.items.splice(low, 0, task);
  }

  remove(task: T): boolean {
    const index = this.items.indexOf(task);
    if (index < 0) return false;
    this.items.splice(index, 1);
    return true;
  }

  /** 가장 이른 시각(없으면 null). */
  nextAt(): number | null {
    return this.items.length === 0 ? null : (this.items[0] as T).notBefore;
  }

  /** now 이전에 만료된 작업을 시각 순으로 꺼낸다. */
  takeDue(now: number): T[] {
    let count = 0;
    while (count < this.items.length && (this.items[count] as T).notBefore <= now) count += 1;
    return this.items.splice(0, count);
  }

  drain(): T[] {
    const all = this.items;
    this.items = [];
    return all;
  }
}
