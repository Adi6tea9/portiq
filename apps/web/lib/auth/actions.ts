"use client";

import { getBrowserClient } from "./client";
import { isMockMode, setMockAuthenticated } from "./mock";

export interface AuthResult {
  error: string | null;
  needsEmailConfirmation?: boolean;
}

const SIGN_IN_ERROR = "Unable to sign in. Check your details and try again.";
const SIGN_UP_ERROR = "Unable to create your account. Please try again.";
const RECOVERY_ERROR = "Unable to send a recovery link. Please try again.";
const UPDATE_PASSWORD_ERROR =
  "Unable to update your password. Please try again.";

function redirectUrl(path: string): string | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  return `${window.location.origin}${path}`;
}

export async function signInWithPassword(
  email: string,
  password: string,
): Promise<AuthResult> {
  if (isMockMode()) {
    setMockAuthenticated(true);
    return { error: null };
  }

  const client = getBrowserClient();

  if (!client) {
    return { error: SIGN_IN_ERROR };
  }

  const { error } = await client.auth.signInWithPassword({ email, password });

  return { error: error ? SIGN_IN_ERROR : null };
}

export async function signUpWithPassword(
  email: string,
  password: string,
): Promise<AuthResult> {
  if (isMockMode()) {
    setMockAuthenticated(true);
    return { error: null, needsEmailConfirmation: false };
  }

  const client = getBrowserClient();

  if (!client) {
    return { error: SIGN_UP_ERROR };
  }

  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: redirectUrl("/auth/callback"),
    },
  });

  if (error) {
    return { error: SIGN_UP_ERROR };
  }

  return { error: null, needsEmailConfirmation: !data.session };
}

export async function requestPasswordReset(email: string): Promise<AuthResult> {
  if (isMockMode()) {
    return { error: null };
  }

  const client = getBrowserClient();

  if (!client) {
    return { error: RECOVERY_ERROR };
  }

  const { error } = await client.auth.resetPasswordForEmail(email, {
    redirectTo: redirectUrl("/auth/callback?next=/reset-password"),
  });

  return { error: error ? RECOVERY_ERROR : null };
}

export async function updatePassword(password: string): Promise<AuthResult> {
  if (isMockMode()) {
    return { error: null };
  }

  const client = getBrowserClient();

  if (!client) {
    return { error: UPDATE_PASSWORD_ERROR };
  }

  const { error } = await client.auth.updateUser({ password });

  return { error: error ? UPDATE_PASSWORD_ERROR : null };
}

export async function signOut(): Promise<AuthResult> {
  if (isMockMode()) {
    setMockAuthenticated(false);
    return { error: null };
  }

  const client = getBrowserClient();

  if (!client) {
    return { error: null };
  }

  const { error } = await client.auth.signOut();

  return { error: error ? "Unable to sign out. Please try again." : null };
}
