# 산업·기술 자료 선택 기록

## 후보

- 채택: [KrossKinetic/SP500-Financial-News-Articles-Time-Series](https://huggingface.co/api/datasets/KrossKinetic/SP500-Financial-News-Articles-Time-Series). `cardData.license=mit`, `gated=false`. S&P 500 기업별 실제 기사, 제목·날짜·본문·원문 링크가 있다. [데이터셋 카드](https://huggingface.co/datasets/KrossKinetic/SP500-Financial-News-Articles-Time-Series)는 Kaggle 원본을 명시한다. 허깅페이스의 MIT 표기는 확인했으나 원 기사별 재배포 권한은 독립적으로 확인하지 못했다.
- 제외: [HackerNoon/tech-company-news-data-dump](https://huggingface.co/api/datasets/HackerNoon/tech-company-news-data-dump): MIT이지만 `gated=auto`.
- 제외: [shaurya03/tech-news-daily](https://huggingface.co/api/datasets/shaurya03/tech-news-daily): 공개 상태지만 `cardData.license`가 없다.
- 제외: [MongoDB/tech-news-embeddings](https://huggingface.co/api/datasets/MongoDB/tech-news-embeddings): Apache-2.0이나 확인한 행들이 짧게 잘린 기사 발췌이고 무관한 결과도 포함한다.
- 제외: [91veMe4Plus-Project/korean_news_corpus](https://huggingface.co/api/datasets/91veMe4Plus-Project/korean_news_corpus): MIT이나 크기 API가 빈 데이터셋으로 응답하고 행을 확인할 수 없었다.
- 제외: [David-Chew-HL/Tech-Stocks-News](https://huggingface.co/api/datasets/David-Chew-HL/Tech-Stocks-News): Apache-2.0이나 별도의 기사 제목 열이 없다.

## 확인한 자료

- ID: `KrossKinetic/SP500-Financial-News-Articles-Time-Series`; 라이선스: MIT; `gated=false`.
- 크기 API와 실제 JSONL 파싱 결과 모두 4,589행. 열: `id_`, `links`, `symbol`, `company`, `Title`, `Text`, `Publishdate`.
- 합성 여부: 카드와 행은 기존 금융 뉴스 기사 수집본임을 가리킨다. 합성 기사라는 표시는 발견하지 못했으나 모든 기사의 생성 과정을 독립 검증하지는 못했다.
- 앞 300행 실제 검사: 본문 평균 3,883.3자, 제목 중복 4건, 빈 제목·본문 0건. 텍스트 샘플은 깨지지 않았다. 제목 중복은 정확히 같은 문자열 기준이며 전문 중복률은 별도 미확인.
- 행 API `first-rows`와 `size`는 성공했지만 `rows` 호출은 429를 반환해 동일 저장소의 원본 JSONL을 사용한다. 파일 방식은 앞 300행만 사용하므로 회사명 알파벳 순 편향이 크다. 실제 이 범위는 3M부터 Analog Devices까지 31개 회사이며 전체 산업을 대표하지 않는다.

## 실제 샘플 3행 (본문 앞부분 발췌)

1. `id_=0`, `company=3M`, `Publishdate=2023-06-05`, `Title=Stocks making the biggest moves midday: Palo Alto Networks, 3M, Amedisys, Target and more`. `Text`: “A view of the exterior of the new Dutch head office of international technology company 3M in Delft, Netherlands, November 5, 2014.”
2. `id_=1`, `company=3M`, `Publishdate=2022-07-26`, `Title=3M will spin off its health-care business into a new public company`. `Text`: “3M announced Tuesday it will spin off its health-care business into a separate publicly traded company.”
3. `id_=2`, `company=3M`, `Publishdate=2023-01-24`, `Title=Stocks making the biggest moves midday: 3M, Paccar, Bed Bath & Beyond, AMD and more`. `Text`: “A woman walks near a Bed Bath & Beyond branch on January 11, 2023 in New York City.”

## dry-run 및 한계

`node ../load-datasets.mjs --dry-run industry-tech`: 종료 코드 0, 전체 4,589행·샘플 5행, `empty title/body rows: 0/5`, 없는 템플릿 열 없음. 출력된 세 행의 제목·날짜와 URL이 포함된 본문·원문 임베딩 접두부를 직접 확인했다. 본문은 1,500자, 임베딩 입력은 적재 시 1,200자로 잘려 긴 기사의 후반 근거가 누락된다. 출력상 embed 길이는 자르기 전이다.

자료는 과거 영문 금융·주가 중심 기사이며 산업 전체의 균형 잡힌 표본이나 최신 뉴스가 아니다. 한 기사에 여러 기업이 등장하고 해당 회사가 본문 앞부분에 없을 수 있다. 원문은 보도·인용·전망을 포함하므로 사실과 예측을 구분하고 날짜 및 원문을 확인해야 한다. 한국어 검색 정확도와 실제 적재·임베딩·라우팅 성능은 검증하지 않았다.
