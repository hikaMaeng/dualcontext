# API

## MCP (stdio)

| 도구 | 인자 | 응답 |
| --- | --- | --- |
| `augment_context` | `query: string` (비어 있지 않음) | 증강된 컨텍스트 텍스트 |

도구는 이것 하나뿐이다. 경로는 저장된 계획 설정의 `mode` 를 따른다(`classic` 기본: 기존 경로, `decompose` · `reevaluate`: 1차 아이템 컨텍스트를 합친 것, 「계획 설정」 아래). 계획 모드에서 질의 분석(analyze)이 실패하면 도구 호출이 오류가 된다(빈 결과로 숨기지 않는다). reevaluate 의 답변 · 평가는 컨텍스트를 고르는 데만 쓰고 돌려주지 않는다. 붙는 방법은 `usage.md`.

## HTTP

| 경로 | 응답 |
| --- | --- |
| `GET /health`, `GET /api/health` | DB 왕복이 되면 `200 { status:"ok", service, database:"ok" }`, 안 되면 `503` |
| `GET /api/admin/status` | PostgreSQL · pgvector · textsearch_ko 버전, 한국어 설정 유무, 분석 예시 |
| `GET/POST /api/admin/researchers`, `PUT/DELETE /api/admin/researchers/:id` | 조사원. 본문 `{ name, description, keywords, enabled, type, config, procedureIds, defaultProcedureId?, router? }`. `defaultProcedureId`(정수 또는 `null`. 생략하면 생성은 `null`, **`PUT` 은 기존 값을 유지**하되 새 `procedureIds` 에서 빠졌으면 `null`; 명시한 `null` 은 해제)는 **기본 프로시저**로, 프로시저 라우팅이 하나도 고르지 못했을 때 대신 붙는다(폴백, `internals.md`). **`procedureIds` 안의 id 여야 한다**: 아니면 `400 { error }`(연결을 해제하면서 그것을 기본으로 남기는 요청도 같다. 자동으로 해제하지 않으니 호출자가 `null` 로 바꾸거나 연결을 유지한다). 응답과 목록(`GET`)에도 `defaultProcedureId` 가 담긴다. 프로시저를 삭제하면 DB 가 `null` 로 되돌린다. `router` 는 **개별 라우터**(`{ steps[] }`, 전역 라우터의 조사원 단계와 같은 모양, 1~6단계)이고 `null`(기본)이면 전역 라우터가 고른다. 응답에도 `router` 가 담긴다 |
| `GET/POST/DELETE /api/admin/researchers/:id/crawl` | 크롤러 조사원 전용(다른 타입이면 `404`). `GET`: 캐시 상태 `{ status(idle/running/ok/error), running, pages, chunks, finishedAt, error }`. `POST`: 지금 백그라운드로 크롤을 시작하고 `202`(이미 돌고 있으면 그 크롤에 합류). `DELETE`: 크롤한 페이지·조각과 상태를 지운다(크롤 중이면 `409`) |
| `GET/POST /api/admin/procedures`, `PUT/DELETE /api/admin/procedures/:id` | 프로시저 |
| `GET/PUT /api/admin/router` | 라우터 설정(질의 분해 + 단계별 라우팅 단계 파이프라인). `PUT` 본문은 아래 형태 그대로이며 zod 로 검증한다 |
| `GET /api/admin/router/defaults` | 기본 설정과 기본 프롬프트(`{ config, prompts: { researcher, procedure, split, individual } }`). 화면이 새 LLM 단계를 채울 때 쓴다 |
| `POST /api/admin/router/preview` | `{ query, config?, procedures? }`. 질의 하나의 라우팅만 돌린다(수집 · 라이터 없음). `config` 를 주면 **저장하지 않은 그 설정으로** 돌린다(저장된 설정은 그대로). `procedures: false` 면 2단계를 돌리지 않는다. 응답: `parts`(하위 질문), `selected`, `asked[]`(통째 질의와 하위 질문별 `selected · mode · steps[] · individual[]`; `individual` 은 개별 라우터를 가진 조사원마다 `{ researcher, selected, mode, steps[] }`), `scores`, `procedures[]`, `ms` |
| `GET/POST /api/admin/writers`, `PUT/DELETE /api/admin/writers/:id`, `POST /api/admin/writers/:id/activate` | 라이터 |
| `GET/PUT /api/admin/ai-server` | AI 서버 설정. 응답에 API 키는 없고 `hasApiKey` 만 있다 |
| `GET /api/admin/ai-server/models?kind=embedding\|chat` | 저장된 설정으로 서버의 모델 목록을 불러온다(연결 시험 겸용). 실패 시 `502` |
| `GET/PUT /api/admin/plan/config` | 컨텍스트 계획 설정(아래 「계획 설정」). `PUT` 은 설정 **전체**를 받고 zod 로 검증한다(실패 `400 { error }`, 저장하지 않음). 응답은 저장 뒤 다시 읽은 설정 |
| `GET /api/admin/plan/defaults` | `{ config: 기본 설정(mode classic), prompts: { analyze, prerequisites, dedupe, evaluate } }`. 화면의 「기본값으로」 용 |
| `POST /api/admin/augment` | `{ query, writerId?, mode?, plan? }`. `mode`(`classic` · `decompose` · `reevaluate`)와 `plan`(숫자 한도만의 부분 설정: `{ maxLevels?, maxNeedsPerItem?, maxItems?, maxProvidedChars?, reevaluate?: { maxRounds?, passScore?, maxMissing?, maxNewItems? } }`, 범위는 「계획 설정」과 같고 모르는 키 · 프롬프트 · `dedupe` 는 `400`)은 **이번 실행에만** 저장 설정 위에 얹는다(저장 설정은 그대로). 없으면 저장된 설정의 모드다. **비동기**: 실행 기록(`running`)을 만들고 즉시 `202 { runId, status }` 를 돌려준다. 작업은 서버에서 이어지며 단계(`augment` → `answering` → `done`)마다 기록을 갱신한다. 진행은 `GET /runs/:id`(폴링) 또는 `GET /runs/:id/events`(SSE)로 본다. `?wait=1` 이면 끝까지 기다려 `{ context, routing, researcherRouting, pairs, writer, plan, answers, runId }`(`plan` 은 classic 이면 `null`)를 돌려준다(스크립트 호환용, 증강 단계가 실패하면 `502 { error, runId }`). 증강 경로는 MCP 도구와 같고, 이어서 LLM 으로 **최종 답변 두 개**를 만든다: `answers.before`(질의만), `answers.after`(질의 + 컨텍스트). 컨텍스트가 비면 `answers.after = { skipped: true }`. reevaluate 에서 마지막 라운드 답변이 최종 컨텍스트로 만든 것이면 모델을 다시 부르지 않고 그 답을 `answers.after` 로 쓰고 `fromPlan: true` 를 붙인다 |
| `GET /api/admin/runs` | 시험 실행 로그 목록(쪽 단위, 응답은 도메인 타입 `RunListPage`). 쿼리: `page`(1부터, 기본 1), `pageSize`(기본 20, 최대 100), `researcher` · `procedure`(반복 가능, **종류 안에서는 OR**: 주어진 이름 중 하나라도 선택된 실행이면 통과, 두 종류 사이와 `q` 와는 AND), `q`(검색어, 앞뒤 공백 제거, 최대 500자), `mode`(`keyword`(기본) · `semantic`). 잘못된 값은 `400 { error }`. 응답 `{ items, total, page, pageSize }`: `items[]` 는 `id, createdAt, query(전체, 자르지 않음), status, durationMs, researchers[], procedures[]` 와 `q` 가 있을 때만 `match { by, score }`. `researchers`/`procedures` 는 기록의 `pairs` 에서 뽑은 이름(중복 제거, 선택 순서 유지, procedure `null` 제외). 정렬은 최신순(`id` 내림차순), 단 `mode=semantic` 이고 `q` 가 있으면 유사도 내림차순. `keyword` 는 질의 + 최종 출력(`answers.before/after.text`) + `context` 에 대한 한국어 형태소 전문 검색(어절은 AND)이고 `match.score` 는 `ts_rank`. `semantic` 은 `q` 를 임베딩해 질의 임베딩과의 코사인 유사도로 거르고(최소 `0.8`, `list/semantic/index.ts`) 순위를 매기며 `match.score` 는 코사인 유사도다. 임베딩 서버가 안 되거나 모델이 비어 있으면 빈 결과가 아니라 `503 { error }`. 임베딩이 아직 없는 옛 실행은 `semantic` 결과에서 빠진다(시작 시 · 검색 때 뒤에서 채운다. `internals.md`). 예: `/api/admin/runs?page=1&pageSize=20&researcher=코드&researcher=문서&procedure=P&q=얕은 클론` |
| `GET /api/admin/runs/filters` | 목록 필터에 쓸 이름 `{ researchers[], procedures[] }`(타입 `RunFilterOptions`). 실행 기록에 실제로 나온 이름만, 가나다순(코드포인트 순) |
| `GET /api/admin/runs/:id` | 로그 상세(폴링용): 위 필드 + `status(running/ok/error), stage, error, routing(후보별 라우팅 점수), settings(실행 당시 설정 스냅샷, 답변 프롬프트 포함, `settings.plan` = 이번 실행에 쓴 계획 설정 전체(모드 · override 적용 후, 프롬프트 포함)), pairs(자료 포함), context, answers, plan, planProgress`. `plan` 은 최상위 필드로 `PlanTrace`(도메인 `common/model/plan`) 그대로이며 classic 실행 · 옛 실행은 `null`, 계획 실행은 진행 중에도 부분 trace(`stop` 이 `null`, 그 시점까지의 `items` · `levels` · `waves` · `rounds` · `steps`)로 채워지고 증강 단계가 끝나면 최종 trace(`stop` 있음)로 바뀐다(`PlanTrace.steps` 가 없는 옛 실행도 있다). `planProgress` 는 진행 중 계획 단계 `{ stage(analyze/dependencies/build/answer/evaluate/reinforce/done), detail?, at }` 또는 `null`(SSE 로도 갱신된다). 계획 실행의 `researcherRouting` 은 `"plan"`, `routing` 은 `{ researchers: [], procedures: [] }`, `pairs` 는 모든 아이템(사전 아이템 포함)의 쌍을 아이템 순서로 평탄화한 것이고 쌍마다 `item`(아이템 이름)이 붙는다(만들지 못한 아이템의 쌍은 `materials: []`). `writer.calls` 는 아이템 수. 진행 중이면 아직 채워지지 않은 필드가 비어 있다(답변은 끝나는 대로 하나씩 채워진다) | 실행 상세에는 `nodes: string[]`(그 실행에 저장된 노드 키, 정렬, 없으면 `[]`)가 있어 SSE 로도 노드가 생기는 것을 알 수 있다(상세 내용은 위 노드 엔드포인트로 따로 읽는다).
| `GET /api/admin/runs/:id/events` | SSE. 접속 즉시 현재 상태를 보내고, 상태가 바뀔 때마다 상세 행 전체를 `data:` 로 보낸 뒤 실행이 끝나면 스트림을 닫는다. 15초마다 `: keep-alive` 를 보낸다 |
| `GET /api/admin/runs/:id/nodes/:key` | 실행 그래프 노드 하나의 상세(`RunNodeDetail`, 도메인 `common/model/run-node`): 모델 호출 `calls[]`(실제로 보낸 프롬프트 · 응답 · 오류 · 소요 · 시각, 글은 6만 자에서 잘리고 `truncated`), item 노드는 `prerequisitesCalls[]` · `provided[]`(건네받은 사전 컨텍스트: 원문 길이 · 라이터에 보낸 길이 · 보낸 글) · `augment`(라우팅 기록 · 자료 포함 쌍 · 컨텍스트 · 라이터), 실패하면 `error`. `:key` 는 URL 인코딩(`item%3Ai3`). 키 규칙: `classic` · `analyze` · `item:<PlanItem.id>` · `dedupe:<round>:<level\|seed>` · `answer:before` · `answer:after` · `answer:<round>` · `evaluate:<round>`. 아직 만들어지지 않았으면 404, 키 모양이 틀리면(영숫자 · `:_.-` 64자 밖) 400. 실행 상세의 `nodes` 가 있는 키 목록이다. |
| `DELETE /api/admin/runs/:id` | 로그 한 건 삭제. 실행 중이면 `409` |
| `GET /*` | 빌드된 프런트(SPA 폴백) |

