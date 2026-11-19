import { isRunAborted } from "../../../common/index.js";

/**
 * 시작한 분기가 **전부 정착한 뒤** 결과를 낸다. `Promise.all` 은 첫 reject 에서 바로 끝나 나머지 분기가 고아로 남는다.
 * 실패가 섞이면 RunAborted 가 이기고(종료 사유 확정), 그 밖에는 처음 실패를 던진다.
 */
export async function settled(promises: Promise<unknown>[]): Promise<void> {
  await settleAll(promises);
}

export async function settleAll<T>(promises: Promise<T>[]): Promise<T[]> {
  const settled = await Promise.allSettled(promises);
  const failures = settled.filter((entry): entry is PromiseRejectedResult => entry.status === "rejected").map((entry) => entry.reason);
  if (failures.length > 0) throw failures.find(isRunAborted) ?? failures[0];
  return settled.map((entry) => (entry as PromiseFulfilledResult<T>).value);
}
