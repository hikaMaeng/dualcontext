export type ServerEnv = {
  port: number;
  nodeEnv: "development" | "test" | "production";
  databaseUrl: string;
  /** 볼륨 마운트 경로. 폴더 조사원은 이 아래만 읽을 수 있다. */
  dataDir: string;
  /** 모델 엔드포인트 API 키. 없으면 키 없이 호출한다. DB 에는 저장하지 않는다. */
  llmApiKey: string;
};

/**
 * 내부 전용 listener 포트(MCP stdio 프로세스가 중계하는 곳). 컨테이너 안 loopback 에만 열고 compose 에서 게시하지 않는다.
 * 기본은 PORT + 1 이다: 서버 프로세스와 `docker exec` 로 뜨는 stdio 프로세스가 같은 환경에서 같은 값을 계산한다.
 * DB 설정이 필요 없으므로 stdio 프로세스도 이 함수만 쓴다.
 */
export function readInternalPort(source: NodeJS.ProcessEnv = process.env): number {
  const raw = source.DUALCONTEXT_INTERNAL_PORT;
  const port = raw !== undefined && raw !== "" ? Number(raw) : Number(source.PORT) + 1;
  if (!Number.isInteger(port) || port < 10000 || port > 59999) throw new Error("DUALCONTEXT_INTERNAL_PORT (default PORT + 1) must be an integer from 10000 to 59999");
  return port;
}

export function readEnv(source: NodeJS.ProcessEnv = process.env): ServerEnv {
  const rawPort = source.PORT;
  const parsedPort = Number(rawPort);

  if (!Number.isInteger(parsedPort) || parsedPort < 10000 || parsedPort > 59999) {
    throw new Error("PORT must be an integer from 10000 to 59999");
  }

  const nodeEnv = source.NODE_ENV ?? "development";
  if (nodeEnv !== "development" && nodeEnv !== "test" && nodeEnv !== "production") {
    throw new Error("NODE_ENV must be development, test, or production");
  }

  const databaseUrl = source.DUALCONTEXT_DATABASE_URL;
  if (!databaseUrl || !/^postgres(ql)?:\/\//.test(databaseUrl)) {
    throw new Error("DUALCONTEXT_DATABASE_URL must be a postgresql:// URL");
  }

  const dataDir = source.DUALCONTEXT_DATA_DIR;
  if (!dataDir || !dataDir.startsWith("/")) {
    throw new Error("DUALCONTEXT_DATA_DIR must be an absolute path");
  }

  return {
    port: parsedPort,
    nodeEnv,
    databaseUrl,
    dataDir,
    llmApiKey: source.DUALCONTEXT_LLM_API_KEY ?? ""
  };
}
