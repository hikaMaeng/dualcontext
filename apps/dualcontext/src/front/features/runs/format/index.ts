export const formatWhen = (iso: string): string => new Date(iso).toLocaleString();

export const formatSeconds = (ms: number): string => (ms / 1000).toFixed(1);

/** 이름 목록을 한 줄로 합친다. 비면 빈 문자열. */
export const joinNames = (names: string[]): string => names.join(", ");
