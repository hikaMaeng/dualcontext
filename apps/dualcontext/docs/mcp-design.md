# MCP 인터페이스 설계안 (제안 · 미구현)

현재 계약(`api.md` 「MCP」)을 대체하려는 안이다. 코드는 바뀌지 않았다. 결정이 필요한 항목은 맨 아래 「결정 대기」.

## 현재 사실 (코드에서 확인)

| 항목 | 내용 | 근거 |
| --- | --- | --- |
| 도구 | `augment_context(query)` 하나 | `src/server/mcp/tools/augment/index.ts` |
| 깊이 | 호출자가 못 고른다. 관리자 `plan_config.mode`(classic · decompose · reevaluate) 한 값이 모든 MCP 호출에 적용된다 | `augment/index.ts#runAugment` |
| 보강 라운드 상한 | `plan_config.reevaluate.maxRounds`(0~5). 실행 한 번 override(`planOverrideSchema`)도 받는다 | `plan/config/schema.ts` |
| 빈 결과 | 조사원이 없으면 `content: []`(아무 텍스트 없음) | 같은 도구 파일 |
| 실패 | 계획 모드 analyze 실패는 호출 오류 | `constraints.md` |
| 기록 | MCP 호출은 `augment_runs` 에 `source=mcp` 로 남는다(구현됨, 최종 답변은 만들지 않는다) | `constraints.md`, `internals.md` |
| 지연 | LLM 호출 하나 중앙값 16.7초(`internals.md`). F1 보고서 소요 121~304초, F3 61~229초(보고서에 모드 명시 없음, 확인 못 함) | `internals.md`, `seed-data/domains/_experiments/F1·F3/report.md` |

## 문제

1. 호스트 모델이 「얼마나 깊게 가져올지」를 고르거나 알 수 없다. 관리자가 모드를 바꾸면 모든 호출이 느려지고, 호스트는 이유를 모른다.
2. 응답이 컨텍스트 본문뿐이라, 충분한지(부분 · 없음)를 본문을 읽고 추측해야 한다. 빈 응답은 「자료 없음」인지 「실패」인지 구별이 안 된다.

## 설계 원칙 (약한 호스트 기준)

* 도구 **1개**, 필수 인자 **1개**(`query`), 선택 인자 **1개**(`effort`, 기본값 있음). `effort` 를 생략해도 항상 올바르게 동작해야 한다. 리플렉션 횟수 · 한도 · 프롬프트를 직접 지정하는 인자는 **없다**: 호출자는 `query` 와 `effort` 만 준다.
* **돌려주는 것은 질의를 증강할 컨텍스트뿐이다. 답변을 주지 않는다**(아래 「응답에 담지 않는 것」). 답은 호출한 호스트 모델이 만든다.
* 호스트의 판단은 「부를지 말지」와 「effort 한 칸」으로 줄인다. 깊이 규칙은 도구 설명에 한 줄씩만 둔다.
* 응답 첫 줄은 고정 형식 `key=value` 한 줄. 본문을 읽지 않고도 수행 단계와 충분 여부를 안다.
* 재시도 금지 문구를 응답에 넣는다(빈 결과에 같은 질의를 다시 부르는 낭비 방지).

## effort (4단)

`effort` 는 「질의 분해를 하는가 · 서버 안 리플렉션(답변 · 평가)을 최대 몇 번 하는가」로 정의한다. 호출자는 이 값 하나만 고르며, 분해 · 리플렉션 횟수는 직접 지정할 수 없다. 값은 `light` · `middle` · `high` · `xhigh`.

| effort | 질의 분해 | 응답 평가 · 보강 | 서버 엔진 | 엔진 설정 |
| --- | --- | --- | --- | --- |
| `light` (기본) | 안 함 | 안 함 | classic | — |
| `middle` | 함 | 안 함 | decompose | — |
| `high` | 함 | 리플렉션(답변 · 평가) 최대 2번 | reevaluate | `reevaluate.maxRounds = 1` |
| `xhigh` | 함 | 리플렉션(답변 · 평가) 최대 4번 | reevaluate | `reevaluate.maxRounds = 3` |