요청 본문 검증은 zod 로 하고, 실패하면 `400`.

## MCP 응답

마땅한 조사원이 없으면(선택 0개, 또는 조사원은 골랐지만 자료가 하나도 모이지 않음) **컨텍스트를 공급하지 않는다**: `augment_context` 는 `content: []`(빈 결과)를 돌려준다. 호출한 쪽은 자기 지식으로 답한다.

## 계획 설정(`/plan`)

문서 하나(`plan_config.config` jsonb, 타입 `ContextPlanConfig`). 기본값은 `src/server/plan/config/index.ts#defaultPlanConfig`.

| 필드 | 기본 | 범위 | 뜻 |
| --- | --- | --- | --- |
| `mode` | `classic` | `classic` · `decompose` · `reevaluate` | 경로. classic = 기존 그대로, decompose = 아이템 분해 · 의존성까지, reevaluate = 답변 평가 · 보강 루프 추가 |
| `maxLevels` | 3 | 1~6 | 아이템 단계 수(1 이면 의존성 분석 없음) |
| `maxNeedsPerItem` | 4 | 1~8 | 아이템 하나가 낼 수 있는 사전 아이템 수 |
| `maxItems` | 16 | 1~40 | 아이템 전체 수(보강 포함) |
| `maxProvidedChars` | 3000 | 500~20000 | 사전 컨텍스트 하나를 의존하는 아이템의 라이터에 넘길 때의 최대 글자(넘으면 앞부분 + 「…(이하 N자 생략)」). 넘기기 전에 그 안의 「사전 제공된 컨텍스트」 섹션(중첩)은 뺀다. 이 필드가 없던 때 저장된 행은 읽을 때 3000 이 채워진다. `PUT` 에는 필수 |
| `dedupe` | `llm` | `name` · `llm` | 중복 정리. llm 이 실패하면 name |
| `reevaluate.maxRounds` | 2 | 0~5 | 최초 답변 뒤 보강 라운드 수 |
| `reevaluate.passScore` | 80 | 0~100 | 통과 점수(이상) |
| `reevaluate.maxMissing` | 0 | 0~40 | 통과로 인정하는 부족 항목 수(이하) |
| `reevaluate.maxNewItems` | 4 | 1~8 | 한 라운드 보강 아이템 수 |
| `prompts.analyze` · `prerequisites` · `dedupe` · `evaluate` | `plan/prompts` | 비어 있지 않음, 2만 자 이하 | 모델이 JSON 만 내도록 스키마를 적은 프롬프트. 자리표시자: analyze `{{query}} {{max}}`, prerequisites `{{query}} {{item}} {{known}} {{max}}`, dedupe `{{query}} {{candidates}} {{existing}}`, evaluate `{{query}} {{context}} {{answer}} {{max}}` |

