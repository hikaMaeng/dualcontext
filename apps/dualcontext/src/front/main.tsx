import React from "react";
import ReactDOM from "react-dom/client";
import { Activity, Server } from "lucide-react";
import { Button } from "./components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card";
import { direction, resolveLanguage, texts } from "./i18n";
import { RSC } from "./resource";
import "./styles.css";

const language = resolveLanguage();
const t = texts(language);

document.documentElement.lang = language;
document.documentElement.dir = direction(language);

function App() {
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
          <p className="max-w-2xl text-sm leading-6 text-slate-600">
            {t[RSC.APP_SHELL_SUBTITLE_TEXT]}
          </p>
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
                {t[RSC.APP_RUNTIME_READY_STATUS]}
              </p>
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
