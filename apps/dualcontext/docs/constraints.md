# 제약

## 파급 범위

| 표면 | 소비자 | 깨면 안 되는 불변식 |
| --- | --- | --- |
| MCP 도구 `augment_context` | 외부 MCP 클라이언트 | 도구는 하나, 인자는 `query` 하나. 늘리면 모든 클라이언트 계약이 바뀐다. |
| `GET /health` | 배포 검증, 컨테이너 `HEALTHCHECK`, 브라우저 스모크 | 인증 없음. DB 가 안 되면 `503`. 경로를 바꾸면 배포 리포트와 이미지 헬스가 같이 깨진다. |
| `readEnv` | 프로세스 시작 | 범위 밖 값은 기본값으로 덮지 않고 던진다. |
| stdio 모드 stdout | MCP 클라이언트 | stdout 은 프로토콜 전용. 로그는 stderr. |
| `ds_*` 테이블 벡터 | pgvector 조사원 | `embedding`(768) 은 설정된 임베딩 모델의 출력이고, `embedding_mrl`(256) 은 그 앞 256개를 재정규화한 값이다. 모델이나 차원을 바꾸면 전부 다시 임베딩해야 한다. |
| `augment_runs` 로그 | 관리자 「실행 로그」 화면 | **시험 실행만** 기록한다(MCP 호출은 기록하지 않는다). 키 `id`, 범위 전체, 상한 최근 500건(새 로그를 쓸 때 오래된 것을 지운다), 지우는 쪽 서버 · 관리자(개별 삭제). `settings` 스냅샷에는 API 키를 넣지 않는다. 질의 원문과 수집된 자료가 평문으로 남는다. |
| 조사원 임베딩 캐시 | 라우터(임베딩) | `embedding_key` = 모델 이름 + 글의 해시. 글이나 모델이 바뀌면 키가 달라져 다시 계산한다. |
| 코드베이스 인덱스 `codebase/<키>/index.json` | 코드베이스 조사원 | 볼륨 하위 폴더(단일 볼륨 규칙 유지). 키 = 출처 설정(url · ref · subPath, 또는 폴더 경로)의 해시 16자, 범위 = 조사원 설정 하나(같은 설정은 공유), 상한 파일당 64MB, 오래되면 질의가 뒤에서 갱신한다. **조사원을 지우거나 설정을 바꿔도 옛 키 폴더는 자동으로 지워지지 않는다**(수동 삭제). 형식 `version` 이 다르면 다시 만든다. |

## 컨테이너

* 크롤러는 **별도 모듈 `apps/crawler`** 의 컨테이너다(공식 Crawl4AI 이미지, 버전 고정, 볼륨 없음). 아래 「컨테이너 하나, 볼륨 하나」는 dualcontext 컨테이너에 대한 규칙이고 크롤러 컨테이너는 상태를 갖지 않는다. 호스트 포트는 `127.0.0.1:18082` 로만 열고 프로젝트 네트워크 안에서는 `http://crawler:11235`.

* **컨테이너 하나, 볼륨 하나.** 둘을 늘리지 않는다. 영속 대상은 볼륨 하위 폴더로 나눈다. 볼륨 마운트 경로는 베이스 이미지의 `VOLUME` 과 같아야 익명 볼륨이 생기지 않는다.
* PostgreSQL 은 `127.0.0.1` 에서만 듣고 게시하지 않는다. `trust` 인증은 이 전제에서만 안전하다.
* 관리자 사이트에 인증이 없으므로 compose 는 호스트 포트를 `127.0.0.1` 로만 연다. 외부에 열려면 인증을 먼저 추가한다.
* 볼륨의 `pgdata` 는 PostgreSQL 17 메이저에 묶인다.
* 이미지에 `git` 이 남는다(코드베이스 조사원이 런타임에 얕은 클론을 한다). 새 컨테이너 · 볼륨은 만들지 않았고 클론 작업 폴더와 인덱스는 볼륨의 `codebase/` 아래다.
* Dockerfile 은 프로젝트를 빌드하지 않는다. 컴파일하는 것은 이미지 소유 도구(mecab-ko, textsearch_ko)뿐이다. 두 도구는 고정되지 않은 위치(bitbucket, GitHub 기본 브랜치)에서 받는다.

