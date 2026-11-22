import { cn } from "@/lib/utils";

/** Decorative PortIQ container cut-out. Theme-only and hidden from screen readers. */
export function ContainerArt({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- 52 KB static WebP, already sized
    <img
      src="/themes/portiq/portiq-container.webp"
      alt=""
      aria-hidden="true"
      width={900}
      height={518}
      loading="lazy"
      decoding="async"
      className={cn("app-container-art pointer-events-none select-none", className)}
    />
  );
}
