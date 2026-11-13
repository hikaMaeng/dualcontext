4개 질의 모두 실행에 성공했습니다. **비교 가능한 Q1~Q3의 사실 적중률은 증강 전 2/12(16.7%)에서 후 8/12(66.7%)로 올랐습니다.** Q4는 증강 전 답변이 `fetch failed`로 생성되지 않아 비교에서 제외했으며, 증강 후에는 4/4를 맞혔습니다.

기대 조사원은 네 질의 모두 빠짐없이 선택됐습니다. 다만 Q1에서 지정한 뉴스 행을 찾지 못했고, 기대한 프로시저도 일부 누락됐습니다.

- GPU 사양과 CVE 경로·버전의 잘못된 답을 증강 후 바로잡은 사례가 있었습니다.
- 정답 행을 찾았더라도 본문 발췌가 잘려 필요한 문장이 전달되지 않은 사실이 3개 있었습니다. 이 중 하나는 증강 전에는 맞혔으나 후에는 놓쳤습니다.
- 증강 후에도 자료에 없는 CUDA 필드 해석이나 CVE 관련성을 단정·추정한 사례가 있었습니다.

[보고서](F:/dev/dualcontext/apps/dualcontext/seed-data/domains/_experiments/F1/report.md) · [사실별 채점](F:/dev/dualcontext/apps/dualcontext/seed-data/domains/_experiments/F1/scores.json) · [사전 고정 질의](F:/dev/dualcontext/apps/dualcontext/seed-data/domains/_experiments/F1/queries.json)

표본이 작고 채점자가 모델이므로 일반화는 어렵습니다. 보안 자료는 합성 기록이며 실제 CVE의 최신 진위는 확인하지 않았습니다.