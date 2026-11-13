export type ServerEnv = {
  port: number;
  nodeEnv: "development" | "test" | "production";
  databaseUrl: string;
  /** 볼륨 마운트 경로. 폴더 조사원은 이 아래만 읽을 수 있다. */
  dataDir: string;
  /** 모델 엔드포인트 API 키. 없으면 키 없이 호출한다. DB 에는 저장하지 않는다. */
  llmApiKey: string;
};

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
