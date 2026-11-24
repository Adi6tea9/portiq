import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { InfoTip } from "./InfoTip";

const setup = () => {
  render(
    <>
      <InfoTip label="Weight">Total gross weight.</InfoTip>
      <button type="button">Elsewhere</button>
    </>,
  );
  return { user: userEvent.setup(), trigger: screen.getByRole("button", { name: "About Weight" }) };
};

describe("InfoTip", () => {
  it("opens on hover and closes when the pointer leaves", async () => {
    const { user, trigger } = setup();
    expect(screen.queryByRole("tooltip")).toBeNull();
    await user.hover(trigger);
    expect(screen.getByRole("tooltip").textContent).toBe("Total gross weight.");
    expect(trigger.getAttribute("aria-describedby")).toBe(screen.getByRole("tooltip").id);
    await user.unhover(trigger);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("stays open after a click (touch) and closes on Escape", async () => {
    const { user, trigger } = setup();
    await user.click(trigger);
    await user.unhover(trigger);
    expect(screen.getByRole("tooltip")).toBeTruthy();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("opens on keyboard focus and closes when focus moves on", async () => {
    const { user } = setup();
    await user.tab();
    expect(screen.getByRole("tooltip")).toBeTruthy();
    await user.tab();
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("closes on a click outside", async () => {
    const { user, trigger } = setup();
    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: "Elsewhere" }));
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
});
