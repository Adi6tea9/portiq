import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isMockAuthenticated,
  isMockMode,
  setMockAuthenticated,
  subscribeToMockAuth,
} from "./mock";

describe("mock auth", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_USE_MOCKS = "true";
    window.sessionStorage.clear();
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_USE_MOCKS;
    window.sessionStorage.clear();
  });

  it("tracks the mock session flag", () => {
    expect(isMockMode()).toBe(true);
    expect(isMockAuthenticated()).toBe(false);

    setMockAuthenticated(true);
    expect(isMockAuthenticated()).toBe(true);

    setMockAuthenticated(false);
    expect(isMockAuthenticated()).toBe(false);
  });

  it("notifies subscribers", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToMockAuth(listener);

    setMockAuthenticated(true);
    setMockAuthenticated(false);
    unsubscribe();
    setMockAuthenticated(true);

    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenNthCalledWith(1, true);
    expect(listener).toHaveBeenNthCalledWith(2, false);
  });
});
