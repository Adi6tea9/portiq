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

/**
 * On a fresh browser profile `worker.start()` resolves before the new service worker
 * controls the page; requests made in that gap skip the mocks and reach the real API.
 * Wait for control (bounded, so a browser that never hands it over cannot hang the app).
 */
function waitForController(timeoutMs = 3000): Promise<void> {
  const container = navigator.serviceWorker;
  if (!container || container.controller) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const done = () => {
      window.clearTimeout(timer);
      resolve();
    };
    const timer = window.setTimeout(() => {
      container.removeEventListener("controllerchange", done);
      reject(new Error("MSW service worker did not claim the page in time."));
    }, timeoutMs);
    container.addEventListener("controllerchange", done, { once: true });
  });
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
      .then((registration) => {
        if (!registration) {
          return;
        } 
        return waitForController();
      })
      .catch((error: unknown) => {
        startPromise = null;
        console.error("Mock API failed to start; requests will reach the real API.", error);
        throw error;
      });
  }

  return startPromise;
}
