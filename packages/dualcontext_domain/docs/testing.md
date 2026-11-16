# Testing

Use package-local tests for domain invariants and state transitions.

Keep app tests focused on HTTP, framework lifecycle, asset serving, and
integration boundaries.

컨텍스트 계획기(`src/server/plan`)는 폴더마다 `*.test.ts`(node:test) 를 두고, 오케스트레이터 `index.test.ts` 가 fake ports 로 모든 stop 사유 · 웨이브 순서 · provided 전달을 검증한다.
`node --import tsx --test "src/server/plan/**/*.test.ts"` 로 따로 돌릴 수 있다.

`augmentQuery` 의 사전 컨텍스트(`provided`)는 `src/server/augment/index.test.ts`(라이터에만 전달 · 쌍별 호출마다 · 빈 배열이면 두 인자 호출 · 조사원 없으면 빈 컨텍스트)와 `src/server/write/index.test.ts`(섹션 위치 · 머리글 낮춤 · 없거나 비면 같은 글)가 검증한다.
