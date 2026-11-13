`software-dev` 분야를 만들고 dry-run을 통과했습니다.

- 파일: [domain.json](F:/dev/dualcontext/apps/dualcontext/seed-data/domains/software-dev/domain.json), [SELECTION.md](F:/dev/dualcontext/apps/dualcontext/seed-data/domains/software-dev/SELECTION.md)
- 데이터셋: `code-rag-bench/stackoverflow-posts` · `cc-by-sa-4.0` · 1,967,920행
- dry-run: 종료 코드 0, `empty title/body rows: 0/5`. 첫 시도는 HTTP 429로 실패했고 재실행에 성공했습니다.
- 프로시저: **[개발] 오류 원인과 재현 진단**, **[개발] 해결 대안과 호환성 비교**, **[개발] 코드 동작과 경계 사례 검토**, **[개발] 답변 근거와 최신성 평가**

확인한 5개 행에서는 본문에 질문과 첫 답변이 들어갔습니다. 다만 전체 데이터에서 긴 질문 때문에 답변이 잘릴 가능성이 있고, 제목에도 답변 일부가 섞일 수 있습니다. 채택 답변과 작성자 정보는 행에서 확인되지 않았으며, 합성 여부와 전체 중복률은 확인하지 못했습니다. 크기 API가 `partial=true`를 반환해 전체 행 수도 추후 재확인이 필요합니다.