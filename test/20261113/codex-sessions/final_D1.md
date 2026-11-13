`gpu-hardware` 분야를 만들고 dry-run을 통과했습니다.

- 데이터셋: `Intelion/gpuark-gpu-dataset`, CC BY 4.0. 선택한 `gpu_specs/train`은 **13,566행**입니다.
- Dry-run: 종료 코드 0, 5행 중 빈 제목·본문 0행.
- 프로시저: 제품 사양과 세대 비교, 작업별 GPU 적합성 검토, 장착 및 전원 조건 점검, 전력 대비 사양 검토.

**등록 전 확인이 필요합니다.** 적재기의 행 수 계산 문제를 피하려고 100행으로 제한했으며, 실제 첫 100행 중 98행이 2015년 이전 제품입니다. 따라서 최신 GPU 검색에는 부족합니다. VRAM 단위가 행마다 다를 수 있고, 개별 사양의 사실 여부와 전체 데이터의 합성 여부는 독립 검증하지 못했습니다.

산출물: [domain.json](F:/dev/dualcontext/apps/dualcontext/seed-data/domains/gpu-hardware/domain.json), [SELECTION.md](F:/dev/dualcontext/apps/dualcontext/seed-data/domains/gpu-hardware/SELECTION.md)