## 보안

* **API 키는 쓰기 전용**이다. 조회 API 는 `hasApiKey` 만 돌려준다. 다만 DB(볼륨)에 평문으로 저장된다. 볼륨 접근 권한이 곧 키 접근 권한이다.
* 관리자가 입력하는 테이블 · 컬럼 이름은 SQL 에 직접 들어가므로 식별자 형태(`^[a-z_][a-z0-9_]*$`)만 허용하고 큰따옴표로 감싼다. 값은 모두 바인딩한다.
* 폴더 조사원은 볼륨 밖 경로와 `pgdata` 를 거부한다(`..` · 절대 경로 포함).
* **코드베이스 조사원(클론한 코드는 데이터일 뿐 실행하지 않는다).**
  * 클론: https 만, URL 의 계정 정보 · 포트 · 쿼리 거부, 점 없는 호스트 · `localhost` · `.local` `.internal` 류 거부, 호스트를 풀어 **모든** 주소가 내부 · 루프백 · 링크로컬(169.254.169.254 메타데이터 포함) · 예약 · IPv4 매핑 · NAT64 · 6to4 대역이 아님을 확인한 뒤 그 IP 를 git 에 고정(`http.curloptResolve`)해 DNS 재바인딩을 막는다. 리다이렉트는 따르지 않는다(`http.followRedirects=false`). `GIT_ALLOW_PROTOCOL=https`.
  * git 은 셸 없이 argv 로 띄우고 `--` 뒤에 URL, 훅 · fsmonitor 끔, 서브모듈 안 받음, `core.symlinks=false`, 부모 프로세스 환경(`DUALCONTEXT_LLM_API_KEY` 포함)을 물려주지 않는다. 브랜치 · 태그 이름은 `^[A-Za-z0-9][A-Za-z0-9._/-]*$`(앞 하이픈 · `..` 거부)만 받는다.
  * 토큰: URL 에 넣을 수 없다(저장 전 거부). 비공개 레포는 서버 환경 변수 이름(`tokenEnv`)만 설정에 두고 값은 git 의 환경 설정(`GIT_CONFIG_*`)으로만 넘긴다. argv · 파일 · 인덱스 · 로그에 쓰지 않고 git 출력은 토큰과 그 base64 를 가려서 오류 메시지에 쓴다. 이번 구현은 공개 레포로만 실측했고 토큰 경로는 단위 테스트(argv 에 없음 · 가림)만 했다.
  * 파일 순회: 심볼릭 링크는 파일 · 폴더 모두 따라가지 않고, 볼륨 폴더 소스는 실제 경로(realpath)가 볼륨 안인지 확인한다. `.git` · `node_modules` · 빌드 산출물 폴더와 `.env` · 키 · 인증서 · `.npmrc` 류 파일은 읽지 않는다. 시간 · 파일 수 · 총 바이트 · 파일당 200KB · 클론 크기 상한을 넘으면 중단한다.
  * 남는 위험: 소스 조각이 그대로 컨텍스트와 LLM 에 실린다(본문에 박힌 비밀은 걸러지지 않는다). 허용 호스트 목록은 아직 없다.

## 크롤러 조사원

