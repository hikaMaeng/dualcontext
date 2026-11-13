import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { Activity, Server } from "lucide-react";
import { Button } from "./components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card";
import { DocumentsView } from "./features/documents";
import { ProceduresView } from "./features/procedures";
import { ResearchersView } from "./features/researchers";
import { TryView } from "./features/try";
import { direction, resolveLanguage, texts } from "./i18n";
import { api } from "./lib/api";
import { RSC } from "./resource";
import "./styles.css";

const language = resolveLanguage();
const t = texts(language);

document.documentElement.lang = language;
document.documentElement.dir = direction(language);

type Tab = "researchers" | "procedures" | "documents" | "try";
type DatabaseStatus = { koreanConfig: boolean; koreanSample: string | null };

const tabs: { id: Tab; label: string }[] = [
  { id: "researchers", label: t[RSC.APP_TAB_RESEARCHERS_BUTTON] },
  { id: "procedures", label: t[RSC.APP_TAB_PROCEDURES_BUTTON] },
  { id: "documents", label: t[RSC.APP_TAB_DOCUMENTS_BUTTON] },
  { id: "try", label: t[RSC.APP_TAB_TRY_BUTTON] }
];

function App() {
  const [tab, setTab] = useState<Tab>("researchers");
  const [status, setStatus] = useState<DatabaseStatus | "error" | null>(null);

  useEffect(() => {
    api<DatabaseStatus>("/status").then(setStatus).catch(() => setStatus("error"));
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <nav aria-label={t[RSC.APP_SHELL_NAV_PRIMARY_LABEL]} className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <a className="text-base font-semibold" href="/">
            {t[RSC.APP_BRAND_NAME_TEXT]}
          </a>
          <Button asChild variant="outline" size="sm">
            <a href="/health">
              <Activity aria-hidden="true" className="h-4 w-4" />
              {t[RSC.APP_SHELL_HEALTH_BUTTON]}
            </a>
          </Button>
        </nav>
      </header>
      <main className="mx-auto grid max-w-5xl gap-6 px-6 py-10" aria-labelledby="page-title">
        <section aria-labelledby="page-title" className="grid gap-3">
          <h1 id="page-title" className="text-3xl font-semibold tracking-normal">
            {t[RSC.APP_SHELL_TITLE_TEXT]}
          </h1>
          <p className="max-w-2xl text-sm leading-6 text-slate-600">{t[RSC.APP_SHELL_SUBTITLE_TEXT]}</p>
        </section>
        <section aria-labelledby="runtime-title">
          <Card>
            <CardHeader>
              <CardTitle id="runtime-title" className="flex items-center gap-2">
                <Server aria-hidden="true" className="h-5 w-5 text-emerald-600" />
                {t[RSC.APP_RUNTIME_TITLE_TEXT]}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p role="status" data-testid="service-state" className="text-sm text-slate-700">
                {status === "error" || (status && !status.koreanConfig)
                  ? t[RSC.APP_RUNTIME_ERROR_ALERT]
                  : status
                    ? `${t[RSC.APP_RUNTIME_READY_STATUS]} ${status.koreanSample ?? ""}`
                    : ""}
              </p>
            </CardContent>
          </Card>
        </section>
        <div role="tablist" aria-label={t[RSC.APP_TABS_LABEL]} className="flex gap-2">
          {tabs.map((entry) => (
            <Button
              key={entry.id}
              role="tab"
              id={`tab-${entry.id}`}
              aria-selected={tab === entry.id}
              aria-controls="tab-panel"
              variant={tab === entry.id ? "default" : "outline"}
              size="sm"
              onClick={() => setTab(entry.id)}
            >
              {entry.label}
            </Button>
          ))}
        </div>
        <div role="tabpanel" id="tab-panel" aria-labelledby={`tab-${tab}`}>
          {tab === "researchers" && <ResearchersView t={t} />}
          {tab === "procedures" && <ProceduresView t={t} />}
          {tab === "documents" && <DocumentsView t={t} />}
          {tab === "try" && <TryView t={t} />}
        </div>
      </main>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