아이템 하나는 기존 경로(라우팅 · 수집 · 프로시저 · 라이터)로 질의 `이름: 설명` 을 증강하고, 사전 아이템 컨텍스트를 라이터에 함께 준다. 응답 해석 규칙은 `plan/parse`(코드펜스 · 잡설 허용, 파서마다 기대 모양의 첫 JSON 후보, 아이템 목록은 잘못된 항목 버림, 평가는 `score` 숫자와 `missing` 배열(빈 배열 가능)이 필수이고 항목이 하나라도 틀리면 실패, 이름 80 · 설명 600 · 이유 400자 상한, 부족 항목 보존 100개, 점수 0~100 정수 클램프). 바깥 텍스트는 `<<<이름 … 이름>>>` 구분자 안에 들어가며 값 속 `<<<`/`>>>` 는 `‹‹‹`/`›››` 로 바뀐다. 시작 시 저장된 프롬프트가 옛 기본값과 글자까지 같으면 새 기본값으로 바뀐다(고친 프롬프트는 유지).

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
| `duckduckgo` | `{ topK, rewrite? }` — 검색어는 질의 원문이 아니라 채팅 모델이 웹 검색어 한 줄로 다시 쓴 문장이다(내부 고유명사는 일반어로 바꾸거나 뺀다). `rewrite: false` 면 원문을 보낸다. 모델이 실패하거나 빈 답이면 원문. 원문과 다른 검색어를 썼으면 첫 자료 본문 앞에 `(검색어: …)` 가 붙는다 |
| `pgvector` | `{ table, vectorColumn, textColumn, titleColumn?, reducedColumn?, reducedDim?, snippetChars?, minScore?, idColumn?, identifierSearch?, topK }` — `reducedColumn` 이 있으면 축소 차원으로 후보 topK×8 을 뽑고 전체 차원으로 재순위화한다. `snippetChars`(100~8000, 기본 1200)는 컨텍스트에 싣는 자료 글자 수이며 문장 경계에서 자른다. `minScore`(0~1, 기본 0.72)는 자료(행) 단위 관련도 기준으로, 질의와의 코사인 유사도가 이보다 낮은 행은 버린다(0 이면 거르지 않는다). 자료마다 `score` 가 붙는다. `identifierSearch`(기본 true)가 켜져 있으면 질의 속 식별자(CVE ID · 영문 모델명 · 영문 약어 · 「질문 61」 같은 번호)를 제목/본문에서 문자열로 정확히 찾아 벡터 결과 앞에 붙이고(`match: "identifier"`, `minScore` 면제), 5행을 넘게 걸리는 흔한 표기는 버린다. 번호 참조는 `idColumn`(원본 번호 열)이 있을 때만 쓴다. 순차 검색이라 행이 수천 개 이하인 테이블용이다 |
| `folder` | `{ path, topK }` — `path` 는 볼륨 기준 상대 경로 |
| `codebase` | `{ source: "git" \| "directory", url?, ref?, subPath?, path?, tokenEnv?, projects?, refreshHours?, maxFiles?, maxRepoMB?, maxIndexSeconds?, topK }` — `git` 이면 `url`(https 공개 레포, 계정 정보 · 포트 · 쿼리 금지)을 서버 안에서 얕게(깊이 1) 클론한다. `ref` 는 브랜치 · 태그 이름, `subPath` 는 레포 안 상대 하위 경로. `directory` 이면 `path`(볼륨 기준 상대 경로, `pgdata` · `codebase` 거부)에 미리 받아 둔 코드를 읽는다. 호스트 소스 트리는 루트 `.env` 의 `DUALCONTEXT_WORKSPACE_DIR`(기본 비어 있는 `.docker/workspace`)이 컨테이너 안 `workspace/` 로 **읽기 전용 바인드 마운트**되므로 `path` 는 `workspace/<폴더>` 꼴이다(`.env` · 키 · 인증서류 파일은 색인에서 뺀다). `projects: true`(directory 전용)이면 `path` 의 **하위 폴더 각각을 개별 프로젝트(개별 인덱스)** 로 인식한다(예: `path: "workspace"` 하나로 호스트 개발 폴더 아래 모든 프로젝트). 질의에 프로젝트 이름이 단어로 나오면 그 프로젝트만 읽고(인덱스가 없으면 만들어 기다린다), 이름이 없으면 이미 인덱스가 있는 프로젝트 전체를 읽어 점수순으로 합치며 인덱스가 없는 프로젝트는 뒤에서 하나씩 만든다. 자료 제목 앞에 `[프로젝트]` 가 붙는다. `tokenEnv` 는 토큰을 담은 **서버 환경 변수의 이름**(`DUALCONTEXT_GIT_TOKEN…` 꼴만)이며 토큰 값은 설정에 넣을 수 없다. `refreshHours`(0~720, 기본 24, 0 이면 처음 한 번)는 인덱스 갱신 주기, `maxFiles`(10~5000, 기본 2000) · `maxRepoMB`(1~500, 기본 100) · `maxIndexSeconds`(10~600, 기본 120)는 만들기 상한, `topK`(1~20, 기본 5). 설정이 틀리면 `400`. 자료 제목은 `경로:시작줄-끝줄 종류 이름`, 본문은 소스 조각 뒤에 `calls:` · `called by:` · `file imports:` 구조 줄이 붙는다 |
| `crawler` | 아래 「크롤러 `config`」 |

