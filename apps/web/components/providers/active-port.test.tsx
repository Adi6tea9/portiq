import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CapacityClient } from "@/components/features/capacity/CapacityClient";
import { NewShipmentForm } from "@/components/features/shipments/NewShipmentForm";
import { setMockRole } from "@/lib/mocks/role";
import { ActivePortProvider } from "./ActivePortProvider";
import { MeProvider } from "./MeProvider";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

function renderWithActivePort(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MeProvider>
        <ActivePortProvider>{ui}</ActivePortProvider>
      </MeProvider>
    </QueryClientProvider>,
  );
}

describe("active port default", () => {
  afterEach(() => window.localStorage.clear());

  it("starts Capacity on the active port and lets the page override it", async () => {
    setMockRole("importer_exporter");
    window.localStorage.setItem("portiq.activePort.user_imp_001", "port_sin");
    renderWithActivePort(<CapacityClient />);

    const select = (await screen.findByLabelText("Port", undefined, { timeout: 5000 })) as HTMLSelectElement;
    await waitFor(() => expect(select.value).toBe("port_sin"), { timeout: 5000 });

    fireEvent.change(select, { target: { value: "port_nsa" } });
    expect((screen.getByLabelText("Port") as HTMLSelectElement).value).toBe("port_nsa");
  });

  it("keeps the first port on Capacity when no active port is set", async () => {
    setMockRole("importer_exporter");
    renderWithActivePort(<CapacityClient />);

    const select = (await screen.findByLabelText("Port", undefined, { timeout: 5000 })) as HTMLSelectElement;
    expect(select.value).toBe("port_nsa");
  });

  it("prefills the new-shipment port from the active port", async () => {
    setMockRole("importer_exporter");
    window.localStorage.setItem("portiq.activePort.user_imp_001", "port_sin");
    renderWithActivePort(<NewShipmentForm />);

    const select = (await screen.findByLabelText(/^Port/, undefined, { timeout: 5000 })) as HTMLSelectElement;
    await waitFor(() => expect(select.value).toBe("port_sin"), { timeout: 5000 });
  });
});
