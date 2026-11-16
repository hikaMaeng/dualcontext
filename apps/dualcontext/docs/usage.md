# 사용법

## 배포

```sh
npm run deploy dualcontext
```

저장소 루트에서 실행한다. 로컬 빌드 후 Docker Compose 로 컨테이너 하나를 갱신하고 게시 포트와 헬스를 확인한다.
첫 이미지 빌드는 mecab-ko 를 컴파일하므로 오래 걸린다(이후는 레이어 캐시).

## 관리자 사이트

`http://127.0.0.1:18081/` (호스트 포트는 `DUALCONTEXT_HOST_PORT`). 인증이 없어 호스트 **루프백으로만** 게시한다.

## MCP 연결(stdio)

컨테이너가 떠 있는 동안, 클라이언트가 컨테이너 안에서 stdio 프로세스를 실행한다.

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

stdout 은 프로토콜 채널이라 로그는 stderr 로만 나간다.

## AI 서버

관리자 「AI 서버 설정」에서 임베딩 서버와 LLM 서버의 주소 · 모델 · API 키를 정한다.
컨테이너 안에서 닿는 주소여야 한다. 호스트의 서버는 `host.docker.internal` 이다.
처음 시작할 때 기본값(임베딩 `:12345` `embeddinggemma2:mp`, LLM `:18180` `qwen36-35b`)이 들어간다.
LLM 이 추론 모델이면 `max_tokens` 를 제한하지 않는다(코드가 이미 그렇게 호출한다).

## 코드베이스 조사원

관리자 「조사원」에서 타입 「코드베이스」를 고른다. 설정은 화면에서만 바꾼다.

* **Git 클론**: 레포 URL(`https://github.com/owner/name`), 선택으로 브랜치 · 태그, 레포 안 하위 경로(큰 레포는 하위 경로로 좁힌다). URL 에 토큰을 넣을 수 없다. 비공개 레포는 컨테이너 환경 변수(예 `DUALCONTEXT_GIT_TOKEN_MYREPO`)에 토큰을 넣고 그 **이름**을 「토큰 환경 변수 이름」에 적는다(이번에는 공개 레포로만 실측했다).
* **볼륨 안 폴더**: `/var/lib/postgresql/data` 아래에 미리 받아 둔 코드의 상대 경로(예 `repos/myapp`). 폴더 조사원과 달리 텍스트 청크가 아니라 심볼 · 호출 구조로 찾는다.
* 첫 질의는 클론 · 인덱싱을 기다린다(수 초~최대 `maxIndexSeconds`). 이후는 빠르고, 갱신 주기(기본 24시간)가 지나면 뒤에서 다시 만든다. 질의는 영문 식별자 · 단어로 써야 맞는다.
* 인덱스는 볼륨 `codebase/` 아래 JSON 이다. 조사원을 지워도 남으므로 필요하면 그 폴더를 수동으로 지운다.

## 사전 정의 데이터 적재

사전 정의 조사원은 `ds_*` 테이블이 채워져야 답한다. 호스트에서 실행한다(임베딩 서버 필요).

```sh
LIMIT=600 node apps/dualcontext/seed-data/load-datasets.mjs            # 전부
LIMIT=600 node apps/dualcontext/seed-data/load-datasets.mjs ds_legal_terms   # 하나만
```

| 테이블 | 데이터셋 | 라이선스 |
| --- | --- | --- |
| `ds_legal_terms` | JusWis/korean-legal-terminology | CC-BY-4.0 |
| `ds_legal_cases` | ggh5454/korean-legal-qa-dataset (30건) | CC-BY-4.0 |
| `ds_medical_exam` | hcw0329/medical-korean-alpaca | Apache-2.0 |
| `ds_industry_news` | podongchip/korean-synthetic-industry-news (합성) | CC-BY-4.0 |
| `ds_finance_reports` | nmixx-fin/synthetic_financial_report_korean (합성) | Apache-2.0 |

### 분야 조사원(domain.json)으로 늘린 데이터

위 5개 외에 `seed-data/domains/` 의 분야가 조사원을 더한다. 처음 5개(AI 논문 · GPU · IT 보안 · 소프트웨어 개발 · 미국 기업 동향)에 더해 질의 로그에서 드러난 빈 분야 16개를 넣었다.

| 묶음 | 분야(테이블) | 데이터셋 | 라이선스 |
| --- | --- | --- | --- |
| 일상 Q&A 9개 | 요리·제빵 `ds_life_cooking` · 육아 `ds_parenting_teen` · 생활 건강 `ds_health_life` · 재테크 `ds_money_basics` · 생활·노동법 `ds_life_law` · 여행 `ds_travel_leisure` · PC 사용법 `ds_pc_howto` · 역사·문화 `ds_culture_history` · 과학 `ds_science_general` | beomi/KoAlpaca-v1.1a 를 키워드로 나눔(분야당 300행) | 카드에 라이선스 표기 없음. 네이버 지식iN 질문과 모델 생성 답변이라 사실 확인이 필요하다 |
| 시험 문제은행 7개 | 한국사 · 심리 · 경제·회계 · 부동산 · 환경 · 농업 · 에너지(`ds_kmmlu_*`) | HAERAE-HUB/KMMLU 분과(test 분할, 100~300행) | CC-BY-ND-4.0. 해설이 없어 문제와 정답 선택지만 자료가 된다 |

