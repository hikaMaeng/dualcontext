# 사용

```sh
npm run deploy crawler     # 이미지를 빌드(베이스 이미지 받기)하고 스택에서 crawler 만 갱신
```

* 첫 배포는 이미지(압축 약 2.3GB, 풀면 약 5.7GB)를 받느라 오래 걸린다.
* dualcontext 의 조사원 화면에서 타입 「사이트 크롤러」를 만들어 쓴다. 사용법은 `apps/dualcontext/docs/usage.md`.
* 환경: `docker/.env`(템플릿 `docker/env.defaults`). 호스트 포트는 열지 않는다(프로젝트 네트워크 안 `http://crawler:11235` 만).
* 토큰을 바꾸면 dualcontext 쪽 `DUALCONTEXT_CRAWLER_TOKEN` 도 같은 값으로 바꾼다.
