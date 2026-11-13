import type pg from "pg";
import type { Pair, WriterConfig } from "dualcontext_domain/common";
import { writeContext } from "dualcontext_domain/server";
import type { ModelClient } from "../model/index.js";

const columns = "id, name, engine, mode, prompt, active";

/** writerId 가 없으면 활성 라이터. 활성 라이터도 없으면 결정적 기본 조립으로 되돌아간다. */
export async function loadWriter(pool: pg.Pool, writerId?: number): Promise<WriterConfig | null> {
  const { rows } = await pool.query<WriterConfig>(
    writerId === undefined
      ? `select ${columns} from writers where active`
      : `select ${columns} from writers where id = $1`,
    writerId === undefined ? [] : [writerId]
  );
  return rows[0] ?? null;
}

function describePairs(pairs: Pair[]): string {
  return pairs
    .map((pair, index) => {
      const lines = [`### 쌍 ${index + 1}`, `조사원: ${pair.researcher.name} (${pair.researcher.description})`];
      if (pair.procedure) {
        lines.push(`프로시저: ${pair.procedure.name}`);
        lines.push(`절차: ${pair.procedure.steps.join(" / ")}`);
        lines.push(`추출할 임팩트: ${pair.procedure.impacts.join(" / ")}`);
        lines.push(`출력 형식: ${pair.procedure.outputFormat}`);
      } else lines.push("프로시저: 없음");
      if (pair.error) lines.push(`수집 오류: ${pair.error}`);
      lines.push("자료:", ...(pair.materials.length > 0 ? pair.materials.map((m) => `- [출처: ${m.title}] ${m.text}`) : ["- (없음)"]));
      return lines.join("\n");
    })
    .join("\n\n");
}

/** 라이터 설정을 도메인이 쓰는 {mode, write} 로 만든다. */
export function createWriter(model: ModelClient, config: WriterConfig | null) {
  if (!config || config.engine === "template") {
    return { mode: config?.mode ?? "batch", write: (query: string, pairs: Pair[]) => writeContext(query, pairs) };
  }
  return {
    mode: config.mode,
    async write(query: string, pairs: Pair[]): Promise<string> {
      const text = describePairs(pairs);
      const prompt = config.prompt.replace(/\{\{(\w+)\}\}/g, (_m, key: string) => ({ query, pairs: text, pair: text })[key] ?? "");
      try {
        return await model.chat(prompt);
      } catch (error) {
        // LLM 라이터 실패를 숨기지 않는다: 결정적 조립 결과 앞에 실패 사실을 적는다.
        const reason = error instanceof Error ? error.message : String(error);
        return `[라이터 LLM 호출 실패: ${reason.slice(0, 120)} - 기본 조립으로 대체]\n\n${writeContext(query, pairs)}`;
      }
    }
  };
}
