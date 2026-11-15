import type pg from "pg";
import { ensureRouterConfig } from "../routing/config/index.js";
import { procedurePresets } from "./presets/procedures.js";
import { researcherPresets } from "./presets/researchers.js";

// 기본값은 SQL 이 아니라 여기서 넣는다. 긴 한국어 프롬프트를 SQL 문자열로 두지 않고,
// 이미 있는 행(관리자가 고친 값)은 절대 덮어쓰지 않는다(ON CONFLICT DO NOTHING).

const batchWriterPrompt = `너는 라이터다. 아래 질의에 대해, 조사원이 모은 자료와 그 자료에 묶인 프로시저(사람이 써 둔 분석 절차와 추출할 임팩트 기준)를 받아 다음 단계가 사용할 컨텍스트를 작성한다.

규칙:
- 분석 기준은 프로시저의 절차와 임팩트만 따른다. 기준을 스스로 만들지 않는다.
- 자료를 프로시저 기준으로 다시 분류·선별·종합한다.
- 모든 주장에 근거와 출처를 붙인다.
- 자료가 부족하거나 쌍 사이에 모순이 있으면 「부족한 항목」에 밝힌다.
- 질의와 관련 없는 자료는 버린다. 관련 자료가 하나도 없으면 「관련 자료 없음」 한 줄만 쓴다.
- 결과는 다음 단계가 참고하는 자료다. 지시하거나 단정하지 말고 자료가 말하는 범위만 전하며, 출처 번호([R12-1] 형식)를 그대로 유지한다.

질의: {{query}}

(조사원 결과, 프로시저) 쌍:
{{pairs}}`;

const perPairWriterPrompt = `너는 라이터다. 아래 질의에 대해, 조사원 하나가 모은 자료와 그 자료에 묶인 프로시저 하나를 받아 컨텍스트 조각을 작성한다.

규칙:
- 분석 기준은 프로시저의 절차와 임팩트만 따른다. 기준을 스스로 만들지 않는다.
- 자료를 프로시저 기준으로 분류·선별·종합하고 근거와 출처를 붙인다.
- 자료가 부족하면 「부족한 항목」에 밝힌다.
- 질의와 관련 없는 자료는 버린다. 관련 자료가 하나도 없으면 「관련 자료 없음」 한 줄만 쓴다.
- 결과는 다음 단계가 참고하는 자료다. 지시하거나 단정하지 말고 자료가 말하는 범위만 전하며, 출처 번호([R12-1] 형식)를 그대로 유지한다.

질의: {{query}}

(조사원 결과, 프로시저) 쌍:
{{pair}}`;

/** 사전 정의 프로시저와 조사원을 한 번만 넣는다. 지운 프리셋이 재시작마다 되살아나지 않도록 표식을 남긴다. */
async function ensurePresets(pool: pg.Pool) {
  const marker = await pool.query("insert into seed_state (name) values ('presets-v1') on conflict do nothing");
  if (marker.rowCount === 0) return;
  for (const preset of procedurePresets) {
    await pool.query(
      `insert into procedures (name, applies_when, steps, impacts, output_format) values ($1, $2, $3, $4, $5) on conflict (name) do nothing`,
      [preset.name, preset.appliesWhen, preset.steps, preset.impacts, preset.outputFormat]
    );
  }
  for (const preset of researcherPresets) {
    const { rows } = await pool.query<{ id: number }>(
      `insert into researchers (name, description, keywords, type, config, router) values ($1, $2, $3, $4, $5, $6)
       on conflict (name) do nothing returning id`,
      [preset.name, preset.description, preset.keywords, preset.type, preset.config, preset.router ? JSON.stringify(preset.router) : null]
    );
    if (rows.length === 0) continue;
    for (const [position, procedureName] of preset.procedures.entries()) {
      await pool.query(
        `insert into researcher_procedures (researcher_id, procedure_id, position)
         select $1, id, $3 from procedures where name = $2 on conflict do nothing`,
        [rows[0].id, procedureName, position]
      );
    }
  }
}

export async function ensureDefaults(pool: pg.Pool) {
  await ensureRouterConfig(pool);
  // 컨테이너에서 호스트의 로컬 모델 서버에 닿는 주소. 관리자가 AI 서버 설정에서 바꾼다.
  await pool.query(
    `insert into ai_server (id, embedding_base_url, embedding_model, chat_base_url, chat_model)
     values (1, 'http://host.docker.internal:12345/v1', 'embeddinggemma2:mp', 'http://host.docker.internal:18180/v1', 'qwen36-35b')
     on conflict (id) do nothing`
  );
  const writers: [string, string, string, string, boolean][] = [
    ["기본 조립", "template", "batch", "", true],
    ["일괄 종합(LLM)", "llm", "batch", batchWriterPrompt, false],
    ["쌍별 종합(LLM)", "llm", "per_pair", perPairWriterPrompt, false]
  ];
  for (const [name, engine, mode, prompt, active] of writers) {
    // active 는 아무 라이터도 활성이 아닐 때만 켠다(부분 유니크 인덱스를 어기지 않도록).
    await pool.query(
      `insert into writers (name, engine, mode, prompt, active)
       values ($1, $2, $3, $4, $5 and not exists (select 1 from writers where active))
       on conflict (name) do nothing`,
      [name, engine, mode, prompt, active]
    );
  }
  await ensurePresets(pool);
}
