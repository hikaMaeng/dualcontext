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
| `GET/POST /api/admin/researchers`, `PUT/DELETE /api/admin/researchers/:id` | 조사원. 본문 `{ name, description, keywords, enabled, type, config, procedureIds }` |
| `GET/POST /api/admin/procedures`, `PUT/DELETE /api/admin/procedures/:id` | 프로시저 |
| `GET/PUT /api/admin/router` | 라우터 설정 |
| `GET/POST /api/admin/writers`, `PUT/DELETE /api/admin/writers/:id`, `POST /api/admin/writers/:id/activate` | 라이터 |
| `GET/PUT /api/admin/ai-server` | AI 서버 설정. 응답에 API 키는 없고 `hasApiKey` 만 있다 |
| `GET /api/admin/ai-server/models?kind=embedding\|chat` | 저장된 설정으로 서버의 모델 목록을 불러온다(연결 시험 겸용). 실패 시 `502` |
| `POST /api/admin/augment` | `{ query, writerId? }` → `{ context, researcherRouting, pairs, writer, answers, runId }`. 증강 경로는 MCP 도구와 같고, 이어서 LLM 으로 **최종 답변 두 개**를 만든다: `answers.before`(질의만), `answers.after`(질의 + 증강된 컨텍스트). 각 답변은 `{ text, error, ms }`. 성공이든 실패든 실행 로그를 남기며, 증강 단계가 실패하면 `502 { error, runId }` |
| `GET /api/admin/runs` | 시험 실행 로그 목록(최근 200건): `id, createdAt, query(앞 120자), status, durationMs, researcherRouting, pairCount, writerName` |
| `GET /api/admin/runs/:id` | 로그 상세: 위 필드 + `error, settings(실행 당시 설정 스냅샷, 답변 프롬프트 포함), pairs(자료 포함), context, answers(증강 전 · 후 최종 답변)` |
| `DELETE /api/admin/runs/:id` | 로그 한 건 삭제 |
| `GET /*` | 빌드된 프런트(SPA 폴백) |

요청 본문 검증은 zod 로 하고, 실패하면 `400`.

## 조사원 `config`

| type | config |
| --- | --- |
| `duckduckgo` | `{ topK }` |
| `pgvector` | `{ table, vectorColumn, textColumn, titleColumn?, reducedColumn?, reducedDim?, snippetChars?, topK }` — `reducedColumn` 이 있으면 축소 차원으로 후보 topK×8 을 뽑고 전체 차원으로 재순위화한다. `snippetChars`(100~8000, 기본 1200)는 컨텍스트에 싣는 자료 글자 수다 |
| `folder` | `{ path, topK }` — `path` 는 볼륨 기준 상대 경로 |

## 모듈 표면

| Export | 계약 | 위치 |
| --- | --- | --- |
| `createApp(options?)` | Express 앱을 만든다. `checkDatabase`, `admin` 을 주입받는다. 리슨하지 않는다. | `src/server/app.ts` |
| `readEnv(source?)` | `{ port, nodeEnv, databaseUrl, dataDir, llmApiKey }` 검증. 잘못되면 던진다. | `src/server/env.ts` |
