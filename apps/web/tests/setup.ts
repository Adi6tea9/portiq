import { afterAll, afterEach, beforeAll, beforeEach } from "vitest";
import { cleanup } from "@testing-library/react";
import { resetMockDisplayNames } from "@/lib/mocks/handlers";
import { server } from "@/lib/mocks/server";
import { resetMockRole } from "@/lib/mocks/role";

// Recharts' ResponsiveContainer measures its parent in jsdom, which has no
// ResizeObserver.
if (!("ResizeObserver" in globalThis)) {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  globalThis.ResizeObserver =
    ResizeObserverStub as unknown as typeof ResizeObserver;
}

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});

beforeEach(() => {
  resetMockRole();
});

afterEach(() => {
  cleanup();
  server.resetHandlers();
  resetMockRole();
  resetMockDisplayNames();
});

afterAll(() => {
  server.close();
});
