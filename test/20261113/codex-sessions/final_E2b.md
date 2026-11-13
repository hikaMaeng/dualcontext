**질의 4개를 실행했고 HTTP 응답 4개를 저장했습니다.** 다만 증강 전 답변은 1개, 증강 후 답변은 3개만 생성됐습니다. 나머지는 서버 응답 내부에서 시간 초과였습니다.

사실 적중률의 원시 집계는 **증강 전 0/3 → 증강 후 4/9**입니다. 분모가 달라 개선율로 비교할 수 없습니다. 또한 Q1·Q2는 질문이 사전 선정 행을 충분히 특정하지 못해 무효로 표시했습니다. 이를 제외하면 증강 전은 평가 불가, 증강 후는 3/3이며, **유효 질의 중 전후 답변이 모두 생성된 사례는 없습니다.**

- 기대 조사원은 4개 질의 모두 선택됐지만, 매번 추가 조사원 2개도 선택됐습니다. 기대 프로시저 둘이 모두 선택된 것은 1개 질의였습니다.
- 법률 질의는 지정된 세 행을 모두 회수했고 증강 후 세 사실이 맞았습니다. 다만 현행법 일치 여부를 충분한 시점 근거 없이 단정한 부분이 있었습니다.
- 의학 질의는 지정 자료와 프로시저 둘을 모두 회수했지만 양쪽 답변이 시간 초과였습니다. 자료 회수가 최종 답변 생성까지 이어지는지는 확인하지 못했습니다.

프로시저가 답변 형식을 **실제로 바꿨는지**, 반복 실행의 안정성, 외부 사실·현행 법령의 정확성은 확인하지 못했습니다.

산출물: [보고서](F:/dev/dualcontext/apps/dualcontext/seed-data/domains/_experiments/E2b/report.md), [질의](F:/dev/dualcontext/apps/dualcontext/seed-data/domains/_experiments/E2b/queries.json), [채점](F:/dev/dualcontext/apps/dualcontext/seed-data/domains/_experiments/E2b/scores.json), [실행 응답](F:/dev/dualcontext/apps/dualcontext/seed-data/domains/_experiments/E2b/runs).