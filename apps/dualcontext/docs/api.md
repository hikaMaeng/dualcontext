# API

## MCP (stdio)

| 도구 | 인자 | 응답 |
| --- | --- | --- |
| `augment_context` | `query: string` (비어 있지 않음) | 증강된 컨텍스트 텍스트 |

도구는 이것 하나뿐이다. 붙는 방법은 `usage.md`.

## HTTP

| 경로 | 응답 |
| --- | --- |
| `GET /health`, `GET /api/health` | DB 왕복이 되면 `200 { status:"ok", service, database:"ok" }`, 안 되면 `503` |
| `GET /api/admin/status` | PostgreSQL · pgvector · textsearch_ko 버전, 한국어 설정 유무, 분석 예시 |
| `GET/POST /api/admin/researchers`, `PUT/DELETE /api/admin/researchers/:id` | 조사원. 본문 `{ name, description, keywords, enabled, type, config, procedureIds, router? }`. `router` 는 **개별 라우터**(`{ steps[] }`, 전역 라우터의 조사원 단계와 같은 모양, 1~6단계)이고 `null`(기본)이면 전역 라우터가 고른다. 응답에도 `router` 가 담긴다 |
| `GET/POST /api/admin/procedures`, `PUT/DELETE /api/admin/procedures/:id` | 프로시저 |
| `GET/PUT /api/admin/router` | 라우터 설정(질의 분해 + 단계별 라우팅 단계 파이프라인). `PUT` 본문은 아래 형태 그대로이며 zod 로 검증한다 |
| `GET /api/admin/router/defaults` | 기본 설정과 기본 프롬프트(`{ config, prompts: { researcher, procedure, split, individual } }`). 화면이 새 LLM 단계를 채울 때 쓴다 |
| `POST /api/admin/router/preview` | `{ query, config?, procedures? }`. 질의 하나의 라우팅만 돌린다(수집 · 라이터 없음). `config` 를 주면 **저장하지 않은 그 설정으로** 돌린다(저장된 설정은 그대로). `procedures: false` 면 2단계를 돌리지 않는다. 응답: `parts`(하위 질문), `selected`, `asked[]`(통째 질의와 하위 질문별 `selected · mode · steps[] · individual[]`; `individual` 은 개별 라우터를 가진 조사원마다 `{ researcher, selected, mode, steps[] }`), `scores`, `procedures[]`, `ms` |
| `GET/POST /api/admin/writers`, `PUT/DELETE /api/admin/writers/:id`, `POST /api/admin/writers/:id/activate` | 라이터 |
| `GET/PUT /api/admin/ai-server` | AI 서버 설정. 응답에 API 키는 없고 `hasApiKey` 만 있다 |
| `GET /api/admin/ai-server/models?kind=embedding\|chat` | 저장된 설정으로 서버의 모델 목록을 불러온다(연결 시험 겸용). 실패 시 `502` |
| `POST /api/admin/augment` | `{ query, writerId? }`. **비동기**: 실행 기록(`running`)을 만들고 즉시 `202 { runId, status }` 를 돌려준다. 작업은 서버에서 이어지며 단계(`augment` → `answering` → `done`)마다 기록을 갱신한다. 진행은 `GET /runs/:id`(폴링) 또는 `GET /runs/:id/events`(SSE)로 본다. `?wait=1` 이면 끝까지 기다려 `{ context, routing, researcherRouting, pairs, writer, answers, runId }` 를 돌려준다(스크립트 호환용, 증강 단계가 실패하면 `502 { error, runId }`). 증강 경로는 MCP 도구와 같고, 이어서 LLM 으로 **최종 답변 두 개**를 만든다: `answers.before`(질의만), `answers.after`(질의 + 컨텍스트). 컨텍스트가 비면 `answers.after = { skipped: true }` |
| `GET /api/admin/runs` | 시험 실행 로그 목록(최근 200건): `id, createdAt, query(앞 120자), status, durationMs, researcherRouting, pairCount, writerName` |
| `GET /api/admin/runs/:id` | 로그 상세(폴링용): 위 필드 + `status(running/ok/error), stage, error, routing(후보별 라우팅 점수), settings(실행 당시 설정 스냅샷, 답변 프롬프트 포함), pairs(자료 포함), context, answers`. 진행 중이면 아직 채워지지 않은 필드가 비어 있다(답변은 끝나는 대로 하나씩 채워진다) |
| `GET /api/admin/runs/:id/events` | SSE. 접속 즉시 현재 상태를 보내고, 상태가 바뀔 때마다 상세 행 전체를 `data:` 로 보낸 뒤 실행이 끝나면 스트림을 닫는다. 15초마다 `: keep-alive` 를 보낸다 |
| `DELETE /api/admin/runs/:id` | 로그 한 건 삭제. 실행 중이면 `409` |
| `GET /*` | 빌드된 프런트(SPA 폴백) |

요청 본문 검증은 zod 로 하고, 실패하면 `400`.

## MCP 응답

마땅한 조사원이 없으면(선택 0개, 또는 조사원은 골랐지만 자료가 하나도 모이지 않음) **컨텍스트를 공급하지 않는다**: `augment_context` 는 `content: []`(빈 결과)를 돌려준다. 호출한 쪽은 자기 지식으로 답한다.

## 라우터 설정(`/router`)

설정 하나는 문서(`router_config.pipeline` jsonb)다: **질의 분해 → 1단계(`researcher`) → 2단계(`procedure`)**. 각 단계(stage)는 라우팅 단계(step)의 **파이프라인**이다. 후보 전체에서 시작해 단계가 위에서 아래로 후보를 더 좁히며, 마지막 단계가 남긴 것이 선택이다. 단계가 후보를 비우면 남은 단계는 돌지 않는다(선택 없음).

