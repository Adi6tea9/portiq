interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

const WALL_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

function readPart(parts: Intl.DateTimeFormatPart[], type: string): number {
  const part = parts.find((item) => item.type === type);

  if (!part) {
    throw new Error(`Missing ${type} in formatted port time.`);
  }

  const value = Number(part.value);

  if (!Number.isFinite(value)) {
    throw new Error(`Invalid ${type} in formatted port time.`);
  }

  return value;
}

function zonedParts(date: Date, timeZone: string): ZonedParts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  return {
    year: readPart(parts, "year"),
    month: readPart(parts, "month"),
    day: readPart(parts, "day"),
    hour: readPart(parts, "hour"),
    minute: readPart(parts, "minute"),
  };
}

// CONTRACT-GAP: GAP-015
export function portWallTimeToUtc(wallTime: string, timeZone: string): string {
  const match = WALL_TIME_PATTERN.exec(wallTime);

  if (!match) {
    throw new Error("Expected a date and time in YYYY-MM-DDTHH:mm format.");
  }

  const desired = Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
  );
  let candidate = desired;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = zonedParts(new Date(candidate), timeZone);
    const rendered = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
    );
    const offset = desired - rendered;

    candidate += offset;

    if (offset === 0) {
      break;
    }
  }

  return new Date(candidate).toISOString();
}
