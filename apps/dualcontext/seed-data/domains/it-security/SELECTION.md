# 정보보안 데이터 선정

## 후보 검토

- 채택: [AlicanKiraz0/All-CVE-Records-Training-Dataset API](https://huggingface.co/api/datasets/AlicanKiraz0/All-CVE-Records-Training-Dataset). `apache-2.0`, `gated: false`. CVE 설명, 제품, 때로는 CVSS와 참조 링크를 포함한다. [데이터 카드](https://huggingface.co/datasets/AlicanKiraz0/All-CVE-Records-Training-Dataset/blob/main/README.md)는 CVE 피드를 파싱·보강하고 대화로 생성했다고 밝힌다. 자동 구성된 합성 데이터로 취급한다.
- 제외: [stasvinokur/cve-and-cwe-dataset-1999-2025 API](https://huggingface.co/api/datasets/stasvinokur/cve-and-cwe-dataset-1999-2025). `cc0-1.0`, 비공개 제한 없음. 첫 100개 DESCRIPTION 평균 86.59자로 150자 기준 미달이며 오래된 순서로 시작한다.
- 제외: [wambosec/cve-reconstruction API](https://huggingface.co/api/datasets/wambosec/cve-reconstruction). 비공개 제한은 없으나 `cardData.license`를 확인할 수 없다.
- 제외: [Masterbtc/Kubernetes_documentation API](https://huggingface.co/api/datasets/Masterbtc/Kubernetes_documentation). `apache-2.0`, 비공개 제한 없음. 행 크기 API의 기본 설정이 실패했고 표본에 짧은 자동 생성 설명과 반복이 많다.
- 제외: [mcipriano/stackoverflow-kubernetes-questions API](https://huggingface.co/api/datasets/mcipriano/stackoverflow-kubernetes-questions). `cc-by-sa-4.0`, 비공개 제한 없음. 실제 질문·답변이지만 HTML이 본문에 남고 표본에서 질문 원문 링크가 없어 출처 귀속을 확인하기 어렵다.

## 채택 자료와 표본

- ID: `AlicanKiraz0/All-CVE-Records-Training-Dataset`; 라이선스: `apache-2.0 (합성 데이터)`; 비공개 제한 없음.
- [크기 API](https://datasets-server.huggingface.co/size?dataset=AlicanKiraz0%2FAll-CVE-Records-Training-Dataset) 기준 `default/train` 297,441행. 열은 `System`, `User`, `Assistant`다. 데이터 카드의 분할 설명과 API 결과가 다르므로 API 기준을 사용했다.
- [첫 행 API](https://datasets-server.huggingface.co/first-rows?dataset=AlicanKiraz0%2FAll-CVE-Records-Training-Dataset&config=default&split=train)의 첫 100행에서 Assistant 평균 1,083.69자, 서로 다른 본문 100개였다. 표본 범위에서 심한 중복이나 문자 깨짐은 관찰하지 못했으며 전체 품질을 보증하지는 않는다.
- 실제 표본의 발췌: ① `User`: “Provide a comprehensive technical analysis of CVE-2010-3763, including exploitation vectors, impact assessment, and remediation strategies.” `Assistant`: “Cross-site scripting (XSS) vulnerability in core/summary_api.php in MantisBT before 1.2.3 allows remote attackers to inject arbitrary web script or HTML via the Summary field, a different vector than CVE-2010-3303.”
- ② `User`: “Provide a comprehensive technical analysis of CVE-2024-21709, including exploitation vectors, impact assessment, and remediation strategies.” `Assistant`: 상태 `REJECTED`, 설명 “No description available”.
- ③ `User`: “Provide a comprehensive technical analysis of CVE-2022-46505, including exploitation vectors, impact assessment, and remediation strategies.” `Assistant`: “An issue in MatrixSSL 4.5.1-open and earlier leads to failure to securely check the SessionID field, resulting in the misuse of an all-zero MasterSecret that can decrypt secret data.”

## 한계

- 자동 생성 및 보강 자료이며 원본 보안 공지와의 일치 여부는 검증하지 않았다. 거부된 CVE, 설명 없음, 제품 `n/a`, 점수 누락이 있다. 현재 악용 여부나 최신 패치 정보를 보장하지 않는다.
- 본문은 1,500자, 임베딩은 1,200자로 잘리므로 뒤쪽 제품·참조 정보가 누락될 수 있다. `User`는 일괄 생성된 질문이므로 제목이 장황하다. 항목별 CVE 식별자는 제목과 본문에 있으나 별도 ID 열은 없다.
- 지정 dry-run: `node ../load-datasets.mjs --dry-run it-security`는 행 조회 API가 여섯 차례 HTTP 429를 반환해 종료 코드 1로 실패했다. `domain.json 오류`는 출력되지 않았지만 매핑 결과와 `empty title/body rows`는 출력되지 않아 필수 검증을 통과하지 못했다. first-rows API의 실제 열과 템플릿은 별도로 대조했다.
- 원본 JSONL 대체도 시도했으나 큰 파일 다운로드가 지연되어 중단했다. 다른 55MB CVE JSONL 역시 25초 제한에서 시간 초과였다. 현재 설정은 행 API의 데이터셋 방식이며, API 복구 후 dry-run을 다시 실행하고 결과를 읽어야 한다.
