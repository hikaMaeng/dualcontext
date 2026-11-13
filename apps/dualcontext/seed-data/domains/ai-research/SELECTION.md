# AI 연구 데이터셋 선정

확인일: 2026-11-13. 허깅페이스 API 응답 기준이다.

## 후보

- **채택 후보: `kiyer/arxiv_cs.LG`** — [데이터셋 API](https://huggingface.co/api/datasets/kiyer/arxiv_cs.LG)에서 `cardData.license=mit`, `gated=false`. 머신러닝 논문 제목과 초록, 발표일과 원문 링크가 있고 실제 처음 세 행이 LLM 평가, 강화학습, LLM 희소 활성화에 관련된다. 다만 데이터셋 카드에 표시된 MIT가 개별 논문 원문 전체에 대한 권리까지 뜻하는지는 확인하지 못했다.
- `KETI-NLP/aihub_paper_summarization` — [데이터셋 API](https://huggingface.co/api/datasets/KETI-NLP/aihub_paper_summarization)의 라이선스는 apache-2.0이고 공개이나, size API가 미지원 데이터셋 스크립트로 HTTP 500을 반환하고 first-rows는 404였다. 행을 확인하지 못해 제외했다.
- `charlieoneill/cs.LG` — [데이터셋 API](https://huggingface.co/api/datasets/charlieoneill/cs.LG)에 `cardData.license`가 없어 제외했다.
- `gfissore/arxiv-abstracts-2021` — [데이터셋 API](https://huggingface.co/api/datasets/gfissore/arxiv-abstracts-2021)는 cc0-1.0과 공개 상태를 표시하지만, 첫 행들이 입자물리·수학·천문 등 여러 분야에 섞여 있어 300행 한정 AI 조사원 자료로 부적합하다.
- `UniverseTBD/arxiv-abstracts-large` — [데이터셋 API](https://huggingface.co/api/datasets/UniverseTBD/arxiv-abstracts-large)의 afl-3.0은 요청된 허용 목록에 없어 제외했다.
- `aitetic/arxiv-cs` — [데이터셋 API](https://huggingface.co/api/datasets/aitetic/arxiv-cs)의 라이선스가 `other`라 제외했다. 첫 두 행에서도 같은 제목과 초록이 중복되었다.

## 채택 후보의 확인 결과

- 데이터셋: `kiyer/arxiv_cs.LG`, `default/train`, 영문, 데이터셋 카드상 MIT, gated false.
- [size API](https://datasets-server.huggingface.co/size?dataset=kiyer%2Farxiv_cs.LG): 100,000행. 예정 적재량은 300행이다.
- [first-rows API](https://datasets-server.huggingface.co/first-rows?dataset=kiyer%2Farxiv_cs.LG&config=default&split=train)의 실제 열: `arxiv_id`, `title`, `abstract`, `link`, `authors`, `updated`, `published`. 별도의 개별 분류 열은 없으며 본문 분류 표기는 데이터셋 이름의 cs.LG를 가리킨다.
- 처음 세 초록은 논문 저자의 초록으로 보이며 합성이라는 표시는 확인하지 못했다. 데이터셋 전체의 생성 경위와 중복률은 확인하지 못했다.
- 샘플 3행의 실제 값(초록은 앞부분 발췌):
  1. `2407.10972`, **VGBench: Evaluating Large Language Models on Vector Graphics Understanding and Generation**, 발표 `2024-07-15T17:59:55Z`. 초록: “In the realm of vision models, the primary mode of representation is using pixels to rasterize the visual world.”
  2. `2407.10971`, **Walking the Values in Bayesian Inverse Reinforcement Learning**, 발표 `2024-07-15T17:59:52Z`. 초록: “The goal of Bayesian inverse reinforcement learning (IRL) is recovering a posterior distribution over reward functions”.
  3. `2407.10969`, **Q-Sparse: All Large Language Models can be Fully Sparsely-Activated**, 발표 `2024-07-15T17:59:29Z`. 초록: “We introduce, Q-Sparse, a simple yet effective approach to training sparsely-activated large language models (LLMs).”

## 검증 및 한계

- first-rows API로 위 세 행의 제목과 초록을 읽었다. 로더의 실제 300행 표본과 동일한 오프셋 0, 49950, 99900에서 각 100행을 별도 조회한 결과 초록 평균 1168.94자, 최소 124자, ID와 초록은 각각 300개 모두 고유했다. 표본의 발표 시점은 처음 2024-07-15, 마지막 2020-06-11이다. 전체 자료의 중복률은 확인하지 못했다.
- `node ../load-datasets.mjs --dry-run ai-research`: 재시도 후 종료 코드 0, 총 100,000행 중 5행 조회, `empty title/body rows: 0/5`, domain.json 오류와 미존재 열 경고 없음. 출력된 세 매핑의 제목·본문·임베딩 앞부분을 읽어 제목과 분류, 초록이 의미 있게 연결되는지 확인했다. 최초 시도는 rows API HTTP 429로 실패했다.
- 2024-07-18에 데이터셋이 마지막 수정된 것으로 API가 표시한다. 최신 연구의 망라성이 없으며, 300행은 전체 100,000행의 일부다. 로더는 세 지점에서 각 100행을 가져오므로 표본을 전체 분야 동향으로 일반화할 수 없다.
- 초록은 저자 주장이고 동료심사 여부, 실험 조건, 원문 전체와 개별 논문의 권리는 이 자료만으로 보장되지 않는다. 본문 1500자 제한으로 긴 초록 뒤쪽이나 링크가 잘릴 수 있다.