# dualcontext

질의에 답할 때 쓸 **컨텍스트**(근거 자료)를 만들어 주는 MCP 서버 + 관리자 사이트. 「확장된 Dual RAG」를 구현합니다.

호스트 모델은 질문을 받고, `dualcontext` 는 **답이 아니라 컨텍스트만** 돌려줍니다. 답은 호스트 모델이 그 컨텍스트를 읽고 직접 씁니다.

> TypeScript · npm workspaces + Turbo · Express · PostgreSQL + pgvector · MCP(stdio) · Docker 컨테이너 하나로 실행

## 목차

* [왜 필요한가](#왜-필요한가)
* [주요 기능](#주요-기능)
* [동작 방식](#동작-방식)
* [빠른 시작](#빠른-시작)
* [MCP 로 쓰기](#mcp-로-쓰기)
* [설정](#설정)
* [프로젝트 구조](#프로젝트-구조)
* [개발](#개발)
* [문서](#문서)
* [현재 한계](#현재-한계)
* [라이선스](#라이선스)

## 왜 필요한가

일반 RAG 는 한 번 검색한 결과를 그대로 붙입니다. `dualcontext` 는 두 가지를 더 합니다.

* **무엇을 어디서 찾을지를 질의마다 고릅니다.** 출처마다 「조사원」이 있고, 질의에 맞는 조사원만 골라 자료를 모읍니다(1단계 라우팅).
* **모은 자료를 어떤 관점으로 정리할지도 고릅니다.** 사람이 써 둔 분석 절차 「프로시저」를 조사원마다 골라(2단계 라우팅) 자료와 한 쌍으로 컨텍스트를 만듭니다.

## 주요 기능

* **MCP 도구 하나**: `augment_context(query, effort?)`. 응답은 고정 머리(수행 단계 · 충분 여부) + 컨텍스트 텍스트입니다.
* **effort 4단계**: `light`(질의 분해 없음) · `middle`(질의 분해) · `high`(응답 평가 · 보강 최대 2번) · `xhigh`(최대 4번).
* **조사원 5종**: 덕덕고 웹 검색 · pgvector 테이블 벡터 검색 · 볼륨 폴더(텍스트 파일) · 코드베이스(Git 레포 또는 볼륨 코드의 심볼 · 호출 구조) · 사이트 크롤러(별도 컨테이너에서 렌더링).
* **라우터 · 프로시저 · 라이터를 화면에서 조정**: 키워드 · 임베딩 · LLM 단계를 쌓은 라우팅 파이프라인, 조사원별 개별 라우터, 템플릿/LLM 라이터.
* **관리자 사이트**: 조사원 · 프로시저 · 라우터 · 라이터 · AI 서버 설정, 「라우팅 미리보기」, 시험 실행(증강 전 · 후 최종 답변 비교), 실행 로그(실행 전체를 한 장으로 보는 그래프 · 노드 상세 · 실시간 갱신). MCP 호출도 같은 로그에 `MCP` 뱃지로 남습니다.
* **실행 모델**: 추론 호출은 작업 큐에 담기고 소비자(일꾼)가 당겨 갑니다. 취소 · 일시 오류 재시도 · 스트림 가드 · CPU 작업의 스레드 격리를 한 설계로 묶었습니다(`apps/dualcontext/docs/execution-design.md`).

## 동작 방식

```text
질의 ─▶ 조사원 라우팅 ─▶ 수집 ─▶ 프로시저 라우팅 ─▶ 라이터 ─▶ 컨텍스트
        (출처 고르기)    (원재료)   (정리 관점 고르기)  (쌍 → 글)
```

| effort | 받는 정보 수준 | 서버가 하는 일 |
| --- | --- | --- |
| `light` (기본) | 질의가 말 그대로 묻는 것 | 질의 분해 없이 한 번 증강 |
| `middle` | 질의에 숨은 하위 필요까지 | 질의를 나눠 아이템별로 컨텍스트를 만들어 합침 |
| `high` | 질의에 맞는지 내부에서 검증한 정보 | `middle` + 답변 · 평가로 빈틈을 채움(리플렉션 최대 2번) |
| `xhigh` | 더 강하게 검증 · 고도화한 정보 | `high` 와 같되 최대 4번 |

> `middle` 이상은 장기 실행입니다(공유 모델 서버 실측 수십 분~한 시간 넘게). 대부분의 MCP 클라이언트는 1분쯤 기다리다 시간 초과를 보고하고, 클라이언트가 포기(취소 알림 · 연결 종료)하면 서버가 그 실행을 취소합니다. 긴 대기를 받아들인 경우에만 쓰세요.

## 빠른 시작

**필요한 것**: Docker, Node.js(`>=22.12 <24.15` 또는 `>=25 <25.7` 또는 `>=26 <27`), npm. 임베딩 서버와 LLM 서버(OpenAI 호환)는 직접 준비합니다.

```sh
git clone https://github.com/hikaMaeng/dualcontext.git
cd dualcontext
npm install
npm run deploy dualcontext
```

로컬 빌드 후 Docker Compose 로 컨테이너 하나를 갱신하고 게시 포트와 헬스를 확인합니다. 첫 이미지 빌드는 mecab-ko 를 컴파일하므로 오래 걸립니다.

1. 관리자 사이트: <http://127.0.0.1:18081/> (인증이 없어 호스트 **루프백으로만** 게시됩니다).
2. 「AI 서버 설정」에서 임베딩 · LLM 서버의 주소 · 모델 · API 키를 정합니다. 컨테이너 안에서 닿는 주소여야 하며, 호스트의 서버는 `host.docker.internal` 입니다.
3. 「시험 실행」에서 질의를 돌려 라우팅 · 컨텍스트 · 최종 답변을 확인합니다.

처음 시작할 때 사전 정의 조사원 · 프로시저가 한 번 등록됩니다(허깅페이스 데이터셋 적재는 `apps/dualcontext/docs/usage.md`).

## MCP 로 쓰기

서버는 컨테이너 안에 있고, 클라이언트가 컨테이너 안에서 stdio 프로세스를 띄웁니다. 이 프로세스는 같은 컨테이너의 서버로 중계하므로 서버(컨테이너)가 떠 있어야 합니다.

```json
{
  "mcpServers": {
    "dualcontext": {
      "command": "docker",
      "args": ["exec", "-i", "dualcontext", "node", "/app/dist/server/index.js", "--stdio"]
    }
  }
}
```

응답 예시(`effort=light`):

```text
[dualcontext] effort=light coverage=ok sources=2 elapsed=16s
next: -
---
## 조사원: 판례·법령 질의응답
…
```

* `coverage=ok`: 컨텍스트가 만들어졌습니다. 읽고 **근거로 삼아** 직접 답합니다.
* `coverage=partial`: 평가가 통과하지 못했거나 시한에 걸렸습니다. 가진 것으로 답하되 부족한 점을 밝힙니다.
* `coverage=none`: 마땅한 조사원이 없습니다. 재시도하지 말고 자기 지식으로 답합니다.

호스트 모델이 처음부터 쓸 수 있도록 쓴 가이드: [`apps/dualcontext/docs/mcp-guide.md`](apps/dualcontext/docs/mcp-guide.md).

## 설정

AI 서버 · 조사원 · 라우터 · 라이터는 관리자 사이트에서 정합니다. 프로세스 설정은 환경 변수입니다(컨테이너 환경 또는 `apps/dualcontext/docker/.env`).

| 변수 | 기본 | 뜻 |
| --- | --- | --- |
| `DUALCONTEXT_HOST_PORT` | `18081` | 호스트에 게시하는 관리자 포트(루프백) |
| `DUALCONTEXT_CHAT_WORKERS` | `9` | 채팅 호출 소비자 수 = 추론 서버로 나가는 동시 요청 상한 |
| `DUALCONTEXT_EMBED_WORKERS` | `32` | 임베딩 호출 소비자 수 |
| `DUALCONTEXT_BUDGET_<EFFORT>_S` | 없음 | effort(`LIGHT` · `MIDDLE` · `HIGH` · `XHIGH`)별 선택 시한(초). 지나면 그때까지 모은 컨텍스트를 `coverage=partial` 로 반환 |
| `DUALCONTEXT_DB_POOL` | `10` | DB 연결 풀 크기 |
| `DUALCONTEXT_INTERNAL_PORT` | `PORT+1` | MCP 중계용 내부 listener(컨테이너 안 loopback, 게시하지 않음) |
| `DUALCONTEXT_SEARCH_WORKERS` · `DUALCONTEXT_CPU_WORKERS` | `2` · `min(2, cpus-1)` | 코드베이스 검색 · 색인 빌드 스레드 수 |
| `DUALCONTEXT_GIT_TOKEN*` | 없음 | 비공개 레포용 토큰(조사원 설정에는 환경 변수 **이름**만 적습니다) |

운영 중 큐 · 이벤트 루프 계측은 `GET /api/admin/status` 에 있습니다.

## 프로젝트 구조

```text
apps/
  dualcontext/        MCP 서버 + 관리자 사이트(Express + React) + 초기화 SQL + Docker
    src/server/       라우팅 · 수집기 · 라이터 · 추론 큐 · 실행 컨텍스트 · MCP 중계 · 워커 스레드
    src/front/        관리자 사이트
    docs/             이 서비스의 문서(개요 · 구조 · API · 내부 동작 · 설계 · MCP 가이드)
  crawler/            사이트 크롤러 조사원용 헤드리스 브라우저 컨테이너(Docker 전용)
packages/
  dualcontext_domain/ 도메인 타입과 순수 로직(계획기 · 증강 · 라우팅 규칙)
scripts/              deploy 등
test/                 실서버 검증 스크립트와 결과
```

## 개발

```sh
npm run lint           # 타입 검사
npm test               # 단위 시험(DB 가 필요한 시험은 건너뜀)
npm run build          # 빌드
npm run deploy dualcontext   # 배포(빌드 + Compose 갱신 + 헬스 확인)
```

이 저장소는 **구조를 계약으로** 다룹니다. 폴더 단위로 관심사를 나누고, 규칙은 문서가 아니라 검사 스크립트로 강제합니다. 변경 전에 [`AGENTS.md`](AGENTS.md) 를 읽고 아래 검사를 돌리세요.

```sh
bash .codex/skills/monorepo-architecture-guard/scripts/check-architecture.sh
bash .codex/skills/docker-compose-module-design/scripts/check-compose.sh
bash .codex/skills/package-docs-graph/scripts/check-docs.sh --include-apps
bash .codex/skills/i18n-resource-map/scripts/check-i18n.sh
```

화면에 보이는 모든 문자열은 리소스 키(8개 언어)입니다. 의존성은 npm 명령으로만 바꾸고 `package-lock.json` 을 함께 커밋합니다.

## 문서

| Topic | Path |
| --- | --- |
| Overview | docs/overview.md |
| Architecture | docs/architecture.md |
| API | docs/api.md |
| Usage | docs/usage.md |
| Constraints | docs/constraints.md |
| Internals | docs/internals.md |
| Testing | docs/testing.md |

서비스 모듈 문서(`apps/dualcontext/docs/`): `overview` · `architecture` · `api` · `usage` · `constraints` · `internals` · `testing` · [`mcp-guide`](apps/dualcontext/docs/mcp-guide.md) · [`mcp-design`](apps/dualcontext/docs/mcp-design.md) · [`execution-design`](apps/dualcontext/docs/execution-design.md).

Turbo 원격 캐시는 기본으로 꺼져 있습니다. 공유 캐시 소유자와 자격 증명 흐름이 문서화된 뒤에만 켭니다.

## 현재 한계

* 임베딩 · LLM 은 외부 서버에 의존합니다. 컨테이너 내부 임베딩은 아직 없습니다.
* 관리자 사이트에 인증이 없어 루프백으로만 게시합니다. 질의 원문이 실행 로그에 평문으로 쌓이므로 비밀 · 개인정보를 질의에 넣지 마세요.
* 코드베이스 조사원은 정규식 기반 근사 인덱스입니다(타입 해석 없음, 영문 식별자 위주 검색).
* 이 확장 정의의 이득은 아직 측정되지 않았습니다.
* 클라이언트가 취소 알림이나 연결 종료 없이 포기하면 서버는 알 수 없습니다(선택 시한이 안전장치). 진행 알림은 클라이언트가 `resetTimeoutOnProgress` 를 쓸 때만 시간 제한을 연장합니다.

## 라이선스

아직 지정하지 않았습니다(`LICENSE` 파일 없음). 재사용 · 배포 전에 저장소 소유자에게 확인하세요.
