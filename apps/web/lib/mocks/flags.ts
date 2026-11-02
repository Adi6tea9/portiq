import { isMockMode } from "@/lib/auth/mock";

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * Reads a `?mock_*` page flag. Flags are inert unless mocks are enabled, so
 * production URLs cannot change data selection or forward mock params.
 */
export function mockFlag(searchParams: SearchParams, name: string): boolean {
  return isMockMode() && searchParams[name] === "1";
}

export function mockFlagValue(
  searchParams: SearchParams,
  name: string,
): string | undefined {
  const value = searchParams[name];

  return isMockMode() && typeof value === "string" ? value : undefined;
}
