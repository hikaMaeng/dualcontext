import type { ReactNode } from "react";

/** 레이블 + 입력 한 쌍. 레이블이 입력을 감싸 접근 가능한 이름이 된다. */
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-1 text-sm text-muted">
      {label}
      {children}
    </label>
  );
}

/** 왼쪽 목록 + 오른쪽 폼의 관리 화면 골격. */
export function ListDetail({ listLabel, list, form }: { listLabel: string; list: ReactNode; form: ReactNode }) {
  return (
    <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
      <ul aria-label={listLabel} className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-2">
        {list}
      </ul>
      <div className="grid min-w-0 content-start gap-4">{form}</div>
    </div>
  );
}
