# 모드 매트릭스 측정 보고서 (classic · decompose · reevaluate)

- 일시: 2026-11-17 05:01~06:21 UTC, 배포 서버 127.0.0.1:18081 (`npm run deploy dualcontext` 로 올린 빌드, 로컬 채팅 모델).
- 스크립트: `test/20261117/mode-matrix-eval.mjs`, 원자료: `test/20261117/mode-matrix.jsonl`(24행), 로그: `mode-matrix.log`.
- 한도 override(저장 설정은 불변): maxLevels 3, maxItems 8, reevaluate {maxRounds 2, passScore 80, maxMissing 0, maxNewItems 3}. 동시 3건. 채팅 유휴 600초 · 총 1시간, 답변·평가 재시도 3회.
- 질의와 기대(분류 라벨)는 스크립트에서 직접 만든 것이다. 도메인 질의 정답 품질은 평가하지 않았고, **구조 불변식과 정지 사유**만 검사했다.

## 검사한 불변식 (스크립트 inspect)

상태 ok · 증강 전 답변 존재 · (컨텍스트가 있으면) 증강 후 답변 존재 · classic 은 plan 없음·노드 classic/answer:before/answer:after · 계획 모드는 plan.stop 비null · 정지 사유가 모드와 일치 · 간선이 없는 아이템을 가리키지 않음 · 순환 없음 · top 존재 · steps seq 연속 · build 단계가 실제 아이템 · 아이템마다 노드와 augment · 의존 아이템이 있으면 provided 기록 · reevaluate 는 answer:n/evaluate:n 노드와 pass 판정이 설정과 일치.

## 결과표 (jsonl 에서 생성)

| 질의 | 모드 | run | 소요(s) | 정지 | 아이템 | 라운드 | 점수 | 보강 | 컨텍스트(자) | 후 답변(자) |
|---|---|---|---|---|---|---|---|---|---|---|
| legal | classic | 245 | 227 | - | - | - | - | - | 7084 | 2177 |
| legal | decompose | 244 | 4782(서버 기록, 아래 참조) | - | - | - | - | - | - | - |
| legal | reevaluate | 246 | 604 | no-new-items | 9 | 2 | [92, 90] | [1, 0] | 49681 | 1958 |
| docker | classic | 247 | 34 | - | - | - | - | - | 2534 | 2156 |
| docker | decompose | 248 | 584 | mode-decompose | 8 | 0 | - | - | 78938 | 3381 |
| docker | reevaluate | 249 | 667 | passed | 8 | 1 | [90] | [0] | 87751 | 3996 |
| medical | classic | 250 | 72 | - | - | - | - | - | 2186 | 1279 |
| medical | decompose | 251 | 501 | mode-decompose | 8 | 0 | - | - | 49590 | 2816 |
| medical | reevaluate | 252 | 601 | passed | 8 | 1 | [95] | [0] | 29952 | 2034 |
| finance | classic | 253 | 76 | - | - | - | - | - | 4524 | 1385 |
| finance | decompose | 254 | 31 | no-items | 0 | 0 | - | - | 0 | 0 |
| finance | reevaluate | 255 | 607 | passed | 8 | 1 | [94] | [0] | 24566 | 2762 |
| code | classic | 256 | 51 | - | - | - | - | - | 23824 | 3930 |
| code | decompose | 257 | 107 | mode-decompose | 3 | 0 | - | - | 49586 | 2399 |
| code | reevaluate | 258 | 219 | passed | 6 | 1 | [95] | [0] | 50318 | 3617 |
| cross | classic | 259 | 182 | - | - | - | - | - | 7486 | 2181 |
| cross | decompose | 260 | 311 | mode-decompose | 8 | 0 | - | - | 46438 | 3778 |
| cross | reevaluate | 261 | 1552 | max-rounds | 13 | 3 | [88, 75, 92] | [0, 5, 0] | 72251 | 2771 |
| english | classic | 262 | 39 | - | - | - | - | - | 3346 | 1968 |
| english | decompose | 263 | 330 | mode-decompose | 8 | 0 | - | - | 17759 | 3179 |
| english | reevaluate | 264 | 58 | no-items | 0 | 0 | - | - | 0 | 0 |
| chitchat | classic | 265 | 22 | - | - | - | - | - | 0 | 0 |
| chitchat | decompose | 266 | 30 | no-items | 0 | 0 | - | - | 0 | 0 |
| chitchat | reevaluate | 267 | 13 | no-items | 0 | 0 | - | - | 0 | 0 |

