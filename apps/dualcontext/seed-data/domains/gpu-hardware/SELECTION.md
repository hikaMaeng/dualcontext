# GPU 하드웨어 데이터셋 선정

확인일: 2026-11-13. 이 폴더는 GPU 사양에 한정하며 CPU·메인보드·가격·실측 벤치마크 데이터는 포함하지 않는다.

## 후보

- **채택 — Intelion/gpuark-gpu-dataset**: GPU 제품과 보드별 구조화 사양. [API 메타데이터](https://huggingface.co/api/datasets/Intelion/gpuark-gpu-dataset)의 `cardData.license`는 `cc-by-4.0`, `gated`는 `false`. [데이터셋 카드](https://huggingface.co/datasets/Intelion/gpuark-gpu-dataset/blob/main/README.md)는 GPU Ark 출처 표시와 알려진 단위·결측 한계를 명시한다. 사용 시 GPU Ark를 CC BY 4.0 조건에 따라 표시해야 한다.
- 제외 — [Jr23xd23/gpu-database](https://huggingface.co/api/datasets/Jr23xd23/gpu-database): Apache-2.0, 비공개 제한 없음. rows API의 5,582행 전체에서 id가 2,824개로 2,758행이 중복 id여서 제외했다.
- 제외 — [jason1966/alanjo_graphics-card-full-specs](https://huggingface.co/api/datasets/jason1966/alanjo_graphics-card-full-specs): 라이선스가 `unknown`.
- 제외 — [maximinimal/llm-hardware-qa](https://huggingface.co/api/datasets/maximinimal/llm-hardware-qa): CC0이나 모델 합성 QA이며 400행 중 러시아어 240행, 영어 160행이고 GPU 사양 외 주제도 많다.

## 채택 데이터 확인

- ID: `Intelion/gpuark-gpu-dataset`; config `gpu_specs`, split `train`. [size API](https://datasets-server.huggingface.co/size?dataset=Intelion%2Fgpuark-gpu-dataset): 선택한 split 13,566행, 데이터셋 전체 14,559행(별도 benchmark 설정 993행 포함).
- 라이선스: `cc-by-4.0`; gated: `false`. 카드에 original 출처로 표기되고 제품 사양을 수집·정리한 자료이나, 각 행의 생성 경위와 원출처 권리는 독립 검증하지 못했다. 합성 여부는 카드상 합성 데이터라는 표기는 확인되지 않았으며 전체 제작 과정은 미확인이다.
- 열: `id`, `name`, `slug`, `vendor`, `manufacturer`, `arch_name`, `card_release_date`, `proc_foundry`, `proc_process_size`, `proc_transistors`, `proc_die_size`, `cores`, `tensor_cores`, `rt_cores`, `sm_count`, `base_clock`, `boost_clock`, `memory_clock`, `ram`, `ram_type`, `bus_width`, `bus_interface`, `ram_bandwidth`, `fp16_performance`, `fp32_performance`, `fp64_performance`, `bf16_performance`, `tf32_performance`, `int8_performance`, `tdp`, `suggested_psu`, `slot_width`, `power_connectors`, `multi_gpu`, `api_cuda`, `is_retail_board`, `gpi_value`.
- [first-rows API](https://datasets-server.huggingface.co/first-rows?dataset=Intelion%2Fgpuark-gpu-dataset&config=gpu_specs&split=train) 실제 행의 일부 값:
  1. `id=4834`, `name=MSI GT 330`, `arch_name=Tesla`, `card_release_date=2010-02-02`, `ram=768`, `ram_type=GDDR3`, `ram_bandwidth=25.60 GB/s`, `tdp=75 W`, `suggested_psu=250 W`.
  2. `id=9803`, `name=XFX HD 6570 Silent`, `arch_name=TeraScale 2`, `card_release_date=2011-11-15`, `ram=2`, `ram_type=GDDR3`, `ram_bandwidth=16.00 GB/s`, `tdp=60 W`, `suggested_psu=250 W`.
  3. `id=9780`, `name=AMD Radeon HD 6670`, `arch_name=TeraScale 2`, `card_release_date=2011-04-19`, `ram=1024`, `ram_type=GDDR5`, `ram_bandwidth=64.00 GB/s`, `tdp=66 W`, `suggested_psu=250 W`.
- 첫 100행의 id는 모두 다르다. 다만 카드도 보드 변형이 사실상 유사 중복일 수 있다고 밝힌다. 표 형태이므로 원래 본문 열은 없으며, dry-run의 처음 세 매핑 본문은 각각 362, 373, 379자로 사양 항목을 풀어 적는다. 첫 100행의 매핑 본문 평균은 370.72자, 최솟값은 339자다. 전체 행의 평균은 계산하지 않았다.

## Dry-run 및 한계

`node ../load-datasets.mjs --dry-run gpu-hardware`: 종료 코드 0, 5행 수신, `empty title/body rows: 0/5`, 지정 열 누락 오류 없음. 출력된 세 행의 이름·본문 앞부분·임베딩을 확인했다. 빈 `vendor` 등 결측값은 실제 결측이며 숫자 0이 아니다. 본문에는 구조화 객체가 아닌 개별 필드가 들어간다.

적재 스크립트는 config가 아니라 데이터셋 전체 행 수 14,559를 페이지 위치 계산에 사용한다. 100개 초과 제한에서는 선택 split의 끝을 넘는 페이지를 요청하므로 `limit=100`으로 설정했다. 실제 첫 100행 중 출시일이 2015년 이하인 행은 98개, 2022년 1개, 날짜 없음 1개였다. 따라서 최신 GPU 검색의 재현율은 매우 낮다. 전체 제품을 대표하지 않으며, 코디네이터가 등록 전 이 제한과 표본 편향을 검토해야 한다.

카드는 `ram` 단위가 세대별 MB/GB로 뒤섞여 있고, 제조사 vendor 결측이 많으며, 저정밀 성능 기준도 일관되지 않고 일부 출시 연도가 부정확하다고 경고한다. 사양은 실제 성능·가격·호환성의 확정 근거가 아니다. 외부 사이트나 실제 장치와의 사실 대조, 전체 데이터 중복도 및 나머지 100행 밖의 본문 품질은 검증하지 않았다.