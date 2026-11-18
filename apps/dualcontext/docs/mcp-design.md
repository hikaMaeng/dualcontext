# MCP 인터페이스 설계안 (제안 · 미구현)

현재 계약(`api.md` 「MCP」)을 대체하려는 안이다. 코드는 바뀌지 않았다. 결정이 필요한 항목은 맨 아래 「결정 대기」.

## 현재 사실 (코드에서 확인)

| 항목 | 내용 | 근거 |
| --- | --- | --- |
| 도구 | `augment_context(query)` 하나 | `src/server/mcp/tools/augment/index.ts` |
| 깊이 | 호출자가 못 고른다. 관리자 `plan_config.mode`(classic · decompose · reevaluate) 한 값이 모든 MCP 호출에 적용된다 | `augment/index.ts#runAugment` |
| 빈 결과 | 조사원이 없으면 `content: []`(아무 텍스트 없음) | 같은 도구 파일 |
| 실패 | 계획 모드 analyze 실패는 호출 오류 | `constraints.md` |
| 기록 | MCP 호출은 `augment_runs` 에 남지 않는다(시험 실행만) | `constraints.md` |
| 지연 | LLM 호출 하나 중앙값 16.7초(`internals.md`). F1 보고서 소요 121~304초, F3 61~229초(보고서에 모드 명시 없음, 확인 못 함) | `internals.md`, `seed-data/domains/_experiments/F1·F3/report.md` |

## 문제

1. 호스트 모델이 「얼마나 깊게 가져올지」를 고르거나 알 수 없다. 관리자가 모드를 바꾸면 모든 호출이 느려지고, 호스트는 이유를 모른다.
2. 응답이 컨텍스트 본문뿐이라, 호스트는 이것이 충분한지(부분 · 없음)를 본문을 읽고 추측해야 한다. 빈 응답은 「자료 없음」인지 「실패」인지 구별이 안 된다.
3. 분 단위로 걸릴 수 있는 호출이 한 종류뿐이라, 빠른 조회가 필요한 호출도 같은 비용을 낸다.

## 설계 원칙 (약한 호스트 기준)

* 도구 **1개**, 필수 인자 **1개**(`query`), 선택 인자 **1개**(`depth`, 기본값 있음). 인자를 생략해도 항상 올바르게 동작해야 한다.
* 호스트의 판단은 「부를지 말지」 하나로 줄인다. 깊이를 올릴지는 **서버가 응답의 `next:` 로 지시**하고, 호스트는 그대로 따른다.
* 깊이 이름은 내부 용어(classic · reevaluate)가 아니라 **효과 · 시간**으로 쓴다.
* 응답 첫 줄은 고정 형식 `key=value` 한 줄. 본문을 읽지 않고도 레벨과 충분 여부를 안다.
* 재시도 금지 문구를 응답에 넣는다(빈 결과에 같은 질의를 다시 부르는 낭비 방지).

## 컨텍스트 확보 레벨

호스트가 보는 단계는 4개다. 0단계는 도구를 안 부르는 것이고, 나머지가 `depth` 다.

| 단계 | 언제 | 서버가 하는 일 | LLM 호출 | 시간 목표 |
| --- | --- | --- | --- | --- |
| 0. 부르지 않음 | 일반 상식 · 자료와 무관한 질문 | — | — | — |
| `quick` | 사실 하나 확인 · 용어 · 수치 조회 | 임베딩 라우팅 → 수집 → 템플릿 라이터. 출처별 발췌를 그대로 돌려준다 | 0 | 수 초 |
| `standard` (기본) | 대부분의 질문 | 지금의 classic: 조사원 · 프로시저 라우팅 → 수집 → 라이터 | 라우터 · 라이터 설정에 따름 | 수십 초 |
| `deep` | 여러 대상을 비교 · 종합하는 복합 질문, 또는 `standard` 응답이 `next: depth=deep` 을 지시 | 질의 분해 + 사전 컨텍스트 + 답변 평가 후 보강(reevaluate) | 수 배 | 분 단위 |

호스트용 선택 규칙은 도구 설명에 아래 세 줄만 둔다.

```
Omit depth unless told. depth=quick: look up one fact. depth=deep: only when the reply's "next:" line says so
or the question compares/combines several subjects. If the reply says coverage=none, do not retry; answer from your own knowledge.
```

## 응답 봉투

본문 앞에 고정 머리를 붙인다(텍스트 content 하나).

```
[dualcontext] depth=standard coverage=ok sources=3 elapsed=41s
next: -
---
<컨텍스트 본문. 조사원별 섹션, 웹 결과는 「검증되지 않은 보조 자료」 섹션>
```

