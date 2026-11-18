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
| 기록 | MCP 호출은 `augment_runs` 에 남지 않는다(시험 실행만) | `constraints.md` |
| 지연 | LLM 호출 하나 중앙값 16.7초(`internals.md`). F1 보고서 소요 121~304초, F3 61~229초(보고서에 모드 명시 없음, 확인 못 함) | `internals.md`, `seed-data/domains/_experiments/F1·F3/report.md` |

## 문제

1. 호스트 모델이 「얼마나 깊게 가져올지」를 고르거나 알 수 없다. 관리자가 모드를 바꾸면 모든 호출이 느려지고, 호스트는 이유를 모른다.
2. 응답이 컨텍스트 본문뿐이라, 충분한지(부분 · 없음)를 본문을 읽고 추측해야 한다. 빈 응답은 「자료 없음」인지 「실패」인지 구별이 안 된다.

## 설계 원칙 (약한 호스트 기준)

* 도구 **1개**, 필수 인자 **1개**(`query`), 선택 인자 **1개**(`effort`, 기본값 있음). `effort` 를 생략해도 항상 올바르게 동작해야 한다.
* 호스트의 판단은 「부를지 말지」와 「effort 한 칸」으로 줄인다. 깊이 규칙은 도구 설명에 한 줄씩만 둔다.
* 응답 첫 줄은 고정 형식 `key=value` 한 줄. 본문을 읽지 않고도 수행 단계와 충분 여부를 안다.
* 재시도 금지 문구를 응답에 넣는다(빈 결과에 같은 질의를 다시 부르는 낭비 방지).

## effort (4단)

`effort` 는 「질의 분해를 하는가 · 응답 평가를 몇 라운드까지 하는가」로 정의한다. 값은 `light` · `middle` · `high` · `xhigh`.

| effort | 질의 분해 | 응답 평가 · 보강 | 서버 엔진 | 엔진 설정 |
| --- | --- | --- | --- | --- |
| `light` (기본) | 안 함 | 안 함 | classic | — |
| `middle` | 함 | 안 함 | decompose | — |
| `high` | 함 | 최대 2라운드 | reevaluate | `reevaluate.maxRounds = 2` |
| `xhigh` | 함 | 최대 4라운드 | reevaluate | `reevaluate.maxRounds = 4` |

* 모드와 라운드 상한은 이미 호출 단위로 지정할 수 있다(`RunAugmentOptions.mode`, `config`). 단계 대응에 새 엔진 코드는 필요 없다.
* 라운드 계수(`packages/dualcontext_domain/src/server/plan/reevaluate/index.ts#reevaluateLoop`에서 확인): 라운드 0 이 첫 답변 · 평가이고, 불통과면 보강 후 라운드 1, 2 … 로 이어지며 `round >= maxRounds` 에서 `max-rounds` 로 멈춘다. 따라서 `maxRounds = 2` 는 **보강 최대 2번**(답변 · 평가 최대 3번), `maxRounds = 4` 는 보강 최대 4번(답변 · 평가 최대 5번)이다. 「응답 평가 max 2단 · 4단」을 보강 횟수로 읽은 것이다.
* 한도(단계 수 · 아이템 수 · 통과 점수 등)는 관리자 「계획 설정」 값을 그대로 쓴다. `effort` 가 바꾸는 것은 모드와 `maxRounds` 뿐이다.
* 시간은 위로 갈수록 늘어난다: `light` 는 한 번의 증강, `middle` 은 분석 + 아이템마다 증강(수 배), `high`·`xhigh` 는 거기에 답변 · 평가 호출이 라운드마다 더해진다. 수치는 측정하지 않았다.

호스트용 선택 규칙(도구 설명에 둘 문장):

```
effort (optional, default light): light = single lookup; middle = question has several parts;
high = needs checking and gap-filling; xhigh = only when high replied coverage=partial. Slower as effort rises.
If the reply says coverage=none, do not retry; answer from your own knowledge.
```

## 응답 봉투

본문 앞에 고정 머리를 붙인다(텍스트 content 하나).

```
[dualcontext] effort=high coverage=ok sources=3 rounds=1 elapsed=94s
next: -
---
<컨텍스트 본문. 조사원별 섹션, 웹 결과는 「검증되지 않은 보조 자료」 섹션>
```

| 필드 | 값 | 의미 |
| --- | --- | --- |
| `effort` | light · middle · high · xhigh | 실제로 수행한 단계(요청과 다르면 이유를 `note:` 로) |
| `coverage` | `ok` · `partial` · `none` | `none`: 마땅한 조사원 없음(본문 없음, 지금의 `content: []` 를 대체). `partial`: `high`·`xhigh` 에서 평가가 통과하지 못한 채 라운드 상한(`max-rounds`) 또는 예산에 닿아 멈춤. `ok`: 그 외 |
| `sources` | 정수 | 본문에 실린 조사원 수 |
| `rounds` | 정수 | 수행한 보강 횟수(라운드 0 은 제외)(`high`·`xhigh` 만) |
| `next` | `-` · `effort=xhigh` | `high` 가 `partial` 이면 `effort=xhigh`. 그 외는 항상 `-` |
| `missing:` | 한 줄들(`partial` 만) | 평가가 요구한 부족 컨텍스트. 호스트가 사용자에게 한계를 밝히는 데 쓴다 |

평가가 없는 `light` · `middle` 은 `coverage` 를 `ok`/`none` 으로만 낸다(충분성을 판정할 근거가 없다).

오류는 `isError: true` 와 한 줄: `error: <원인>. next: effort=light, or answer without context.`

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

## 결정 대기

1. 기본값: `light`(기존 classic 과 같은 동작)로 두는 안이다. 다르게 하려면 알려 달라.
2. `middle` 이상의 총 예산 기본값(초).
3. 「max 2단 · 4단」을 보강 횟수로 읽었다(위 라운드 계수). 평가 횟수(답변 · 평가 총 2번 · 4번)를 뜻했다면 `maxRounds` 를 1 · 3 으로 바꾼다.
4. MCP 호출을 `augment_runs` 에 남길 것인가(`effort` · `coverage` 기록용). 남기면 질의 원문이 평문으로 쌓이는 현재 제약(`constraints.md`)이 MCP 에도 적용된다.