* 모드와 라운드 상한은 이미 호출 단위로 지정할 수 있다(`RunAugmentOptions.mode`, `config`). 단계 대응에 새 엔진 코드는 필요 없다.
* 리플렉션 계수(`packages/dualcontext_domain/src/server/plan/reevaluate/index.ts#reevaluateLoop`에서 확인): 한 번의 리플렉션 = 답변 1회 + 평가 1회. 라운드 0 이 첫 리플렉션이고, 불통과면 보강 후 라운드 1, 2 … 로 이어지며 `round >= maxRounds` 에서 `max-rounds` 로 멈춘다. 그래서 리플렉션 최대 횟수 = `maxRounds + 1` 이고, `effort` 는 `maxRounds = 횟수 - 1` 로 변환한다(`high` 2번 → 1, `xhigh` 4번 → 3). 관리자 「계획 설정」의 「최대 보강 라운드」(0~5) 와 같은 값이며, 그 이름은 보강 횟수를 뜻하므로 화면 문구와 혼동하지 않도록 문서에 이 관계를 남긴다.
* 한도(단계 수 · 아이템 수 · 통과 점수 등)는 관리자 「계획 설정」 값을 그대로 쓴다. `effort` 가 바꾸는 것은 모드와 `maxRounds` 뿐이다.
* 시간은 위로 갈수록 늘어난다: `light` 는 한 번의 증강, `middle` 은 분석 + 아이템마다 증강(수 배), `high`·`xhigh` 는 거기에 답변 · 평가 호출이 라운드마다 더해진다. 수치는 측정하지 않았다.

호스트가 읽는 도구 설명(도구 · 인자 설명문, 영문으로 둔다). 구조와 같은 순서로 쓴다: 무엇을 주는가(컨텍스트, 답변 아님) → 입력 두 개 → effort 단계 → 응답 읽는 법.

```
description:
  Returns background context to ground your answer to a query. It returns context only, never an answer:
  you write the answer yourself from it. Call it for questions that need specialist, private or recent material;
  skip it for general knowledge. If the reply starts with coverage=none, do not retry; answer from your own knowledge.
inputSchema:
  query:  The user's question, as asked.
  effort: (optional, default light) How hard to look. light = one lookup. middle = the question has several parts.
          high = also checks the gathered context for gaps and fills them. xhigh = only if a high reply said next: effort=xhigh.
          Higher is slower.
```

설명문에 「리플렉션」 · 「분해」 같은 내부 용어는 쓰지 않고 효과로만 쓴다. 설명문 글자 수는 위 정도(약 900자 이내)를 넘기지 않는다.

## 응답 봉투

본문 앞에 고정 머리를 붙인다(텍스트 content 하나).

```
[dualcontext] effort=high coverage=ok sources=3 reflections=2 elapsed=94s
next: -
---
<컨텍스트 본문. 조사원별 섹션, 웹 결과는 「검증되지 않은 보조 자료」 섹션>
```

| 필드 | 값 | 의미 |
| --- | --- | --- |
| `effort` | light · middle · high · xhigh | 실제로 수행한 단계(요청과 다르면 이유를 `note:` 로) |
| `coverage` | `ok` · `partial` · `none` | `none`: 마땅한 조사원 없음(본문 없음, 지금의 `content: []` 를 대체). `partial`: `high`·`xhigh` 에서 평가가 통과하지 못한 채 리플렉션 상한(`max-rounds`) 또는 예산에 닿아 멈춤. `ok`: 그 외 |
| `sources` | 정수 | 본문에 실린 조사원 수 |
| `reflections` | 정수 | 수행한 리플렉션(답변 · 평가) 횟수(`high`·`xhigh` 만) |
| `next` | `-` · `effort=xhigh` | `high` 가 `partial` 이면 `effort=xhigh`. 그 외는 항상 `-` |
| `missing:` | 한 줄들(`partial` 만) | 부족한 **컨텍스트의 이름 · 설명**만(평가가 낸 `missing[]` 의 `name`/`description`). 점수 · 평가 이유 · 답변 문장은 싣지 않는다. 호스트가 사용자에게 자료의 한계를 밝히는 데 쓴다 |

