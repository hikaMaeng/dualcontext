import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { Activity, Bot, FlaskConical, GitBranch, History, ListChecks, PenLine, Search } from "lucide-react";
import { Button } from "./components/ui/button";
import { AiServerView } from "./features/aiserver";
import { ProceduresView } from "./features/procedures";
import { ResearchersView } from "./features/researchers";
import { RouterView } from "./features/router";
import { RunsView } from "./features/runs";
import { TryView } from "./features/try";
import { WritersView } from "./features/writers";
import { direction, resolveLanguage, texts } from "./i18n";
import { api } from "./lib/api";
import { RSC } from "./resource";
import "./styles.css";

const language = resolveLanguage();
const t = texts(language);

document.documentElement.lang = language;
document.documentElement.dir = direction(language);

type Page = "researchers" | "procedures" | "router" | "writers" | "aiserver" | "try" | "runs";
type DatabaseStatus = { koreanConfig: boolean; koreanSample: string | null };

const pages: { id: Page; label: string; icon: typeof Search }[] = [
  { id: "researchers", label: t[RSC.APP_NAV_RESEARCHERS_BUTTON], icon: Search },
  { id: "procedures", label: t[RSC.APP_NAV_PROCEDURES_BUTTON], icon: ListChecks },
  { id: "router", label: t[RSC.APP_NAV_ROUTER_BUTTON], icon: GitBranch },
  { id: "writers", label: t[RSC.APP_NAV_WRITERS_BUTTON], icon: PenLine },
  { id: "aiserver", label: t[RSC.APP_NAV_AISERVER_BUTTON], icon: Bot },
  { id: "try", label: t[RSC.APP_NAV_TRY_BUTTON], icon: FlaskConical },
  { id: "runs", label: t[RSC.APP_NAV_RUNS_BUTTON], icon: History }
];

// `#runs/227` 처럼 화면 안의 하위 경로가 붙은 해시도 첫 마디로 화면을 정한다(하위 경로는 그 화면이 해석한다).
const fromHash = (): Page => (pages.find((entry) => entry.id === window.location.hash.slice(1).split("/")[0])?.id ?? "researchers");

function App() {
  const [page, setPage] = useState<Page>(fromHash);
  const [status, setStatus] = useState<DatabaseStatus | "error" | null>(null);

  useEffect(() => {
    api<DatabaseStatus>("/status").then(setStatus).catch(() => setStatus("error"));
    const onHash = () => setPage(fromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  return (
    <div className="flex min-h-screen bg-canvas text-fg">
      <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col gap-4 border-e border-line bg-sidebar p-3">
        <a className="px-2 pt-1 text-base font-semibold" href="/">{t[RSC.APP_BRAND_NAME_TEXT]}</a>
        <nav aria-label={t[RSC.APP_SHELL_NAV_PRIMARY_LABEL]} className="grid gap-1">
          {pages.map(({ id, label, icon: Icon }) => (
            <Button key={id} variant="ghost" size="sm" aria-current={page === id ? "page" : undefined} onClick={() => { window.location.hash = id; }}>
              <Icon aria-hidden="true" className="h-4 w-4" />
              {label}
            </Button>
          ))}
        </nav>
        <div className="mt-auto grid gap-2 px-1">
          <p role="status" data-testid="service-state" className="text-xs leading-5 text-muted">
            {status === "error" || (status && !status.koreanConfig)
              ? t[RSC.APP_RUNTIME_ERROR_ALERT]
              : status
                ? `${t[RSC.APP_RUNTIME_READY_STATUS]} ${status.koreanSample ?? ""}`
                : ""}
          </p>
          <Button asChild variant="outline" size="sm">
            <a href="/health">
              <Activity aria-hidden="true" className="h-4 w-4" />
              {t[RSC.APP_SHELL_HEALTH_BUTTON]}
            </a>
          </Button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-8">
        {page === "researchers" && <ResearchersView t={t} />}
        {page === "procedures" && <ProceduresView t={t} />}
        {page === "router" && <RouterView t={t} />}
        {page === "writers" && <WritersView t={t} />}
        {page === "aiserver" && <AiServerView t={t} />}
        {page === "try" && <TryView t={t} />}
        {page === "runs" && <RunsView t={t} />}
      </main>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