## 크롤러 `config`

zod 스키마가 저장 때와 실행 때 모두 검증한다(`collect/crawler/config`). 한도를 넘으면 저장이 `400`.

| 필드 | 기본 | 범위 | 뜻 |
| --- | --- | --- | --- |
| `startUrls` | (필수) | 1~10개 | 시작 URL. http/https 만 |
| `allowedDomains` | `[]` | 0~10개 | 허용 도메인(하위 도메인 포함). 비면 시작 URL 의 호스트로 한정 |
| `depth` | 1 | 0~3 | 시작 URL 에서 링크를 따라가는 깊이 |
| `maxPages` | 30 | 1~200 | 한 번의 크롤에서 저장하는 페이지 수 상한 |
| `includePatterns` · `excludePatterns` | `[]` | 각 0~10개 | 경로+쿼리에 대한 정규식. 제외가 먼저 |
| `delayMs` | 1000 | 500~60000 | 같은 호스트 요청 간격. robots.txt 의 `Crawl-delay` 가 더 크면 그 값 |
| `refreshHours` | 24 | 1~720 | 이 시간이 지난 캐시는 질의 때 백그라운드로 재크롤 |
| `maxCrawlSeconds` | 120 | 10~600 | 크롤 한 번의 총 시간 상한(넘으면 거기까지로 색인) |
| `chunkChars` | 1000 | 300~4000 | 청크 길이 |
| `minScore` | 0.5 | 0~1 | 이 코사인 유사도 미만 조각은 버림 |
| `perPage` | 2 | 1~5 | 한 페이지에서 가져오는 조각 수 상한 |
| `topK` | 3 | 1~20 | 돌려주는 조각 수 |

자료의 `title` 은 `페이지 제목 (URL)`, `text` 는 조각, `score` 는 코사인 유사도다.

## 모듈 표면

| Export | 계약 | 위치 |
| --- | --- | --- |
| `createApp(options?)` | Express 앱을 만든다. `checkDatabase`, `admin` 을 주입받는다. 리슨하지 않는다. | `src/server/app.ts` |
| `readEnv(source?)` | `{ port, nodeEnv, databaseUrl, dataDir, llmApiKey }` 검증. 잘못되면 던진다. | `src/server/env.ts` |
