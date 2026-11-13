# 소프트웨어 개발 데이터셋 선정 기록

## 후보와 판단

- 채택 후보: `code-rag-bench/stackoverflow-posts` — [허깅페이스 메타데이터](https://huggingface.co/api/datasets/code-rag-bench/stackoverflow-posts)의 `cardData.license=cc-by-sa-4.0`, `gated=false`. 질문과 복수 답변이 같은 `text`에 들어 있고 원문 URL이 있다. 영어 자료이며 원문의 답변 정확성과 최신성은 별도 확인해야 한다.
- 제외: `mikex86/stackoverflow-posts` — [메타데이터](https://huggingface.co/api/datasets/mikex86/stackoverflow-posts)의 라이선스가 `other`.
- 제외: `CoIR-Retrieval/stackoverflow-qa` — [메타데이터](https://huggingface.co/api/datasets/CoIR-Retrieval/stackoverflow-qa)에 `cardData.license`가 확인되지 않음.
- 제외: `williamTLmiller/python-documentation-rag-corpus` — [메타데이터](https://huggingface.co/api/datasets/williamTLmiller/python-documentation-rag-corpus)의 라이선스가 `cc-by-nc-4.0`.
- 제외: `mteb/StackOverflowQA` — [메타데이터](https://huggingface.co/api/datasets/mteb/StackOverflowQA)는 MIT, 비공개 제한 없음. 다만 [크기 API](https://datasets-server.huggingface.co/size?dataset=mteb%2FStackOverflowQA)에서 질문(`queries`)과 답변 후보(`corpus`)가 별도 구성으로 분리되어 단일 행 매핑만으로 질문·답변 쌍을 만들 수 없음.

## 채택 후보 확인

- 데이터셋: `code-rag-bench/stackoverflow-posts`, `default`, `train`; 라이선스 `cc-by-sa-4.0`, gated `false`. [카드](https://huggingface.co/datasets/code-rag-bench/stackoverflow-posts/raw/main/README.md), [메타데이터](https://huggingface.co/api/datasets/code-rag-bench/stackoverflow-posts).
- [size 응답](https://datasets-server.huggingface.co/size?dataset=code-rag-bench%2Fstackoverflow-posts): 1,967,920행. 응답 `partial=true`이므로 전체 크기는 추후 재확인 필요.
- [first-rows 응답](https://datasets-server.huggingface.co/first-rows?dataset=code-rag-bench%2Fstackoverflow-posts&config=default&split=train)의 열: `text`, `meta.language`, `meta.question_score`, `meta.source`, `meta.timestamp`, `meta.url`. 사용 템플릿은 `text`, `meta.url`만 참조한다.
- Stack Overflow를 출처로 표시한 자료로, 확인한 카드 및 표본에서 합성 데이터라는 표시는 발견하지 못했다. 데이터 전체의 생성 여부는 확인하지 못했다.
- 최초 5개 표본의 `text` 길이: 5,876 / 3,522 / 58,707 / 57,909 / 24,482자. 평균 30,099.2자. 같은 5개에서 질문과 답변은 모두 구별되며 동일 텍스트는 없었다. 전체 중복률은 확인하지 못했다.

## 실제 샘플 행 발췌

각 항목은 실제 `text`의 질문과 첫 답변 앞부분을 발췌했다. 원문 전체가 아니다.

1. `meta.url=https://stackoverflow.com/questions/4`: `Q: How to convert Decimal to Double in C#?` / `A: Why are you dividing by 5000? Just set the TrackBar's Minimum and Maximum values between 0 and 100`.
2. `meta.url=https://stackoverflow.com/questions/6`: `Q: Why did the width collapse in the percentage width child element in an absolutely positioned parent on Internet Explorer 7?` / `A: The div needs to have a defined width:`.
3. `meta.url=https://stackoverflow.com/questions/9`: `Q: How do I calculate someone's age based on a DateTime type birthday?` / `A: My suggestion` 다음에 `int age = (int) ((DateTime.Now - bday).TotalDays/365.242199);`.

## dry-run 및 한계

- `node ../load-datasets.mjs --dry-run software-dev`: 첫 실행은 HTTP 429로 종료 코드 1, 재실행은 종료 코드 0. 총 1,967,920행, 5행 수신, 열 `text`, `meta`, `empty title/body rows: 0/5`, domain.json 오류 없음. 실제 5행의 제목·본문·임베딩 앞부분을 별도로 확인했으며 질문과 첫 답변이 본문 제한 내에 들어 있었다. 객체 JSON이 본문에 섞이지 않았다.
- 각 `text`는 질문 요약 전용 열 없이 질문과 여러 답변이 이어진다. 제목은 그 앞 300자로 질문이 짧으면 답변이나 코드도 섞이며, 본문은 1,500자로 잘려 질문이 길면 답변이 빠질 수 있다. 채택 답변, 답변 작성자 및 점수는 별도 열로 제공되지 않아 확인할 수 없다. 제공 `meta.timestamp`를 원문 작성일로 단정하지 않는다.
- 공개 Q&A의 답변에는 오래되었거나 잘못된 코드와 상충하는 설명이 섞일 수 있다. 원문과 현재 공식 문서에서 검증해야 한다. 재사용 시 CC BY-SA 4.0의 저작자 표시와 동일조건변경허락을 검토해야 하며 행에 작성자 정보가 없어 원문에서 확인해야 한다.
- 적재는 앞부분만이 아니라 로더가 여러 위치에서 300행을 선택하므로, 최초 5행 검사는 전체 표본 품질을 보증하지 않는다.