| 필드 | 값 | 의미 |
| --- | --- | --- |
| `depth` | quick · standard · deep | 실제로 수행한 깊이(요청과 다르면 이유를 `note:` 로) |
| `coverage` | `ok` · `partial` · `none` | `none`: 마땅한 조사원 없음(본문 없음, 지금의 `content: []` 를 대체). `partial`: deep 평가가 부족 컨텍스트를 남겼거나 예산 초과로 멈춤. `ok`: 그 외 |
| `sources` | 정수 | 본문에 실린 조사원 수 |
| `next` | `-` · `depth=standard` · `depth=deep` | `quick` 에서 자료가 얇으면 standard, `standard` 에서 `partial` 이면 deep. `deep` 과 `none` 은 항상 `-` |
| `missing:` | 한 줄들(deep 의 `partial` 만) | 평가가 요구한 부족 컨텍스트. 호스트가 사용자에게 한계를 밝히는 데 쓴다 |

`coverage=partial` 의 판정은 `deep` 에서만 정의된다(평가 결과가 있다). `quick` · `standard` 의 `partial` 기준(예: 선택 조사원 중 수집 0건)은 정의되지 않았다 — 「결정 대기」 2.

오류는 `isError: true` 와 한 줄: `error: <원인>. next: depth=quick, or answer without context.`

## 서버 매핑

| depth | 엔진 | 현재 코드와의 차이 |
| --- | --- | --- |
| `standard` | `runAugment` classic | 없음 |
| `deep` | `runAugment` reevaluate | `RunAugmentOptions.mode` 로 호출마다 지정 가능(이미 있다) |
| `quick` | 임베딩 라우팅 + 템플릿 라이터 | **신규.** `RunAugmentOptions` 는 `writerId` · `mode` · `config` 뿐이라 라우터 단계 지정이 없다 |
| 응답 머리 · `coverage` | `AugmentResult`/`PlanTrace` → 봉투 | **신규.** `deep` 의 부족 컨텍스트는 지금 컨텍스트 선택에만 쓰고 돌려주지 않는다 |

관리자 `plan_config.mode` 의 뜻은 「MCP 기본 모드」에서 「`deep` 이 쓸 엔진(decompose · reevaluate)」으로 바뀐다. `depth` 를 생략한 호출은 항상 `standard` 이므로, 관리자 설정만으로 MCP 호출이 느려지지 않는다.

## 지연 · 타임아웃

`deep` 은 분 단위라 MCP 클라이언트의 호출 제한에 걸릴 수 있다(제한값은 클라이언트마다 달라 확인하지 못했다). 안:

* `deep` 에 서버 총 예산(초, 설정)을 둔다. 초과하면 그 시점까지의 1차 아이템 컨텍스트를 `coverage=partial` 로 돌려준다. 지금은 예산 없이 오류 또는 무한 대기다.
* 계획 진행 단계(`PlanProgress`)를 MCP progress 알림으로 보낸다(클라이언트가 알림으로 제한 시간을 연장하는 경우에 한해 효과가 있다).
* 비동기 작업형(시작 → 조회)은 도구가 늘고 약한 호스트가 폴링을 못 할 수 있어 채택하지 않는다.

## 영향 범위

| 파일 | 변경 |
| --- | --- |
| `src/server/mcp/tools/augment/` | 인자 `depth`, 봉투 조립. 봉투 조립은 `envelope/` 폴더로 분리한다 |
| `src/server/augment/index.ts` | `quick` 라우터 지정 옵션 |
| `docs/api.md` · `usage.md` · `constraints.md` | 「도구는 하나, 인자는 `query` 하나」 계약 행 갱신 |
| `augment_runs` | MCP 호출 기록 여부(결정 대기 3) |
| 시험 | 도구 입력 스키마 · 봉투 형식 · `coverage` 판정 단위 시험, 호스트 모델별 선택 시험(아래) |

## 검증 계획 (구현 후)

약한 호스트에서 선택 장애가 없다는 주장은 **외부 기준**으로 확인한다. 설계와 같은 변경에서 만든 지표로 통과시키지 않는다.

* 질의 세트: `_experiments/F1~F3/queries.json` 의 기존 질의(자료가 있는 것 · 범위 밖(F3-4 유형) 포함).
* 호스트: 크기가 다른 모델 여러 개. 각각 `depth` 를 안 쓰는 설정과 쓰는 설정.
* 기록: 호출 여부, 고른 `depth`, `next:` 를 따랐는지, 같은 질의의 재호출 횟수, 호출 오류.
* 합격선(사전 고정, 변경하려면 이 문서를 먼저 고친다): 도구 호출 오류 0건, `coverage=none` 뒤 재호출 0건, `next:` 를 무시한 사례 0건. 범위 밖 질의의 불필요 호출 비율은 측정해 보고하되 합격선은 정하지 않았다(기준 자료가 없다).

## 결정 대기

1. 깊이 이름과 개수: `quick`/`standard`/`deep` 3단이 맞는가, `standard` · `deep` 2단으로 줄일 것인가(`quick` 은 신규 구현이 필요한 유일한 단계).
2. `quick` · `standard` 의 `coverage=partial` 을 정의할 것인가(정의하지 않으면 `ok`/`none` 만 낸다).
3. MCP 호출을 `augment_runs` 에 남길 것인가(`depth` · `coverage` 기록용). 남기면 질의 원문이 평문으로 쌓이는 현재 제약(`constraints.md`)이 MCP 에도 적용된다.
4. `deep` 총 예산 기본값(초).