평가가 없는 `light` · `middle` 은 `coverage` 를 `ok`/`none` 으로만 낸다(충분성을 판정할 근거가 없다).

오류는 `isError: true` 와 한 줄: `error: <원인>. next: effort=light, or answer without context.`

## 응답에 담지 않는 것

`high` · `xhigh` 는 서버 안에서 답변을 만들어 평가하지만(컨텍스트가 충분한지 가늠하는 도구일 뿐), 그 결과물은 응답에 나가지 않는다.

| 안 싣는 것 | 이유 |
| --- | --- |
| 서버가 만든 답변 본문(`RunAugmentOutcome.answerAfter` · 라운드별 `answer.text`) | 호스트가 서버의 답을 그대로 베끼면 증강이 아니라 대리 답변이 된다. 현재 도구도 답변을 돌려주지 않는다(`augment_context` 설명) |
| 평가 점수 · 통과 여부 · 평가 이유 · 프롬프트 · 모델 응답 원문 | 답변을 간접적으로 드러내고 호스트를 헷갈리게 한다 |
| 라운드별 중간 컨텍스트 | 최종 컨텍스트만 준다 |

본문은 최종 컨텍스트(아이템 컨텍스트를 합친 것) 하나다. 머리 줄의 `coverage` · `reflections` 는 횟수와 충분 여부만 알리는 메타 정보다. 봉투 조립 시험에 「응답 어디에도 서버 답변 문장이 없다」 검사를 넣는다(시험 입력의 답변에 표식 문자열을 심어 응답에 없는지 확인).

## 서버 변경

| 대상 | 변경 | 상태 |
| --- | --- | --- |
| `effort` → (`mode`, `maxRounds`) 변환 | 위 표 | 신규(작음) |
| 응답 머리 · `coverage` · `missing` | `AugmentResult`/`PlanTrace` → 봉투. 부족 컨텍스트는 지금 컨텍스트 선택에만 쓰고 돌려주지 않는다 | 신규 |
| `plan_config.mode` 의미 | 「MCP 기본 모드」 → 시험 실행 · 관리자 화면의 기본값으로만. `effort` 를 생략한 MCP 호출은 항상 `light` 이므로 관리자 설정만으로 MCP 호출이 느려지지 않는다 | 계약 변경 |

## 지연 · 타임아웃

`middle` 이상은 분 단위일 수 있어 MCP 클라이언트의 호출 제한에 걸릴 수 있다(제한값은 클라이언트마다 달라 확인하지 못했다). 안:

* `middle` 이상에 서버 총 예산(초, 설정)을 둔다. 초과하면 그 시점까지의 1차 아이템 컨텍스트를 `coverage=partial` 로 돌려준다. 지금은 예산 없이 오류 또는 무한 대기다.
* 계획 진행 단계(`PlanProgress`)를 MCP progress 알림으로 보낸다(클라이언트가 알림으로 제한 시간을 연장하는 경우에 한해 효과가 있다).
* 비동기 작업형(시작 → 조회)은 도구가 늘고 약한 호스트가 폴링을 못 할 수 있어 채택하지 않는다.

## 영향 범위

| 파일 | 변경 |
| --- | --- |
| `src/server/mcp/tools/augment/` | 인자 `effort`, 변환. 봉투 조립은 `envelope/` 폴더로 분리한다 |
| `docs/api.md` · `usage.md` · `constraints.md` | 「도구는 하나, 인자는 `query` 하나」 계약 행 갱신 |
| `augment_runs` | MCP 호출 기록 여부(결정 대기 4) |
| 시험 | 도구 입력 스키마 · `effort` 변환 · 봉투 형식 · `coverage` 판정 단위 시험, 호스트 모델별 선택 시험(아래) |

