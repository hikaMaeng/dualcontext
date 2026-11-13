# 사용법

## 배포

```sh
npm run deploy dualcontext
```

저장소 루트에서 실행한다. 로컬 빌드 후 Docker Compose 로 컨테이너 하나를 갱신하고 게시 포트와 헬스를 확인한다.
첫 빌드는 mecab-ko 를 컴파일하므로 오래 걸린다(이후는 레이어 캐시).

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

## 설정

| 변수 | 필수 | 계약 |
| --- | --- | --- |
| `PORT` | 예 | `10000-59999` 정수. |
| `NODE_ENV` | 아니오 | `development`, `test`, `production`. 기본 `development`. |
| `DUALCONTEXT_DATABASE_URL` | 예 | `postgresql://` URL. 이미지 기본값은 컨테이너 안 루프백 DB. |
| `DUALCONTEXT_DATA_DIR` | 아니오 | 볼륨 마운트 경로. 기본 `/var/lib/postgresql/data`. |

기본값은 Dockerfile `ENV` 와 `docker/env.defaults` 에 있다. 비밀 값은 두지 않는다.

## 도메인 패키지

```ts
import { augmentQuery } from "dualcontext_domain/server";
```

항상 워크스페이스 패키지 이름으로 가져온다.
