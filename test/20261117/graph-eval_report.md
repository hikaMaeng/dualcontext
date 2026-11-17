# 그래프 배치 · 증강 실측 보고서 (decompose · reevaluate)

- 일시: 2026-11-17 06:49~07:42 UTC, 배포 서버 127.0.0.1:18081(`npm run deploy dualcontext` 로 올린 빌드, 커밋 25ba6f7 의 그래프).
- 스크립트: `test/20261117/graph-eval.mjs`. 원자료: `graph-eval.jsonl`(신규 16행), `graph-eval-existing.jsonl`(기존 서버 기록 16행), 로그 `graph-eval.log`.
- 신규 실행 한도 override(저장 설정 불변): maxLevels 3, maxItems 8, reevaluate {maxRounds 3, **passScore 95**, maxMissing 0, maxNewItems 3}. passScore 를 높여 보강 라운드가 실제로 돌게 했다. 동시 3건.
- 질의와 기대는 스크립트에서 직접 만든 것이다. 답변의 도메인 품질은 평가하지 않았고 **그래프 구조 · 서버 조립과 답변 프롬프트의 일치**만 검사했다.

## 검사 기준(스크립트 inspect)

프런트의 `buildRunGraph` · `arrangeEdges` · `layoutGraph` · `groupFrames` · `feedPaths` 를 실제 서버 기록(`GET /api/admin/runs/:id`)에 적용해 가로 · 세로 모두 확인.
1. 분류 그래프 수 == 아이템이 있는 라운드 수.
2. derive 간선(질의 분해 · 평가 r → 라운드 아이템)의 도착 == 그 라운드의 **최상위 아이템**(같은 라운드의 다른 아이템이 사전으로 필요로 하지 않는 것).
3. 같은 그래프 안에서 의존하는 아이템의 층 < 사전의 층(위에서 아래로).
4. 답변 노드의 층 > 그 답변을 먹이는 그래프 전체의 층. 틀→답변 조립선은 (그래프, 답변) 쌍마다 정확히 한 줄이고 구성원이 feed 간선과 같다. 노드 겹침 없음. 그려지는 선은 층을 앞으로만 간다.
5. 최종 답변 노드의 이웃(패널 "조립에 든 1차 아이템") == 서버 마지막 assemble 단계 기록.
6. **실제 동작**: 답변 노드(`answer:<r>` · `answer:after`)에 저장된 호출 프롬프트에 그 라운드 assemble 단계의 1차 아이템이 `## 이름` 섹션으로 실렸는지(전체 일치 `full`, 노드 문서가 6만 자에서 잘린 경우 잘린 앞부분이 기대 조립문의 접두인지 `prefix`), 서버가 기록한 컨텍스트 길이(`rounds[].contextChars` · `run.context`)와 기대 조립 길이가 같은지, 1차가 아닌 아이템이 별도 섹션으로 실리지 않았는지, 보강으로 새로 만든 1차 아이템이 다음 라운드 assemble 기록에 있는지.

## 결과 요약 (32개 실행: 기존 16 + 신규 16)

| 구분 | 수 | 설명 |
|---|---|---|
| 아이템이 있어 그래프 · 조립 검사 대상 | 18 | decompose 8, reevaluate 10 |
| 위 18건의 불변식 위반 | **0** | 그래프 · 조립 · 프롬프트 대조 전부 통과 |
| 아이템 0개(`no-items`) | 11 | 질의가 이 서버 자료와 맞지 않았거나 분해가 비었다. 그래프는 질의 · 질의 분해 · 증강 전 답변만 그려진다. 검사할 아이템 없음 |
| 실행 오류 | 3 | 아래 "발견" 참고 |

보강 라운드가 실제로 일어난 실행: #246(보강 1), #261(보강 5, 라운드 3), #273(보강 5, 그래프 2), #279(보강 5 → 1, 그래프 3, 라운드 3). 이 4건 모두 보강으로 새로 만든 1차 아이템이 다음 라운드 답변 조립 기록에 들어 있고(`supplementFed` 1 · 1 · 3 · 2), 라운드 답변과 최종 답변 프롬프트가 조립본과 일치했다.

### 실행별 표 (jsonl 에서 생성)

