import { afterAll, afterEach, beforeAll } from "vitest";
import { cleanup } from "@testing-library/react";
import { server } from "@/lib/mocks/server";
import { resetMockRole } from "@/lib/mocks/role";

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});

afterEach(() => {
  cleanup();
  server.resetHandlers();
  resetMockRole();
});

afterAll(() => {
  server.close();
});