## 검증 계획 (구현 후)

약한 호스트에서 선택 장애가 없다는 주장은 **외부 기준**으로 확인한다. 설계와 같은 변경에서 만든 지표로 통과시키지 않는다.

* 질의 세트: `_experiments/F1~F3/queries.json` 의 기존 질의(자료가 있는 것 · 범위 밖(F3-4 유형) 포함).
* 호스트: 크기가 다른 모델 여러 개. 각각 `effort` 를 안 쓰는 설정과 쓰는 설정.
* 기록: 호출 여부, 고른 `effort`, `next:` 를 따랐는지, 같은 질의의 재호출 횟수, 호출 오류.
* 합격선(사전 고정, 변경하려면 이 문서를 먼저 고친다): 도구 호출 오류 0건, `coverage=none` 뒤 재호출 0건, `next:` 를 무시한 사례 0건. 범위 밖 질의의 불필요 호출 비율과 `effort` 선택의 적절성은 측정해 보고하되 합격선은 정하지 않았다(기준 자료가 없다).

## 실측: 호스트 모델의 호출 행태 (1건)

사용자가 보여 준 화면(실제 호스트 모델 `qwen36-35b`, 질문 「근로계약서 없이 일했을 때 퇴직금 청구 요건과 미지급 시 진정 절차」): 모델은 도구를 **연달아 3번 이상** 불렀고, 매번 사용자 질문을 그대로 넘기지 않고 **키워드를 나열한 새 질의**로 바꿨다. 그때 배포본에는 `effort` 가 없었으므로(`augment_context(query)` 하나) 「effort 를 안 썼다」의 증거는 아니다. 증거는 이것이다: 모델은 깊이를 올리는 대신 **같은 얕은 호출을 질의만 바꿔 반복**하며 스스로 보강했다. 표본은 질문 하나, 모델 하나다.

함의(가설, 미검증):

* 선택 인자 `effort` 를 모델이 올려 줄 것이라는 기대는 약하다. 설명문 · `next:` 응답은 모델이 읽어야만 효과가 있다.
* 반복 호출은 호출마다 증강 전체(수십 초)를 다시 쓴다. 지금은 MCP 호출이 실행 로그에 `MCP` 뱃지로 남으므로(구현됨) **같은 질문 하나에 몇 번 부르는지 · 질의가 어떻게 바뀌는지**를 로그로 셀 수 있다.
* 서버가 알아서 올리는 안(결정 대기 5): MCP stdio 프로세스는 연결 하나당 하나라 프로세스 안 최근 호출 기록이 곧 한 호스트 세션이다. 최근 호출과 질의가 비슷한(임베딩 유사도) 재호출이면 `effort` 를 한 단계씩 자동으로 올린다. 임계값은 쌓인 로그로 정해야 하며 지금 값이 없다.

## 결정 대기

1. 기본값: `light`(기존 classic 과 같은 동작)로 두는 안이다. 다르게 하려면 알려 달라.
2. `middle` 이상의 총 예산 기본값(초).
3. 「max 2단 · 4단」을 리플렉션(답변 · 평가) 총 횟수로 확정했다(`maxRounds` 1 · 3). 보강 횟수 기준이었다면 2 · 4 로 바꾼다.
4. (해결) MCP 호출은 `augment_runs` 에 남긴다. `effort` · `coverage` 를 기록할 열은 `effort` 구현 때 더한다.
5. 호스트가 `effort` 를 안 올리는 경우를 위해 서버가 유사 재호출을 감지해 자동으로 올릴 것인가(위 「실측」). 올린다면 `effort` 인자는 선택 힌트로 남기고, 기본 단계 · 올림 사다리 · 유사도 임계값을 로그로 정한다.
