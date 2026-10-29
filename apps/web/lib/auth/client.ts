import type { SupabaseClient } from "@supabase/supabase-js";
import { createBrowserClient } from "@supabase/ssr";
import { isMockMode } from "./mock";

let browserClient: SupabaseClient | null = null;

export function getBrowserClient(): SupabaseClient | null {
  if (typeof window === "undefined") {
    return null;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    return null;
  }

  if (!browserClient) {
    browserClient = createBrowserClient(url, key);
  }

  return browserClient;
}

/**
 * Reads the current Supabase access token. The SDK owns session persistence;
 * this function never reads or writes storage itself.
 */
export async function getAccessToken(): Promise<string | null> {
  if (isMockMode()) {
    return null;
  }

  const client = getBrowserClient();

  if (!client) {
    return null;
  }

  const { data, error } = await client.auth.getSession();

  if (error) {
    return null;
  }

  return data.session?.access_token ?? null;
}
