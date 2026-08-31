export function formatDuration(totalSeconds: number) {
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");

  return `${hours}:${minutes}:${seconds}`;
}

export function formatClockTime(date: Date) {
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit"
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

export function getThanksgivingDate(year: number) {
  const novemberFirst = new Date(year, 10, 1);
  const dayOfWeek = novemberFirst.getDay();
  const firstThursdayDate = 1 + ((4 - dayOfWeek + 7) % 7);
  return new Date(year, 10, firstThursdayDate + 21);
}

export function getNextThanksgiving(baseDate = new Date()) {
  const currentYearThanksgiving = getThanksgivingDate(baseDate.getFullYear());
  if (baseDate <= currentYearThanksgiving) {
    return currentYearThanksgiving;
  }

  return getThanksgivingDate(baseDate.getFullYear() + 1);
}

export function formatTotalHours(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  return `${hours}h ${minutes}m`;
}