다시 실행하면 테이블을 비우고 새로 채운다. 허깅페이스 행 API 는 간헐적으로 502 를 내서 재시도한다.

### 분야 추가(`seed-data/domains/<이름>/domain.json`)

코드를 고치지 않고 폴더 하나로 분야(조사원 1개 + 전용 프로시저)를 더한다. 스크립트가 테이블 생성 → 임베딩 적재 → 관리 API 로 조사원 · 프로시저 등록까지 한다.

```json
{
  "name": "gpu-hardware",
  "table": "ds_gpu_hardware",
  "dataset": "owner/name",
  "config": "default",
  "split": "train",
  "license": "apache-2.0",
  "limit": 300,
  "map": {
    "id": "{id}",
    "title": "[{category}] {name}",
    "body": "{description}\n사양: {specs}",
    "embed": "{name}\n{description}"
  },
  "researcher": {
    "name": "GPU 하드웨어 사양",
    "description": "GPU 와 그래픽 카드의 아키텍처, 메모리, 성능 사양을 설명하는 자료. 어떤 GPU 가 어떤 사양을 가졌는지, 세대 간 차이가 무엇인지 묻는 질의를 맡는다.",
    "keywords": ["GPU", "그래픽카드", "VRAM"],
    "topK": 3
  },
  "procedures": [
    { "name": "[GPU] 사양 비교 분석", "appliesWhen": ["비교", "차이", "vs"], "steps": ["비교 대상을 확정한다", "…"], "impacts": ["핵심 사양 차이"], "outputFormat": "비교표" }
  ],
  "link": ["근거 신뢰도 점검", "수치·사실 추출"]
}
```

* `file`(jsonl URL)로 `dataset` 을 대신할 수 있다. 행 API 가 열 구성이 다른 파일 때문에 실패하는 데이터셋용이다.
* `map` 의 템플릿은 `{열}` · `{열.하위}` 자리표시자를 행 값으로 바꾼다(객체는 JSON, 없는 값은 빈 문자열). 길이는 제목 300 · 본문 1500 · 임베딩 1200 자로 잘린다. 제목과 본문이 빈 행은 버린다.
* 규칙: `name` 은 폴더 이름과 같고 소문자·숫자·하이픈, `table` 은 `ds_` 로 시작하는 소문자·숫자·밑줄, `limit` 은 1~1000(임베딩이 텍스트당 약 0.5초라 300 권장), 프로시저 2개 이상(각각 steps 2개 이상 · impacts 1개 이상), 조사원 키워드 3개 이상, 조사원 설명 40자 이상.
* 프로시저 이름은 DB 전체에서 유일하다. 다른 분야와 겹치지 않게 분야 표식(`[GPU]` 등)을 붙인다. `link` 는 이미 있는 공용 프로시저(「근거 신뢰도 점검」, 「수치·사실 추출」, 「비교 분석」 등)를 이름으로 연결한다.
* `filter`(정규식 문자열, 선택)를 주면 데이터셋 **전체**를 훑어(첫 실행에 수 분, 행 API 제한을 피해 천천히 읽고 임시 폴더에 캐시) 제목+본문에 그 키워드가 **가장 많이 나오는 행 순서로** `limit` 개를 고른다. 한 데이터셋을 여러 분야로 가르는 용도다(KoAlpaca 를 요리 · 양육 · 재테크 … 로 나눔). 단어만 스친 행이 섞이므로 키워드는 분야에 특이한 말로 쓴다.
* 객관식 데이터(`A`~`D` 열과 숫자 `answer`)에는 정답 선택지 글이 `{answerText}` 로 파생된다. 해설이 없는 시험 문제는 문제와 정답 문장만 자료가 된다.
* 등록되는 조사원 설정에는 `idColumn: "source_id"` 가 들어가 식별자 정확 검색의 번호 참조가 동작한다.
* 이 저장소의 새 분야 16개는 `test/20261115/make-domains.mjs` 가 만든다(질의 로그에서 드러난 빈 분야: 요리·제빵, 육아, 생활 건강, 재테크, 생활법, 여행, PC 사용법, 역사·문화, 과학 + KMMLU 한국사·심리·경제·부동산·환경·농업·에너지).
* 먼저 `--dry-run` 으로 검증한다(데이터를 몇 행만 받아 매핑 결과와 오류를 보여 주고 임베딩 · DB 는 건드리지 않는다).

```sh
node apps/dualcontext/seed-data/load-datasets.mjs --dry-run gpu-hardware
node apps/dualcontext/seed-data/load-datasets.mjs gpu-hardware          # 적재 + 등록
node apps/dualcontext/seed-data/load-datasets.mjs --no-register gpu-hardware   # 적재만
```

