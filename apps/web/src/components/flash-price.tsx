import { useEffect, useRef, useState } from "react";

type Direction = "up" | "down";

interface FlashPriceProps {
  value: number | null | undefined;
  format: (value: number | null) => string;
  className?: string;
}

/**
 * Displays a price and briefly flashes it green when the value ticks up or red
 * when it ticks down (e.g. after a live poll or a manual refresh).
 *
 * The first value only establishes a baseline, so nothing flashes on load. The
 * `sequence` key forces a remount on every change, which restarts the CSS
 * animation even when two updates arrive in quick succession.
 */
export function FlashPrice({ value, format, className }: FlashPriceProps) {
  const previous = useRef<number | null>(null);
  const [flash, setFlash] = useState<{ direction: Direction; sequence: number } | null>(null);

  useEffect(() => {
    const next = typeof value === "number" && Number.isFinite(value) ? value : null;

    if (next != null && previous.current != null && next !== previous.current) {
      const direction: Direction = next > previous.current ? "up" : "down";
      setFlash((current) => ({ direction, sequence: (current?.sequence ?? 0) + 1 }));
    }

    previous.current = next;
  }, [value]);

  return (
    <span
      key={flash?.sequence ?? 0}
      className={["flash-price", flash ? `flash-${flash.direction}` : "", className ?? ""]
        .filter(Boolean)
        .join(" ")}
    >
      {format(value ?? null)}
    </span>
  );
}
