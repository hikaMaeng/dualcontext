import { NODE_TEXT_LIMIT, type LlmCall, type RunNodeDetail } from "dualcontext_domain/common";
import type { ModelClient } from "../../model/index.js";

/** 노드 문서 조각을 내보내는 곳. 같은 키가 여러 번 오면 받는 쪽이 필드별로 합친다(저장소가 jsonb 병합). */
export type NodeSink = (key: string, patch: Partial<Omit<RunNodeDetail, "key" | "at">>) => void;

/** limit 자를 넘으면 앞부분만 두고 「(이하 N자 생략)」 표식을 붙인다. */
export function clipText(text: string, limit: number = NODE_TEXT_LIMIT): { text: string; truncated: boolean } {
  if (text.length <= limit) return { text, truncated: false };
  return { text: `${text.slice(0, limit)}\n…(이하 ${text.length - limit}자 생략)`, truncated: true };
}

/**
 * 모델 클라이언트를 감싸 chat 호출(실제로 보낸 프롬프트 · 응답 · 오류 · 소요)을 모은다. 나머지 메서드(settings · embed · listModels …)는 그대로 위임한다.
 * 노드마다 따로 만들어 병렬 호출이 섞이지 않게 한다. 키: 호출 순서 seq(호출을 시작한 순서, 1부터). 범위 · 수명: 래퍼 하나(노드 하나).
 * 상한: 호출 수는 그 노드가 부른 만큼(라우팅 · 프로시저 · 라이터 몇 번)이고 글은 clipText 로 자른다. 비우는 쪽: 래퍼가 버려지면 함께.
 * calls() 는 끝난 호출만 seq 순으로 돌려준다(진행 중인 호출은 아직 없다).
 */
export function recordModel(model: ModelClient, purpose?: LlmCall["purpose"]): { model: ModelClient; calls: () => LlmCall[] } {
  const done: LlmCall[] = [];
  let seq = 0;
  const wrapped = {
    ...model,
    async chat(prompt: string): Promise<string> {
      seq += 1;
      const mine = seq;
      const at = new Date().toISOString();
      const started = Date.now();
      const sent = clipText(prompt);
      try {
        const response = await model.chat(prompt);
        const out = clipText(response);
        done.push({ seq: mine, ...(purpose ? { purpose } : {}), prompt: sent.text, response: out.text, ms: Date.now() - started, at, ...(sent.truncated || out.truncated ? { truncated: true } : {}) });
        return response;
      } catch (error) {
        done.push({ seq: mine, ...(purpose ? { purpose } : {}), prompt: sent.text, response: null, error: error instanceof Error ? error.message : String(error), ms: Date.now() - started, at, ...(sent.truncated ? { truncated: true } : {}) });
        throw error;
      }
    }
  } as ModelClient;
  return { model: wrapped, calls: () => [...done].sort((a, b) => a.seq - b.seq) };
}