## 폴더 조사원

볼륨 안의 폴더를 지정한다(예: `manuals`). 파일은 볼륨에 직접 넣는다.

```sh
docker cp ./manuals/. dualcontext:/var/lib/postgresql/data/manuals/
```

`pgdata` 와 볼륨 밖은 거부된다. 질의 때마다 파일을 읽고 한국어 전문 검색으로 순위를 매긴다.

## 크롤러 조사원

타입 「사이트 크롤러」를 고르고 시작 URL(한 줄에 하나)을 적는다. 크롤러는 별도 컨테이너이므로 먼저 띄운다.

```sh
npm run deploy crawler
```

* 처음 질의가 오면(또는 「지금 크롤」) 사이트를 크롤해 조각으로 나누고 임베딩해 둔다. 이후에는 캐시에서 바로 답하고, 갱신 주기(기본 24시간)가 지나면 백그라운드로 다시 크롤한다.
* 임베딩 모델은 AI 서버 설정의 것을 쓴다. 비어 있으면 크롤러 조사원은 실패로 표시된다.
* robots.txt 가 막는 경로, 내부망 주소, 허용 도메인 밖은 가져오지 않는다(상세는 `constraints.md`).
* 크롤러 컨테이너 주소는 `DUALCONTEXT_CRAWLER_URL`(기본 `http://crawler:11235`), 토큰은 `DUALCONTEXT_CRAWLER_TOKEN`(기본값은 `apps/crawler/docker/env.defaults` 와 같다).

## 컨텍스트 계획(관리자 화면)

* 「컨텍스트 계획」(`#plan`)에서 모드를 고른다: 기본(classic, 기존 경로) · 분해(decompose, 질의를 아이템으로 나누고 사전 아이템부터 컨텍스트를 만든다) · 재평가(reevaluate, 분해 + 답변 평가 후 부족하면 보강). 한도(단계 수 · 아이템당 사전 아이템 수 · 아이템 전체 수 · 사전 컨텍스트를 의존 아이템에 건넬 때 반영하는 최대 글자 수 · 중복 정리)와 프롬프트 4종도 여기서 정하고 「저장」으로 한 번에 저장한다. 서버가 거부하면 그 검증 문장이 저장 버튼 옆에 나온다. 프롬프트 칸마다 「기본값으로」가 있다(저장해야 반영).
* 재평가 한도는 저장 모드가 재평가가 아니어도 편집할 수 있다(안내가 붙는다). 시험 실행에서 재평가를 고르면 그 값이 쓰인다.
* 「시험 실행」의 「컨텍스트 모드」는 기본이 「저장 설정 따름」이고, 다른 모드를 고르면 이번 실행에만 적용된다.
* 「실행 로그」 뷰에서 계획 모드 실행은 「계획」 탭(답변 다음)에 요약 · 의존성 트리(노드를 펼치면 설명 · 컨텍스트 · 조사원) · 단계별 로그(사전 요구 분석 실패가 있는 단계는 펼쳐 아이템 · 오류를 본다) · 생성 웨이브 · 재평가 라운드가 나온다. 계획 기록은 계획이 끝나야 채워지므로, 그 전에는 탭이 없고 요약 아래(시험 실행 화면에서도)에 「계획 진행 중: <단계>」(질의 분석 · 의존성 분석 · 컨텍스트 생성 · 답변 생성 · 답변 평가 · 컨텍스트 보강 · 계획 완료)만 보인다. 「조사원」 탭의 쌍에는 아이템 이름이 붙는다.
* 서버 쪽 사실: 진행 중에는 계획 단계 이름(`planProgress`: analyze · dependencies · build · answer · evaluate · reinforce · done)만 갱신되고, 아이템 트리(`plan`)는 증강 단계가 끝날 때(답변 생성 직전) 한 번에 채워진다(`api.md`).
* MCP 도구 `augment_context` 도 저장된 모드를 따른다. 저장 모드를 계획 모드로 바꾸면 MCP 호출마다 모델 호출이 수 배로 늘어난다(`internals.md`).

## 설정

| 변수 | 필수 | 계약 |
| --- | --- | --- |
| `PORT` | 예 | `10000-59999` 정수. |
| `NODE_ENV` | 아니오 | `development`, `test`, `production`. 기본 `development`. |
| `DUALCONTEXT_DATABASE_URL` | 예 | `postgresql://` URL. 이미지 기본값은 컨테이너 안 루프백 DB. |
| `DUALCONTEXT_DATA_DIR` | 예 | 볼륨 마운트 절대 경로. 이미지 기본값 `/var/lib/postgresql/data`. |
| `DUALCONTEXT_LLM_API_KEY` | 아니오 | AI 서버 설정에 키가 없을 때 쓰는 키. |

기본값은 Dockerfile `ENV` 와 `docker/env.defaults` 에 있다. 비밀 값은 커밋하지 않는다.
