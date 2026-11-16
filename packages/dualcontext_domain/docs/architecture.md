# 아키텍처

런타임별로 나눈다.

| 경로 | 계약 |
| --- | --- |
| `src/common` | 서버와 프런트가 함께 쓰는 런타임 중립 코드. `model/` 이 타입을 소유한다. |
| `src/server` | 서버 전용. `route/`, `write/`, `augment/`, `plan/`(컨텍스트 계획기, [plan.md](plan.md)) 는 바뀌는 이유가 달라 폴더를 나눴다. `src/front` 를 import 하지 않는다. |
| `src/front` | 프런트 전용. 앱 UI 구성을 소유하지 않는다. |

패키지는 `apps/` 를 import 하지 않는다. 앱은 워크스페이스 패키지 이름으로만 이 패키지를 쓴다.
