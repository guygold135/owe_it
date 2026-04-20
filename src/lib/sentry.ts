import * as Sentry from "@sentry/react";

const dsn = import.meta.env.VITE_SENTRY_DSN;

if (typeof dsn === "string" && dsn.length > 0) {
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    release: `owe-it@${import.meta.env.VITE_APP_VERSION ?? "dev"}`,
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: import.meta.env.PROD ? 0.1 : 1,
  });
}

export { Sentry };
