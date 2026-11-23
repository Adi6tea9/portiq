"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getAccessToken } from "@/lib/auth/client";
import { isMockMode } from "@/lib/auth/mock";
import { ApiError, apiClient, getApiBaseUrl, handleUnauthorized } from "../client";
import type {
  CargoItem,
  CargoItemCreate,
  CargoItemPost,
  ContainerFullDetail,
  LoadPlan,
  SharedContainerSummary,
} from "../types";

const cargoKey = (id: string) => ["shipment", id, "cargo"] as const;
const planKey = (id: string) => ["shipment", id, "load-plan"] as const;
const sharedKey = (id: string) => ["shipment", id, "shared-containers"] as const;

export function useCargo(shipmentId: string) {
  return useQuery<CargoItem[], ApiError>({
    queryKey: cargoKey(shipmentId),
    queryFn: async () => (await apiClient<CargoItem[]>(`/shipments/${shipmentId}/cargo`)).data,
    enabled: !!shipmentId,
  });
}

export function useLoadPlan(shipmentId: string) {
  return useQuery<LoadPlan, ApiError>({
    queryKey: planKey(shipmentId),
    queryFn: async () =>
      (await apiClient<LoadPlan>(`/shipments/${shipmentId}/load-plan`)).data,
    enabled: !!shipmentId,
  });
}

export function useSharedContainers(shipmentId: string, enabled = true) {
  return useQuery<SharedContainerSummary[], ApiError>({
    queryKey: sharedKey(shipmentId),
    queryFn: async () =>
      (await apiClient<SharedContainerSummary[]>(`/shipments/${shipmentId}/shared-containers`))
        .data,
    enabled: !!shipmentId && enabled,
  });
}

/** The CONTAINER_FULL detail on a 409, or null for any other error. */
export function containerFullDetail(error: unknown): ContainerFullDetail | null {
  if (!(error instanceof ApiError) || error.code !== "CONTAINER_FULL") return null;
  return (error.details?.[0] as unknown as ContainerFullDetail | undefined) ?? null;
}

function useInvalidateCargo(shipmentId: string) {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: cargoKey(shipmentId) }),
      queryClient.invalidateQueries({ queryKey: planKey(shipmentId) }),
      queryClient.invalidateQueries({ queryKey: sharedKey(shipmentId) }),
    ]);
}

export function useCreateCargo(shipmentId: string) {
  const onSuccess = useInvalidateCargo(shipmentId);
  return useMutation<CargoItem[], ApiError, CargoItemPost>({
    mutationFn: async (body) =>
      (
        await apiClient<{ items: CargoItem[] }>(`/shipments/${shipmentId}/cargo`, {
          method: "POST",
          body: JSON.stringify(body),
        })
      ).data.items,
    onSuccess,
  });
}

export function useUpdateCargo(shipmentId: string) {
  const onSuccess = useInvalidateCargo(shipmentId);
  return useMutation<CargoItem, ApiError, { id: string; patch: Partial<CargoItemCreate> }>({
    mutationFn: async ({ id, patch }) =>
      (
        await apiClient<CargoItem>(`/shipments/${shipmentId}/cargo/${id}`, {
          method: "PATCH",
          body: JSON.stringify(patch),
        })
      ).data,
    onSuccess,
  });
}

export function useDeleteCargo(shipmentId: string) {
  const onSuccess = useInvalidateCargo(shipmentId);
  return useMutation<void, ApiError, string>({
    // apiClient expects an envelope, and DELETE returns an empty 204.
    mutationFn: async (id) => {
      const token = await getAccessToken();
      const response = await fetch(`${getApiBaseUrl()}/shipments/${shipmentId}/cargo/${id}`, {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (response.status === 401) handleUnauthorized();
      if (!response.ok) {
        throw new ApiError(response.status, "DELETE_FAILED", "Could not delete the cargo line.", "unknown");
      }
    },
    onSuccess,
  });
}

/**
 * Splits buffered SSE text into complete events. Returns the parsed events and
 * the unfinished remainder to keep for the next chunk. Comments (`: ping`) are dropped.
 */
export function parseSseChunk(buffer: string): {
  events: Array<{ event: string; data: string }>;
  rest: string;
} {
  const blocks = buffer.replace(/\r\n/g, "\n").split("\n\n");
  const rest = blocks.pop() ?? "";
  const events = blocks.flatMap((block) => {
    let event = "message";
    const data: string[] = [];
    for (const line of block.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
    }
    return data.length > 0 ? [{ event, data: data.join("\n") }] : [];
  });
  return { events, rest };
}

/**
 * Follows the load-plan change stream and refetches the plan on each `version`
 * event. It uses fetch, not EventSource, so it can send the Authorization header.
 * Mock mode has no stream: mutations already invalidate the plan.
 */
export function useLoadPlanStream(shipmentId: string): { connected: boolean } {
  const queryClient = useQueryClient();
  const [connected, setConnected] = React.useState(false);

  React.useEffect(() => {
    if (!shipmentId || isMockMode()) return;
    const controller = new AbortController();
    let attempt = 0;

    const run = async () => {
      while (!controller.signal.aborted) {
        try {
          const token = await getAccessToken();
          const response = await fetch(
            `${getApiBaseUrl()}/shipments/${shipmentId}/load-plan/stream`,
            {
              headers: {
                Accept: "text/event-stream",
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
              },
              signal: controller.signal,
            },
          );
          // Access errors will not fix themselves; stop retrying.
          if (response.status === 401 || response.status === 403 || response.status === 404) return;
          if (!response.ok || !response.body) throw new Error(`stream ${response.status}`);
          setConnected(true);
          attempt = 0;
          const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
          let buffer = "";
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            const parsed = parseSseChunk(buffer + value);
            buffer = parsed.rest;
            if (parsed.events.some((event) => event.event === "version")) {
              void queryClient.invalidateQueries({ queryKey: planKey(shipmentId) });
            }
          }
        } catch {
          // Network drop or abort: fall through to the backoff below.
        }
        setConnected(false);
        if (controller.signal.aborted) return;
        const wait = Math.min(30_000, 1000 * 2 ** attempt++);
        await new Promise((resolve) => setTimeout(resolve, wait));
      }
    };
    void run();
    return () => controller.abort();
  }, [shipmentId, queryClient]);

  return { connected };
}