```json
{
  "split": { "method": "heuristic", "maxParts": 4, "minChars": 12, "partTopK": 1, "prompt": "…" },
  "researcher": { "steps": [ { "type": "embedding", "topK": 3, "minScore": 0.67, "margin": 0.05, "parts": true, "onError": "keyword" } ] },
  "procedure":  { "steps": [ { "type": "embedding", "topK": 1, "minScore": 0, "margin": 1, "parts": true, "onError": "keyword" } ] }
}
```

| 필드 | 뜻 |
| --- | --- |
| `split.method` | `none`(나누지 않음) · `heuristic`(문장 끝 · 의문 어미 뒤 쉼표) · `llm`(LLM 이 나눔, 실패하면 heuristic 으로 대신) |
| `split.maxParts` · `minChars` · `partTopK` | 하위 질문 최대 개수(2~8) · 최소 글자(규칙 방식) · 하위 질문 하나에서 고르는 조사원 상한(1~5) |
| `split.prompt` | llm 방식 프롬프트. `{{query}}`, `{{maxParts}}` |
| `steps[]` (stage 당 1~6개) | 아래 단계 종류 |
| 공통 `parts` | 복합 질의의 **하위 질문에도** 이 단계를 적용한다. 끄면 통째 질의에만 쓴다(비싼 LLM 단계용). 하위 질문은 켜진 단계만 거치고 결과를 `partTopK` 개로 자른다 |
| 공통 `onError` | 단계가 실패했을 때(모델 서버 오류, 답 해석 실패): `skip`(이 단계를 건너뛰고 이어감) · `keyword`(이 단계 입력 후보로 키워드 라우팅) · `none`(아무것도 고르지 않음). 실패 사실은 단계 기록과 `mode` 에 남는다 |

| 단계 `type` | 필드 | 동작 |
| --- | --- | --- |
| `embedding` | `topK`, `minScore`(0~1), `margin`(0~1) | 질의와 후보 글의 코사인. `minScore` 미만, 최고 점수에서 `margin` 넘게 뒤처진 후보, 상위 `topK` 밖을 제외한다. `minScore` 0 · `margin` 1 이면 각 기준을 쓰지 않는다 |
| `keyword` | `topK` | 후보 키워드(프로시저는 적용 조건)가 질의에 들어 있는 정도의 상위 `topK`. 맞는 것이 없으면 **비운다**(`keyword-none`). 임의의 후보를 붙이지 않는다 |
| `llm` | `topK`, `prompt`, `showScores`, `allowNone` | 입력 후보 목록을 LLM 에 주고 id 배열로 고르게 한다. 프롬프트 변수 `{{query}}` `{{topK}}` `{{candidates}}`. `showScores` 면 앞 임베딩 단계의 유사도를 목록에 곁들인다. `allowNone` 이면 빈 배열(「없음」)을 존중하고, 아니면 빈 답은 무시하고 입력을 `topK` 개로 줄여 유지한다. 답에 id 배열이 없으면 실패다 |

`mode`(실행 로그의 「조사원 라우팅」)는 실제로 돈 단계들을 `>` 로 잇는다(예: `embedding>llm`). 실패한 단계는 `llm-failed(사유)->skip` 처럼 남는다. 각 단계의 입력 · 출력 후보 수와 걸린 시간(ms)은 `steps[]` 와 실행 로그 `routing.researcherSteps` 에 있다.

단계 설정이 생기기 전의 단일 방법 설정(`researcherMethod` 등)은 시작할 때 같은 동작의 한 단계로 **자동 변환**된다(이미 `pipeline` 이 있으면 건드리지 않는다).

## 조사원 `config`

| type | config |
| --- | --- |
| `duckduckgo` | `{ topK }` |
| `pgvector` | `{ table, vectorColumn, textColumn, titleColumn?, reducedColumn?, reducedDim?, snippetChars?, minScore?, idColumn?, identifierSearch?, topK }` — `reducedColumn` 이 있으면 축소 차원으로 후보 topK×8 을 뽑고 전체 차원으로 재순위화한다. `snippetChars`(100~8000, 기본 1200)는 컨텍스트에 싣는 자료 글자 수이며 문장 경계에서 자른다. `minScore`(0~1, 기본 0.72)는 자료(행) 단위 관련도 기준으로, 질의와의 코사인 유사도가 이보다 낮은 행은 버린다(0 이면 거르지 않는다). 자료마다 `score` 가 붙는다. `identifierSearch`(기본 true)가 켜져 있으면 질의 속 식별자(CVE ID · 영문 모델명 · 영문 약어 · 「질문 61」 같은 번호)를 제목/본문에서 문자열로 정확히 찾아 벡터 결과 앞에 붙이고(`match: "identifier"`, `minScore` 면제), 5행을 넘게 걸리는 흔한 표기는 버린다. 번호 참조는 `idColumn`(원본 번호 열)이 있을 때만 쓴다. 순차 검색이라 행이 수천 개 이하인 테이블용이다 |
| `folder` | `{ path, topK }` — `path` 는 볼륨 기준 상대 경로 |

## 모듈 표면

| Export | 계약 | 위치 |
| --- | --- | --- |
| `createApp(options?)` | Express 앱을 만든다. `checkDatabase`, `admin` 을 주입받는다. 리슨하지 않는다. | `src/server/app.ts` |
| `readEnv(source?)` | `{ port, nodeEnv, databaseUrl, dataDir, llmApiKey }` 검증. 잘못되면 던진다. | `src/server/env.ts` |