| 항목 | 규칙 |
| --- | --- |
| SSRF | 크롤러에 보내기 전에 **모든 URL**(시작 URL, 링크, 리다이렉트 결과)을 `guard` 가 검사한다: http/https 만, 사용자 정보 금지, 포트 80·443·8080·8443 만, `localhost`·점 없는 이름(compose 서비스 이름)·`.local/.internal/.lan` 등 금지, 이름이 풀리는 **모든** 주소가 공인 주소여야 한다(사설·루프백·링크 로컬(169.254.169.254 클라우드 메타데이터)·CGNAT·멀티캐스트·예약, IPv6 고유 로컬·링크 로컬·IPv4 매핑·NAT64·6to4 차단). robots.txt 는 연결 시점에 주소를 다시 검사하는 전용 Agent 로 받는다(DNS rebinding 방지). 크롤러 컨테이너(Crawl4AI 0.9.5)도 자체 SSRF 차단을 가진다(두 겹) |
| 남는 위험 | 크롤러 컨테이너가 렌더링 중 일으키는 **하위 요청**(이미지·스크립트·XHR)과 서버 측 리다이렉트는 dualcontext 가 사전에 볼 수 없다. 최종 URL 이 내부·허용 밖이면 내용을 버리고, 그 전의 요청은 Crawl4AI 의 내장 SSRF 차단에 맡긴다. 크롤러는 dualcontext 와 같은 프로젝트 네트워크에 있으므로, Crawl4AI 차단을 우회하는 취약점이 있으면 `dualcontext:18081`(인증 없는 관리자)에 닿을 수 있다. 신뢰할 수 없는 사이트를 크롤하려면 크롤러를 전용 네트워크로 분리한다(미구현) |
| robots.txt | origin 마다 한 번 받아 해석한다. 이 봇 이름(`dualcontext`)의 그룹이 있으면 그것만, 없으면 `*`. 가장 긴 규칙 우선, 같으면 Allow. `Crawl-delay` 반영. 404 등 4xx 는 전부 허용, 5xx·접속 실패는 그 origin 을 이번 크롤에서 **전부 금지**로 본다. 크롤러의 브라우저 User-Agent 도 같은 토큰을 밝힌다 |
| 예의 | 같은 호스트 요청 간격 `delayMs`(최소 500ms), 요청은 한 번에 하나(직렬), 총 시간 `maxCrawlSeconds` |
| 크기 상한 | 페이지 ≤ 200, 깊이 ≤ 3, 페이지당 100,000자, 조사원당 청크 ≤ 3000(넘으면 뒤 페이지를 버린다), 시작 URL ≤ 10. 하드 리밋이라 설정으로 올릴 수 없다 |
| 캐시 수명 | 키 `crawl_*.researcher_id`(조사원 삭제 시 함께 삭제), 범위 조사원 하나, 갱신 `refreshHours`, 크롤 대상 설정(시작 URL·도메인·깊이·페이지·패턴·청크 길이)이 바뀌면 폐기 후 재크롤, 지우는 쪽 서버(재크롤·삭제)와 관리자(`DELETE …/crawl`). 질의 단계 설정(`topK` · `minScore` · `perPage` · `refreshHours`)은 재크롤을 일으키지 않는다 |
| 임베딩 | 청크는 만든 모델 이름을 같이 저장한다. 임베딩 모델을 바꾸면 다음 질의에서 **그 질의 안에서** 전부 다시 임베딩한다(청크 최대 3000개, 32개씩 호출) |
| 인증 | 크롤러 API 토큰 `CRAWL4AI_API_TOKEN` 은 Crawl4AI 가 컨테이너 밖 바인딩을 허용하는 조건이다. 값은 비밀이 아니다(프로젝트 네트워크·루프백 한정). 바꾸려면 `apps/crawler/docker/.env` 와 dualcontext 의 `DUALCONTEXT_CRAWLER_TOKEN` 을 같이 바꾼다 |
| 로그 | 시험 실행 로그에는 수집된 조각이 평문으로 남는다(위 `augment_runs` 규칙과 같다) |

## 알려진 한계(실험으로 확인됨, 상세는 `test/20261113/dualcontext-it-experiments_report.md`)

