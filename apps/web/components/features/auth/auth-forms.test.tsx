import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  requestPasswordReset,
  signInWithPassword,
  signUpWithPassword,
} from "@/lib/auth/actions";
import { LoginForm } from "./LoginForm";
import { SignupForm } from "./SignupForm";
import { ForgotPasswordForm } from "./ForgotPasswordForm";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & {
    href: string;
    children: ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/lib/auth/actions", () => ({
  signInWithPassword: vi.fn(),
  signUpWithPassword: vi.fn(),
  requestPasswordReset: vi.fn(),
  updatePassword: vi.fn(),
  signOut: vi.fn(),
}));

describe("auth forms", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows login validation errors and keeps the entered email", async () => {
    const user = userEvent.setup();
    render(<LoginForm returnTo={null} />);

    const email = screen.getByLabelText(/^Email/);
    await user.type(email, "not-an-email");
    await act(async () => {
      await user.click(screen.getByRole("button", { name: "Sign in" }));
    });

    expect(await screen.findByText("Enter a valid email address.")).toBeTruthy();
    expect(screen.getByText("Enter your password.")).toBeTruthy();
    expect((email as HTMLInputElement).value).toBe("not-an-email");
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it("shows a generic login error without clearing the form", async () => {
    vi.mocked(signInWithPassword).mockResolvedValue({
      error: "Unable to sign in. Check your details and try again.",
    });
    const user = userEvent.setup();
    render(<LoginForm returnTo={null} />);

    await user.type(screen.getByLabelText(/^Email/), "importer@portiq.demo");
    await user.type(screen.getByLabelText(/^Password/), "password");
    await act(async () => {
      await user.click(screen.getByRole("button", { name: "Sign in" }));
    });

    expect(
      await screen.findByText(
        "Unable to sign in. Check your details and try again.",
      ),
    ).toBeTruthy();
    expect(
      (screen.getByLabelText(/^Email/) as HTMLInputElement).value,
    ).toBe("importer@portiq.demo");
  });

  it("requires an eight character signup password", async () => {
    const user = userEvent.setup();
    render(<SignupForm returnTo={null} />);

    await user.type(screen.getByLabelText(/^Email/), "new@portiq.demo");
    await user.type(screen.getByLabelText(/^Password/), "short");
    await act(async () => {
      await user.click(screen.getByRole("button", { name: "Create account" }));
    });

    expect(
      await screen.findByText("Password must be at least 8 characters."),
    ).toBeTruthy();
    expect(signUpWithPassword).not.toHaveBeenCalled();
  });

  it("shows a non-enumerating recovery confirmation", async () => {
    vi.mocked(requestPasswordReset).mockResolvedValue({ error: null });
    const user = userEvent.setup();
    render(<ForgotPasswordForm />);

    await user.type(screen.getByLabelText(/^Email/), "unknown@portiq.demo");
    await act(async () => {
      await user.click(
        screen.getByRole("button", { name: "Send recovery link" }),
      );
    });

    expect(
      await screen.findByText(
        "If an account exists for that email, a recovery link has been sent.",
      ),
    ).toBeTruthy();
  });
});
