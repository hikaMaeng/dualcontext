import type pg from "pg";
import type { Pair, WriterConfig } from "dualcontext_domain/common";
import { describeProvided, isWebSource, webSectionNote, webSectionTitle, writeContext, type Provided } from "dualcontext_domain/server";
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

/** LLM 라이터 입력. 웹 검색 쌍은 머리에 성격을 밝혀(큐레이션 쌍 뒤에 놓는다) 모델이 비중을 정하게 한다. */
export function describePairs(pairs: Pair[]): string {
  return pairs
    .map((pair, index) => {
      const web = isWebSource(pair.researcher);
      const lines = [`### 쌍 ${index + 1}${web ? ` [${webSectionTitle}]` : ""}`, `조사원: ${pair.researcher.name} (${pair.researcher.description})`];
      if (web) lines.push(`자료 성격: ${webSectionNote}`);
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

/**
 * LLM 라이터 프롬프트를 채운다. 사전 컨텍스트(provided)가 있으면 모델이 반영하도록 넣는다:
 * 프롬프트에 {{provided}} 가 있으면 그 자리에, 없으면 첫 {{query}} 바로 뒤에(질의를 읽은 직후 배경으로 읽히게),
 * {{query}} 도 없으면 맨 끝에 붙인다. 사전 컨텍스트가 없으면 {{provided}} 는 빈 문자열이고 나머지는 이전과 같은 글이다.
 */
export function fillWriterPrompt(template: string, query: string, pairs: Pair[], provided?: Provided[]): string {
  const text = describePairs(pairs);
  const block = describeProvided(provided).join("\n").trimEnd();
  let placed = block === "" || /\{\{provided\}\}/.test(template);
  const filled = template.replace(/\{\{(\w+)\}\}/g, (_m, key: string) => {
    if (key === "query" && !placed) {
      placed = true;
      return `${query}\n\n${block}\n`;
    }
    return ({ query, pairs: text, pair: text, provided: block } as Record<string, string>)[key] ?? "";
  });
  return placed ? filled : `${filled}\n\n${block}`;
}

/** 라이터 설정을 도메인이 쓰는 {mode, write} 로 만든다. provided 는 계획기가 넘기는 사전 컨텍스트다(classic 경로는 넘기지 않는다). */
export function createWriter(model: ModelClient, config: WriterConfig | null) {
  if (!config || config.engine === "template") {
    return { mode: config?.mode ?? "batch", write: (query: string, pairs: Pair[], provided?: Provided[]) => writeContext(query, pairs, provided) };
  }
  return {
    mode: config.mode,
    async write(query: string, pairs: Pair[], provided?: Provided[]): Promise<string> {
      const prompt = fillWriterPrompt(config.prompt, query, pairs, provided);
      try {
        return await model.chat(prompt);
      } catch (error) {
        // LLM 라이터 실패를 숨기지 않는다: 결정적 조립 결과 앞에 실패 사실을 적는다.
        const reason = error instanceof Error ? error.message : String(error);
        return `[라이터 LLM 호출 실패: ${reason.slice(0, 120)} - 기본 조립으로 대체]\n\n${writeContext(query, pairs, provided)}`;
      }
    }
  };
}
