[industry-tech](/F:/dev/dualcontext/apps/dualcontext/seed-data/domains/industry-tech) 분야를 만들고 dry-run을 통과했습니다.

- 데이터셋: `KrossKinetic/SP500-Financial-News-Articles-Time-Series` · MIT · 4,589행
- 검증: 종료 코드 0, 빈 제목·본문 `0/5`, 누락된 매핑 열 없음
- 프로시저: 기업과 제품의 경쟁 근거 비교, 산업 변화의 영향 경로, 시점별 기업 동향과 전환점, 기업 발표와 전망의 실현 근거 점검

행 API가 429를 반환해 같은 저장소의 원본 JSONL을 사용했습니다. 실제 확인한 앞 300행은 회사명 순으로 편향되어 산업 전체를 대표하지 않습니다. 허깅페이스의 MIT 표기는 확인했지만 원 기사별 재배포 권한과 실제 임베딩·라우팅 성능은 확인하지 못했습니다. 자세한 후보와 샘플은 [SELECTION.md](/F:/dev/dualcontext/apps/dualcontext/seed-data/domains/industry-tech/SELECTION.md)에 기록했습니다.