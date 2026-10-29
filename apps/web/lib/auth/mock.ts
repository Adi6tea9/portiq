const MOCK_AUTH_KEY = "portiq.mock.auth";
const MOCK_AUTH_EVENT = "portiq:mock-auth";

export function isMockMode(): boolean {
  return process.env.NEXT_PUBLIC_USE_MOCKS === "true";
}

export function isMockAuthenticated(): boolean {
  if (!isMockMode() || typeof window === "undefined") {
    return false;
  }

  try {
    return window.sessionStorage.getItem(MOCK_AUTH_KEY) === "1";
  } catch {
    return false;
  }
}

export function setMockAuthenticated(authenticated: boolean): void {
  if (!isMockMode() || typeof window === "undefined") {
    return;
  }

  try {
    if (authenticated) {
      window.sessionStorage.setItem(MOCK_AUTH_KEY, "1");
    } else {
      window.sessionStorage.removeItem(MOCK_AUTH_KEY);
    }
  } catch {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<boolean>(MOCK_AUTH_EVENT, { detail: authenticated }),
  );
}

export function subscribeToMockAuth(
  listener: (authenticated: boolean) => void,
): () => void {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const onCustomEvent = (event: Event) => {
    const detail = (event as CustomEvent<unknown>).detail;

    if (typeof detail === "boolean") {
      listener(detail);
    }
  };

  const onStorage = (event: StorageEvent) => {
    if (event.key === MOCK_AUTH_KEY) {
      listener(event.newValue === "1");
    }
  };

  window.addEventListener(MOCK_AUTH_EVENT, onCustomEvent);
  window.addEventListener("storage", onStorage);

  return () => {
    window.removeEventListener(MOCK_AUTH_EVENT, onCustomEvent);
    window.removeEventListener("storage", onStorage);
  };
}
