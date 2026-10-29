import { setupWorker } from "msw/browser";
import type { SetupWorker } from "msw/browser";
import { handlers } from "./handlers";

let worker: SetupWorker | null = null;
let startPromise: Promise<void> | null = null;

function getWorker(): SetupWorker {
  if (!worker) {
    worker = setupWorker(...handlers);
  }

  return worker;
}

export function startMockWorker(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.resolve();
  }

  if (!startPromise) {
    startPromise = getWorker()
      .start({
        onUnhandledRequest: "bypass",
        serviceWorker: { url: "/mockServiceWorker.js" },
        quiet: true,
      })
      .then(() => undefined)
      .catch((error: unknown) => {
        startPromise = null;
        throw error;
      });
  }

  return startPromise;
}