* **임베딩 라우터는 경계 근처에서 틀린다.** 최소 유사도(기본 0.67)로 마땅한 조사원이 없는 질의를 걸러내지만 점수가 0.5~0.85 에 압축돼 있어 경계(0.67~0.69)의 질의는 오판한다(새 질의 24개 중 1~2개). 프로시저 단계는 최소 유사도를 0(거르지 않음)으로 두어 상위 M 개가 항상 채워지고, 기대 프로시저가 모두 선택된 질의는 실험 24개 중 소수였다.
* **고유 식별자 검색이 약하다(식별자 정확 검색으로 보완, 효과는 internals 참고).** CVE 번호 · 제품 모델명 같은 식별자는 임베딩 검색으로 정확히 찾지 못하는 경우가 있다(F2-2: CVE 3건 중 0건 검색). 키워드/전문 검색과 섞는 하이브리드가 필요하다.
* **표본이 작다.** 사전 정의 테이블은 큰 데이터셋의 300~600행 표본이라 일반 질문의 적중률은 낮다.
* **자료 길이.** 한 자료의 본문은 적재 때 1500자로 잘리고, 컨텍스트에는 `snippetChars` 만큼만 실린다(문장 경계에서 자르고 「…(이하 생략)」을 표시).
* **자료 단위 관련도 기준(`minScore` 0.72)은 측정 라벨이 미검증이다.** 서브에이전트가 읽고 낸 관련/무관 판정으로 정했고, embeddinggemma 에서만 재었다. 모델을 바꾸면 다시 재야 한다.
* **새 분야 조사원이 늘며 무관 질의의 오선택도 늘었다.** 무관 질의 12개 중 아무 조사원도 안 고른 것은 6개뿐이고, 자료 단위 기준을 거치고도 2개(`N2` 화분 · `N12` 영어 공부법)는 컨텍스트가 남는다. 남는 자료는 점수 0.75 안팎의 어림 자료이며 질의와 무관하다.
* **복합 질의 분해는 어미·쉼표 규칙이다.** 어미 목록에 없는 문장 구조는 나뉘지 않고, 목록에 있는 어미 뒤 쉼표는 하위 질문이 아닌 곳에서도 나뉠 수 있다. 하위 질문은 짧아 라우팅이 흔들린다(#30: 「14번의 Math.Floor」 조각이 농업 문제은행을 골랐고 자료 3행이 실렸다).
* **식별자 정확 검색은 순차 검색이다.** 행이 수천 개를 넘는 테이블에서는 `identifierSearch: false` 로 꺼야 한다.
* **KMMLU 분과는 이름과 내용이 어긋난다.** 식품 가공 분과에 금속(주철) 문제가 섞여 있어 식품 분과는 쓰지 않았다. 쓴 분과도 표본을 훑어 확인했을 뿐 전수 검수하지 않았다.
* **웹 검색 자료에는 유사도가 없어 자료 단위로 거르지 못한다.**

## 되돌림은 조용하지 않다

라우팅 방법(임베딩 · LLM)이 실패하면 키워드 일치로 되돌아간다. 되돌림은 결과의 `researcherRouting` · `procedureRouting` 에
`embedding-failed(이유)->keyword...` 형태로 남고 시험 실행 화면에 보인다. LLM 라이터가 실패하면 컨텍스트 맨 앞에 실패 사실을 적고 기본 조립으로 대체한다.
조사원 수집이 실패하거나 관련 자료를 찾지 못하면 그 사실이 컨텍스트의 「찾지 못한 것」에 들어간다(그런 조사원에는 프로시저를 붙이지 않는다).

## 프런트

UI 는 shadcn/ui 스타일 컴포넌트, Tailwind, Radix 를 쓴다(셀렉트는 네이티브 `<select>` 를 같은 스타일로 감쌌다).
화면 문자열은 전부 리소스 키이며 8개 언어 번들이 같은 키 집합을 가진다. 테마는 `styles.css` 의 `@theme` 토큰이다.

허용 로케이터:

| 로케이터 | 요소 |
| --- | --- |
| `nav[aria-label]` 안의 버튼, `aria-current="page"` | 왼쪽 메뉴와 현재 화면 |
| `role=main`, `role=heading` level 1 (`#page-title`) | 본문, 화면 제목 |
| `role=status`, `data-testid="service-state"` | 런타임 상태 줄 |
| `data-testid="researcher-item"`, `"procedure-item"`, `"writer-item"` | 목록 항목 |
| `data-testid="routing-steps"`, `"routing-step"`, `"routing-individual"` | 시험 실행 · 실행 로그의 라우팅 단계별 기록과 개별 라우터 판정(`routing-individual` 의 `data-selected` 가 포함 여부). 옛 실행 기록에는 이 정보가 없어 나오지 않는다 |
| `data-testid="researcher-individual-router"` | 조사원 폼의 「개별 라우터 사용」 체크박스(켜면 `individual-steps` 편집기가 나온다) |
| `data-testid="routing-state"`, `"logged-state"`, `"pair-item"`, `"augmented-context"` | 시험 실행 결과와 로그 링크 |
| `data-testid="run-list"`, `"run-item"`(`data-run-id` · `data-status`), `"run-item-query"`, `"run-item-researchers"`, `"run-item-status"` | 실행 로그 목록과 2줄 항목(링크, `#runs/<id>`). 1줄 `일시 | 질의`, 2줄 선택된 조사원들. 두 줄 모두 한 줄 엘립시스이고 전체 내용은 `title` 로 노출 |
| `data-testid="run-total"`, `"run-list-empty"`, `"run-pager"`, `"run-pager-prev"`, `"run-pager-next"`, `"run-pager-position"` | 총 건수, 빈 목록, 페이징(pageSize 20, 「현재 쪽 / 전체 쪽」) |
| `role=search` `data-testid="run-filters"`, `"run-filters-hint"`, `"run-filter-researchers-select"`, `"run-filter-procedures-select"`, `"run-filter-researchers-chips"`, `"run-filter-procedures-chips"`, `"run-filter-chip"`(`data-name`), `"run-filter-clear"`, `"run-search-input"`, `"run-search-mode"` | 실행 로그 필터(조사원 · 프로시저 멀티 셀렉트와 칩, 서로 OR 이고 검색어와는 AND)와 검색(키워드 / 의미). 칩의 제거 버튼은 접근 가능한 이름 `<이름> 선택 해제` |
| `data-testid="run-back"`, `"run-detail"`(`data-status`), `"run-query"`, `"run-meta"`, `"run-status"`, `"run-error"`, `"run-delete"`, `"run-loading"` | 실행 로그 뷰 상단 요약(질의 전체, 시각 · 상태 · 소요 시간 한 줄, 삭제) |
| `role=tablist` / `tab` / `tabpanel`, `data-testid="run-tab-answer"`·`"run-tab-routing"`·`"run-tab-researchers"`·`"run-tab-context"`, `"run-panel-<탭>"` | 뷰 서브탭(좌우 화살표 · Home · End 로 이동, 이동하면 바로 선택). 활성 패널 하나만 그린다 |
| `data-testid="run-routing"`, `"run-routing-none"`, `"run-routing-empty"`, `"run-procedure-routing"` | 라우팅 탭(조사원 라우팅 방법, 마땅한 조사원 없음, 기록 없음, 쌍별 프로시저 라우팅 기록). 단계 · 점수표는 `routing-steps` · `routing-scores` |
| `data-testid="run-pair"`, `"run-pairs-empty"` | 조사원 탭(선택된 쌍과 근거 자료) |
| `data-testid="run-context"`(`data-format` = `markdown` 또는 `text`), `"run-context-empty"`, `"run-settings"` | 컨텍스트 탭. 마크다운 구문이 보이면 마크다운으로 렌더하고 아니면 원문 그대로. 실행 당시 설정 스냅샷은 컨텍스트가 어떻게 만들어졌는지의 근거라 같은 탭 아래에 둔다 |
| `data-testid="run-answer-empty"`, `"answer-before"`, `"answer-after"` | 답변 탭 |
| `data-testid="answer-before"`, `"answer-after"`, `"busy-state"` | 증강 전 · 후 최종 답변(시험 실행과 로그 상세 공통), 실행 중 표시. 답변 본문은 마크다운으로 렌더한다(`components/markdown`, react-markdown + GFM, 원문 HTML 은 렌더하지 않음) |
| `data-testid="split-method"`, `"split-maxparts"`, `"split-minchars"`, `"split-parttopk"`, `"split-prompt"` | 라우터 질의 분해 설정 |
| `data-testid="researcher-steps"`, `"procedure-steps"`, `"researcher-addtype"`, `"researcher-addstep"` (procedure 도 같음) | 라우터 단계 목록과 단계 추가 |
| `data-testid="<stage>-step-<n>"` 와 `…-type`, `-topk`, `-onerror`, `-minscore`, `-margin`, `-showscores`, `-allownone`, `-prompt`, `-parts` | 라우터 단계 하나(`stage` 는 `researcher`/`procedure`/`individual`, `n` 은 0부터; `individual` 은 조사원 편집 폼의 개별 라우터) |
| `data-testid="preview-query"`, `"preview-result"`, `"preview-selected"`, `"preview-step"`, `"preview-individual"` | 라우팅 미리보기(`preview-individual` 은 개별 라우터 판정, `data-selected` 가 포함 여부) |
| `data-testid="embedding-url"`, `"embedding-model"`, `"chat-url"`, `"chat-model"` | AI 서버 입력 |
