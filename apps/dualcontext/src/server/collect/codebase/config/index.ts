import { z } from "zod";
import { assertRef, assertSubPath, parseRepoUrl } from "../guard/index.js";

const tryCheck = (check: () => unknown) => {
  try {
    check();
    return true;
  } catch {
    return false;
  }
};

/**
 * 코드베이스 조사원 설정.
 * - source "git": url(https 공개 레포)을 서버 안에서 얕게 클론한다. ref 는 브랜치 · 태그, subPath 는 레포 안 하위 폴더.
 * - source "directory": 볼륨 안 폴더(path)에 미리 받아 둔 코드베이스를 읽는다.
 * 비공개 레포 인증은 tokenEnv(서버 환경 변수 이름)로만 한다. 토큰 값을 설정에 넣을 수 없다.
 */
export const codebaseConfigSchema = z
  .object({
    source: z.enum(["git", "directory"]),
    url: z.string().optional(),
    ref: z.string().optional(),
    subPath: z.string().optional(),
    path: z.string().trim().optional(),
    tokenEnv: z.string().regex(/^DUALCONTEXT_GIT_TOKEN[A-Z0-9_]*$/).optional(),
    /** 인덱스를 다시 만드는 주기(시간). 0 이면 처음 한 번만. 기본 24. */
    refreshHours: z.number().int().min(0).max(720).default(24),
    maxFiles: z.number().int().min(10).max(5000).default(2000),
    maxRepoMB: z.number().int().min(1).max(500).default(100),
    maxIndexSeconds: z.number().int().min(10).max(600).default(120),
    topK: z.number().int().min(1).max(20).default(5)
  })
  .superRefine((config, ctx) => {
    if (config.source === "git") {
      if (!tryCheck(() => parseRepoUrl(config.url))) ctx.addIssue({ code: "custom", path: ["url"], message: "url must be a public https repository url without credentials" });
      if (config.ref !== undefined && !tryCheck(() => assertRef(config.ref))) ctx.addIssue({ code: "custom", path: ["ref"], message: "ref must be a plain branch or tag name" });
      if (!tryCheck(() => assertSubPath(config.subPath))) ctx.addIssue({ code: "custom", path: ["subPath"], message: "subPath must be a relative path inside the repository" });
    } else if (config.path === undefined || config.path === "") {
      ctx.addIssue({ code: "custom", path: ["path"], message: "path is required for a directory source" });
    }
  });

export type CodebaseConfig = z.infer<typeof codebaseConfigSchema>;
