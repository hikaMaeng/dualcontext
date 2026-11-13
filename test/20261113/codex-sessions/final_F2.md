질의 4개를 순차 실행했고, **4개 모두 서버 응답을 받았습니다.** 다만 전후 답변이 모두 생성된 질의는 없어 증강 효과를 직접 비교할 수 없었습니다.

생성된 답변만 기준으로 정확한 사실 적중률은 **증강 전 0/4 → 증강 후 2/13**입니다. 분모가 서로 다른 질의에서 나왔으므로 성능 변화로 해석할 수 없습니다. 기대한 조사원은 4/4건 선택됐고, 기대한 프로시저 두 개가 모두 선택된 질의는 1/4건이었습니다.

주요 발견은 다음과 같습니다.

- 보안 질의에서는 요청한 CVE 세 건이 모두 검색되지 않았습니다. 증강 후 답변은 판단을 보류했습니다.
- 논문 질의에서는 관련 행 제목이 검색됐어도 전달 본문이 잘려 필요한 성능 수치가 빠졌습니다.
- GPU와 개발 질의에서는 일부 정답 행이 검색됐지만, 각각 전 답변과 후 답변이 실패해 비교할 수 없었습니다.

교차 언어 검색 실패의 원인과 프로시저가 답변 형식에 미친 인과적 효과는 확인하지 못했습니다.

[보고서](F:/dev/dualcontext/apps/dualcontext/seed-data/domains/_experiments/F2/report.md) · [질의와 정답](F:/dev/dualcontext/apps/dualcontext/seed-data/domains/_experiments/F2/queries.json) · [사실별 채점](F:/dev/dualcontext/apps/dualcontext/seed-data/domains/_experiments/F2/scores.json) · [원본 응답 폴더](F:/dev/dualcontext/apps/dualcontext/seed-data/domains/_experiments/F2/runs)