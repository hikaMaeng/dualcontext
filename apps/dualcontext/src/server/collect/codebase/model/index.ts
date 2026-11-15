/** 코드베이스 조사원이 만들고 질의에 쓰는 구조 인덱스의 형태. 디스크(JSON)에 그대로 저장된다. */
export type SymbolKind = "function" | "method" | "class" | "interface" | "type" | "enum" | "struct" | "trait" | "module" | "doc";

export type FileNode = {
  path: string;
  language: string;
  lines: number;
  /** 이 파일이 import 하는 레포 안 파일(files 의 인덱스). 외부 패키지는 담지 않는다. */
  imports: number[];
};

export type SymbolNode = {
  id: number;
  file: number;
  name: string;
  kind: SymbolKind;
  line: number;
  endLine: number;
  /** 정의부 소스 일부(상한 있음). 질의 때 레포를 다시 읽지 않도록 인덱스가 들고 있다. */
  snippet: string;
  /** 이 심볼 본문이 이름으로 부르는 다른 심볼(symbols 의 인덱스). */
  calls: number[];
  calledBy: number[];
};

export type IndexSource = { kind: "git" | "directory"; label: string; ref?: string; subPath?: string; commit?: string };

export type CodeIndex = {
  version: 1;
  builtAt: string;
  source: IndexSource;
  stats: { files: number; symbols: number; callEdges: number; importEdges: number; skippedFiles: number; truncated: boolean };
  files: FileNode[];
  symbols: SymbolNode[];
};

export type Limits = {
  maxFiles: number;
  maxFileBytes: number;
  maxTotalBytes: number;
  /** epoch ms. 이 시각을 넘기면 스캔·클론을 중단한다. */
  deadline: number;
};