| 질의 | 모드 | run | 상태 | 정지 | 아이템 | 그래프 | 라운드 | 점수 | 보강 | 답변 대조 |
|---|---|---|---|---|---|---|---|---|---|---|
| (기존)244 | decompose | 244 | ok | mode-decompose | 5 | 1 | 0 | - | - | after:full |
| (기존)246 | reevaluate | 246 | ok | no-new-items | 9 | 2 | 2 | 92,90 | 1,0 | 0:full 1:full |
| (기존)248 | decompose | 248 | ok | mode-decompose | 8 | 1 | 0 | - | - | after:prefix |
| (기존)249 | reevaluate | 249 | ok | passed | 8 | 1 | 1 | 90 | 0 | 0:prefix |
| (기존)251 | decompose | 251 | ok | mode-decompose | 8 | 1 | 0 | - | - | after:full |
| (기존)252 | reevaluate | 252 | ok | passed | 8 | 1 | 1 | 95 | 0 | 0:full |
| (기존)255 | reevaluate | 255 | ok | passed | 8 | 1 | 1 | 94 | 0 | 0:full |
| (기존)257 | decompose | 257 | ok | mode-decompose | 3 | 1 | 0 | - | - | after:full |
| (기존)258 | reevaluate | 258 | ok | passed | 6 | 1 | 1 | 95 | 0 | 0:full |
| (기존)260 | decompose | 260 | ok | mode-decompose | 8 | 1 | 0 | - | - | after:full |
| (기존)261 | reevaluate | 261 | ok | max-rounds | 13 | 2 | 3 | 88,75,92 | 0,5,0 | 0:full 1:full 2:prefix |
| (기존)263 | decompose | 263 | ok | mode-decompose | 8 | 1 | 0 | - | - | after:full |
| tax | decompose | 274 | ok | mode-decompose | 8 | 1 | 0 | - | - | after:full |
| cross2 | decompose | 282 | ok | mode-decompose | 8 | 1 | 0 | - | - | after:full |
| k8s | reevaluate | 271 | ok | no-missing | 8 | 1 | 1 | 90 | 0 | 0:full |
| react | reevaluate | 279 | ok | passed | 8 | 3 | 3 | 92,92,95 | 5,1,0 | 0:full 1:full 2:full |
| sql-index | reevaluate | 273 | ok | passed | 13 | 2 | 2 | 90,95 | 5,0 | 0:prefix 1:prefix |
| cross2 | reevaluate | 283 | ok | no-missing | 2 | 1 | 1 | 85 | 0 | 0:full |

`no-items` 11건: 기존 254 · 264 · 266 · 267, 신규 git-undo(decompose 270 · reevaluate 268), sql-index decompose 272, k8s decompose 269, tls(276 · 277), react decompose 278. 같은 질의가 모드에 따라 아이템이 나오기도(k8s reevaluate 8개, react reevaluate 8개) 비기도(k8s · react decompose) 해 분해가 비결정적이다.

## 화면 확인

- #263(decompose): 1차 아이템 2개가 틀 맨 위, 사전이 아래, 틀 아래에서 최종 답변으로 조립선 1줄(`group-1>answer:after`).
- #279(reevaluate, 그래프 3): 그래프 2(라운드 0 평가의 부족 컨텍스트 반영)도 최상위 `ESLint exhaustive-deps 설정 방법` 이 맨 위, 사전이 아래. 조립선 6줄(`group-1>answer:0,1,2`, `group-2>answer:1,2`, `group-3>answer:2`). 최종 답변 패널의 "조립에 든 1차 아이템" 4개가 그래프 1~3 의 1차 아이템.

## 발견 · 한계

- **실행 오류 3건(그래프와 무관, 이번에 고치지 않음)**: tax reevaluate(275), labor decompose(280) · reevaluate(281) 가 질의 분해 단계에서 "응답에서 기대한 모양의 JSON 을 찾지 못했다"로 실패. 모델이 `{"items":[...` 로 시작하는 긴 한국어 응답을 냈으나 JSON 으로 파싱되지 않았다. 같은 질의의 labor 는 두 모드 모두 실패 → 질의 · 응답 의존적. 분해 단계에 재시도가 있는지 별도 확인이 필요하다.
- **기각된 가설**: (1) "최종 답변이 사전 아이템 컨텍스트를 직접 받는다" — 18건 모두 조립본에 사전 아이템 별도 섹션 없음(`stray` 0). (2) 처음 3건(248 · 249 · 261)의 프롬프트 불일치 — 노드 문서의 6만 자 절단과 `…(이하 N자 생략)` 표지를 스크립트가 처리하지 못한 탓이었고 서버 · 그래프 결함이 아니었다(스크립트 수정 후 통과).
- **직접 대조의 범위**: 컨텍스트가 6만 자를 넘는 248 · 249 · 261(answer:2) · 273(answer:0 · 1)은 프롬프트 앞 59,721자만 조립본과 직접 대조했다. 나머지는 서버가 기록한 컨텍스트 길이 == 기대 조립 길이로만 확인했다. 특히 261 의 보강 아이템 i9 는 6만 자 뒤쪽이라 프롬프트 본문으로 직접 보지 못했고 조립 기록(assemble 단계)에 있음만 확인했다.
- **표본 한계**: 보강 라운드가 돈 실행이 4건뿐이고, 아이템이 있는 질의는 자료가 있는 도메인에 몰려 있다. 최대 그래프 수는 3.