## 판정

- 24개 실행 모두 서버에서 `status=ok` 로 끝났다(법률/decompose 244 는 하니스가 45분에 포기했으나 서버는 4,781,635ms 후 ok. 그 실행의 불변식 자동 검사는 못 돌렸고, 아래 수치는 API 를 직접 조회한 것이다).
- 불변식 위반: **23개 실행 0건**. 모드별 정지 사유는 기대와 일치(decompose = mode-decompose 또는 no-items, reevaluate = passed · max-rounds · no-new-items · no-items).
- 모드별 정지: reevaluate 는 passed 5, max-rounds 1(교차 도메인, 점수 88→75→92, 보강 0·5·0), no-new-items 1, no-items 2(english, chitchat). 숫자는 위 표 원자료 기준.

## 발견

1. **추론 폭주 호출이 1시간을 먹었다 (미수정, 후속).** run 244 의 `item:i3` prerequisites 호출이 `chat exceeded total time limit of 3600s (reasoningChars=577155 contentChars=0)` 로 실패했다. 추론 토큰이 계속 흘러 유휴 600초가 걸리지 않았고 총 1시간 상한에서야 끊겼다. 실패는 아이템 단위로 격리되어 5개 아이템이 모두 built 로 끝났고 계획 시간만 3,830,872ms 로 늘었다. 증강 전 답변도 950,420ms 걸렸다. 같은 질의의 reevaluate(246)는 616초에 끝났으므로 모델 서버의 일시적 상태로 보이나, 원인은 이 측정으로 증명하지 못했다. 대응 후보: 내용 없이 추론만 N자 넘으면 중단하는 별도 상한(사용자가 "10분은 넉넉히"라 한 정책과의 균형이 필요해 임의로 넣지 않았다).
2. **analyze 가 빈 아이템을 돌려 계획이 no-items 로 끝난 경우:** finance/decompose(254), english/reevaluate(264)는 `{"items": []}` 응답(분석 응답 원문은 노드 `analyze` 에 있다). 같은 finance 질의가 reevaluate(255)에서는 아이템 8개를 만들었으므로 모델 응답의 비결정성이다. no-items 면 컨텍스트가 비어 증강 전 답변만 나가고 증강 후 답변은 없다(정상 경로). 코드 결함은 아니나 도메인 질의에서 이것이 나오면 증강 이득이 사라지는 점은 알아둘 것.
3. chitchat(무관 질의)은 세 모드 모두 컨텍스트 0자로 빠르게 끝났다(13~30초). 조사원 없는 질의의 비용 폭주는 없다.

## 반증된 가설

- 「재시도 3회 + 600초 때문에 answer-failed 가 반복된다」: 이번 24건에서 `answerAfterError` 가 있는 실행은 0건이었다(jsonl). 이전 238·240·242 의 answer-failed 는 이번 설정에서 재현되지 않았다. 다만 부하(동시 3건) 조건이 같은지는 확인하지 못했다.
- 「decompose 는 reevaluate 보다 항상 빠르다」: 법률 질의에서 반대였다(decompose 4782초 vs reevaluate 616초). 1번의 폭주 호출 때문이며 모드 특성이 아니다.

## 미검증

- 둘째 이상의 분류 그래프(보강 라운드)를 화면에서 본 것: cross/reevaluate(261) 에 라운드 3개가 있으나 이번에는 API 수준 검사만 했다.
- 새 창 팝업, 패널 확대, 다크·RTL 화면.
- 답변 품질(정답성)은 평가하지 않았다.
