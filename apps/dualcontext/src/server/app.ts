import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type AppOptions = {
  /** Resolves true when the database answers. Omitted: health reports process liveness only. */
  checkDatabase?: () => Promise<boolean>;
  /** 관리자 API. /api/admin 아래에 붙는다. */
  admin?: express.Router;
};

export function createApp(options: AppOptions = {}) {
  const app = express();
  const serverDir = path.dirname(fileURLToPath(import.meta.url));
  const frontDir = path.resolve(serverDir, "../front");

  const health = async (_request: express.Request, response: express.Response) => {
    if (!options.checkDatabase) {
      response.json({ status: "ok", service: "dualcontext" });
      return;
    }
    const databaseUp = await options.checkDatabase().catch(() => false);
    response.status(databaseUp ? 200 : 503).json({
      status: databaseUp ? "ok" : "degraded",
      service: "dualcontext",
      database: databaseUp ? "ok" : "unavailable"
    });
  };

  app.get("/health", health);
  app.get("/api/health", health);

  if (options.admin) app.use("/api/admin", options.admin);

  app.use(express.static(frontDir));
  app.get("/{*path}", (_request, response) => {
    response.sendFile(path.join(frontDir, "index.html"));
  });

  return app;
}
