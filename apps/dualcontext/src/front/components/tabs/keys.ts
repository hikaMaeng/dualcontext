/**
 * 탭 목록의 키보드 이동. 좌우 화살표는 글쓰기 방향을 따라(오른쪽→왼쪽 언어에서는 반대로) 이웃 탭으로,
 * Home · End 는 처음 · 끝으로 가며 양 끝에서는 반대쪽으로 이어진다. 다른 키는 null(처리하지 않음).
 */
export function nextTabId(ids: string[], current: string, key: string, rtl: boolean): string | null {
  const at = ids.indexOf(current);
  if (at < 0 || ids.length === 0) return null;
  const step = key === "ArrowRight" ? (rtl ? -1 : 1) : key === "ArrowLeft" ? (rtl ? 1 : -1) : 0;
  if (step !== 0) return ids[(at + step + ids.length) % ids.length];
  if (key === "Home") return ids[0];
  if (key === "End") return ids[ids.length - 1];
  return null;
}
