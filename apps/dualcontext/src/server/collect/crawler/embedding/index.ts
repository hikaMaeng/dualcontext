/**
 * 크롤러의 임베딩 계약: (1) 작업 하나가 같은 임베딩 설정을 끝까지 쓰고, (2) 저장 · 질의하는 벡터는 검증을 거친다.
 */

/** 임베딩 호출 포트(모델 클라이언트의 일부). `embed` 는 호출마다 설정을 다시 읽으므로 고정은 이 파일의 `pinEmbedder` 가 한다. */
export type EmbeddingPort = {
  settings(): Promise<{ embedding: { baseUrl: string; model: string } }>;
  embed(texts: string[]): Promise<number[][]>;
  /** 모델 클라이언트(`ModelClient.pinned`)가 있으면 설정을 읽은 그 값으로 **고정한** 클라이언트를 돌려준다(이후 호출이 설정을 다시 읽지 않는다). */
  pinned?(ai: never): { embed(texts: string[]): Promise<number[][]> };
};

export class EmbeddingSettingsChanged extends Error {}

/** 작업 시작 때 한 번 읽어 고정한 임베딩 설정과 그 설정으로만 호출하는 `embed`. */
export type PinnedEmbedder = {
  /** `embedding_key` 로 저장하는 값: 기존 형식인 모델 이름(배포 때 청크가 다시 임베딩되지 않도록 유지). endpoint 만 바뀌는 경우는 알려진 한계다. */
  key: string;
  baseUrl: string;
  embed(texts: string[]): Promise<number[][]>;
};

/**
 * 임베딩 설정(endpoint · 모델)을 한 번 읽어 고정한다. 백필 · 질의 벡터 · `embedding_key` 가 모두 이 값을 쓴다.
 * 모델 클라이언트의 `embed` 는 호출마다 설정을 읽으므로, 고정은 **호출 앞뒤로 설정이 같은지 확인**하는 방식이다:
 * 호출 중에 설정이 바뀐 것이 보이면 그 벡터를 버리고 `EmbeddingSettingsChanged` 로 끝낸다(다른 모델의 벡터가 이 키로 저장되지 않는다).
 * A→B→A 로 되돌아오는 변경은 못 잡는다(잔여 한계).
 */
export async function pinEmbedder(port: EmbeddingPort): Promise<PinnedEmbedder> {
  const settings = await port.settings();
  const pinned = settings.embedding;
  // 모델 클라이언트가 고정을 지원하면 그것을 쓴다: 설정을 한 번 읽은 값으로만 호출하므로 A→B→A 로 되돌아오는 변경에도 안전하다.
  if (typeof port.pinned === "function") {
    const fixed = port.pinned(settings as never);
    return { key: pinned.model, baseUrl: pinned.baseUrl, embed: (texts) => fixed.embed(texts) };
  }
  const unchanged = async () => {
    const now = (await port.settings()).embedding;
    return now.model === pinned.model && now.baseUrl === pinned.baseUrl;
  };
  return {
    key: pinned.model,
    baseUrl: pinned.baseUrl,
    async embed(texts) {
      if (!(await unchanged())) throw new EmbeddingSettingsChanged("embedding settings changed while the crawler job was running");
      const vectors = await port.embed(texts);
      if (!(await unchanged())) throw new EmbeddingSettingsChanged("embedding settings changed while the crawler job was running");
      return vectors;
    }
  };
}

/** float32 로 표현되는 가장 큰 유한값. pgvector 는 벡터 원소를 float32 로 저장한다. */
const float32Max = 3.4028234663852886e38;
/** pgvector `vector` 타입의 차원 상한. */
export const maxVectorDims = 16_000;

/**
 * 저장 · 질의 전 검증: 1차원 배열, 길이 1 이상 16000 이하, 원소는 유한한 숫자(NaN · ±Infinity · null 없음)이고 float32 범위 안.
 * (expectedDims 가 있으면 차원도 일치해야 한다.) 어긋나면 던진다.
 */
export function assertVector(vector: unknown, label: string, expectedDims?: number): asserts vector is number[] {
  if (!Array.isArray(vector)) throw new Error(`${label} must be a one-dimensional array`);
  if (vector.length < 1 || vector.length > maxVectorDims) throw new Error(`${label} must have 1 to ${maxVectorDims} dimensions`);
  if (expectedDims !== undefined && vector.length !== expectedDims) throw new Error(`${label} has ${vector.length} dimensions, expected ${expectedDims}`);
  for (const value of vector) {
    if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${label} contains a non-finite value`);
    if (Math.abs(value) > float32Max) throw new Error(`${label} contains a value outside the float32 range`);
  }
}

/** pgvector 의 텍스트 표기 `[a,b,c]`. 질의 벡터는 이 문자열로 바인딩해 `$n::text::vector` 로 캐스트한다. */
export const vectorLiteral = (vector: number[]): string => `[${vector.join(",")}]`;
