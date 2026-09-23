export function formatDuration(totalSeconds: number) {
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");

  return `${hours}:${minutes}:${seconds}`;
}

export function formatClockTime(date: Date, locale: "en-US" | "vi-VN" = "en-US") {
  return date.toLocaleTimeString(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: locale === "en-US"
  });
}

export function formatLogDate(date: Date) {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    weekday: "short"
  });
}

export function formatSummaryDate(date: Date, locale: "en-US" | "vi-VN") {
  return date.toLocaleDateString(locale, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric"
  });
}

export function addDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

export function formatHolidayRange(startDate: Date, endDate: Date, locale: "en-US" | "vi-VN") {
  const options: Intl.DateTimeFormatOptions =
    locale === "vi-VN"
      ? { day: "2-digit", month: "2-digit", year: "numeric" }
      : { month: "short", day: "numeric", year: "numeric" };

  return `${startDate.toLocaleDateString(locale, options)} - ${endDate.toLocaleDateString(locale, options)}`;
}

export function formatTotalHours(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  return `${hours}h ${minutes}m`;
}

export function formatWorkDate(workDate: string, locale: "en-US" | "vi-VN") {
  const date = new Date(`${workDate}T00:00:00`);
  return date.toLocaleDateString(locale, {
    weekday: "short",
    month: "short",
    day: "numeric"
  });
}
export function formatAttendanceTime(value: string, locale: "en-US" | "vi-VN") {
  if (locale === "en-US" || value === "--") return value;
  const match = value.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return value;
  let hours = Number(match[1]);
  if (match[3].toUpperCase() === "PM" && hours !== 12) hours += 12;
  if (match[3].toUpperCase() === "AM" && hours === 12) hours = 0;
  return `${String(hours).padStart(2, "0")}:${match[2]}`;
}