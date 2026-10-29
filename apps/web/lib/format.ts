import type { ContainerSizeFt } from "./api/types";

const DECIMAL_PATTERN = /^-?\d+(\.\d+)?$/;

interface PaiseParts {
  sign: "" | "-";
  integer: string;
  fraction: string;
}

function groupIndian(integer: string): string {
  if (integer.length <= 3) {
    return integer;
  }

  const lastThree = integer.slice(-3);
  const rest = integer.slice(0, -3);
  const groups: string[] = [];

  for (let end = rest.length; end > 0; end -= 2) {
    groups.unshift(rest.slice(Math.max(0, end - 2), end));
  }

  return `${groups.join(",")},${lastThree}`;
}

function toPaiseParts(amount: string): PaiseParts | null {
  const trimmed = amount.trim();

  if (!DECIMAL_PATTERN.test(trimmed)) {
    return null;
  }

  let sign: "" | "-" = "";
  let unsigned = trimmed;

  if (unsigned.startsWith("-")) {
    sign = "-";
    unsigned = unsigned.slice(1);
  }

  const [rawInteger, rawFraction = ""] = unsigned.split(".");
  let integer = rawInteger.replace(/^0+(?=\d)/, "");
  let fraction = rawFraction;

  if (fraction.length > 2) {
    const kept = fraction.slice(0, 2) || "0";
    const nextDigit = fraction.charCodeAt(2) - 48;
    let paise = BigInt(kept);

    if (nextDigit >= 5) {
      paise += BigInt(1);
    }

    if (paise === BigInt(100)) {
      paise = BigInt(0);
      integer = (BigInt(integer) + BigInt(1)).toString();
    }

    fraction = paise.toString().padStart(2, "0");
  } else {
    fraction = fraction.padEnd(2, "0");
  }

  if (integer === "0" && fraction === "00") {
    sign = "";
  }

  return { sign, integer, fraction };
}

/**
 * Formats a decimal money string without converting it to a JavaScript number.
 * A null, empty or malformed value is "Unavailable", never zero.
 */
export function formatMoney(amount: string | null): string {
  if (amount === null || amount.trim() === "") {
    return "Unavailable";
  }

  const parts = toPaiseParts(amount);

  if (!parts) {
    return "Unavailable";
  }

  return `${parts.sign}₹${groupIndian(parts.integer)}.${parts.fraction}`;
}

export function formatDays(days: number): string {
  if (!Number.isFinite(days)) {
    return "Unavailable";
  }

  return `${days.toFixed(1)} days`;
}

export function formatPercent(value: number): string {
  if (!Number.isFinite(value)) {
    return "Unavailable";
  }

  return `${Math.round(value)}%`;
}

export function formatWeight(kg: number): string {
  if (!Number.isFinite(kg)) {
    return "Unavailable";
  }

  return `${kg.toLocaleString("en-IN")} kg`;
}

function formatDateParts(
  isoTimestamp: string,
  timezone: string,
  includeTime: boolean,
): string | null {
  const date = new Date(isoTimestamp);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const formatter = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(includeTime
      ? { hour: "2-digit", minute: "2-digit", hour12: false }
      : {}),
    timeZone: timezone,
  });

  const formatted = formatter.format(date);

  if (!includeTime) {
    return formatted;
  }

  const zone =
    new Intl.DateTimeFormat("en-IN", {
      timeZone: timezone,
      timeZoneName: "short",
    })
      .formatToParts(date)
      .find((part) => part.type === "timeZoneName")?.value ?? timezone;

  return `${formatted} ${zone}`;
}

/** Formats a UTC timestamp in the port timezone with the zone shown. */
export function formatDateTime(isoTimestamp: string, timezone: string): string {
  return formatDateParts(isoTimestamp, timezone, true) ?? "Unavailable";
}

/** Formats a UTC timestamp as a date in the port timezone. */
export function formatDate(isoTimestamp: string, timezone: string): string {
  return formatDateParts(isoTimestamp, timezone, false) ?? "Unavailable";
}

export function formatContainerSizeFt(size: ContainerSizeFt): string {
  return `${size} ft`;
}
