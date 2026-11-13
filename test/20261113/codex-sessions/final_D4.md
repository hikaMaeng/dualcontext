`it-security` 분야의 초안을 작성했지만, **필수 dry-run은 통과하지 못했습니다.** 허깅페이스 행 API가 반복해서 HTTP 429를 반환해 매핑 출력과 빈 행 여부를 확인할 수 없었습니다.

- 파일: [domain.json](F:/dev/dualcontext/apps/dualcontext/seed-data/domains/it-security/domain.json), [SELECTION.md](F:/dev/dualcontext/apps/dualcontext/seed-data/domains/it-security/SELECTION.md)
- 데이터셋: `AlicanKiraz0/All-CVE-Records-Training-Dataset` · `apache-2.0` · API 기준 297,441행. CVE 원본을 대화 형식으로 자동 가공한 합성 데이터입니다.
- 프로시저: **취약점 심각도와 노출 판단**, **공격 조건과 방어 지점 추출**, **취약 제품과 수정 범위 대조**
- 확인된 한계: 거부된 CVE와 누락된 설명·제품·점수가 표본에 포함됩니다. 내용의 원본 공지 일치 여부는 검증하지 않았습니다.

행 API가 복구되면 지정 dry-run을 다시 실행해 출력 내용을 확인해야 합니다. 데이터 적재와 등록은 하지 않았습니다.