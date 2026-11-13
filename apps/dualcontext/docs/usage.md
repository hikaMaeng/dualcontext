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

## 설정

| 변수 | 필수 | 계약 |
| --- | --- | --- |
| `PORT` | 예 | `10000-59999` 정수. |
| `NODE_ENV` | 아니오 | `development`, `test`, `production`. 기본 `development`. |
| `DUALCONTEXT_DATABASE_URL` | 예 | `postgresql://` URL. 이미지 기본값은 컨테이너 안 루프백 DB. |
| `DUALCONTEXT_DATA_DIR` | 예 | 볼륨 마운트 절대 경로. 이미지 기본값 `/var/lib/postgresql/data`. |
| `DUALCONTEXT_LLM_API_KEY` | 아니오 | AI 서버 설정에 키가 없을 때 쓰는 키. |

기본값은 Dockerfile `ENV` 와 `docker/env.defaults` 에 있다. 비밀 값은 커밋하지 않는다.
