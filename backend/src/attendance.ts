import type { SystemSettings } from "./types.js";

export type CalculatedAttendanceStatus = "ON_TIME" | "LATE" | "EARLY_LEAVE" | "HOLIDAY" | "WEEKEND";

export type LocalDateContext = {
  isoDate: string;
  dayOfWeek: number;
  minutes: number;
};

export type AttendanceCalculation = {
  workDate: string;
  totalMinutes: number;
  overtimeMinutes: number;
  status: CalculatedAttendanceStatus;
};

const defaultTimeZone = "Asia/Ho_Chi_Minh";

export function attendanceTimeZone() {
  return process.env.APP_TIME_ZONE?.trim() || defaultTimeZone;
}

export function getLocalDateContext(date: Date, timeZone = attendanceTimeZone()): LocalDateContext {
  const parts = zonedParts(date, timeZone);
  const isoDate = [parts.year, parts.month, parts.day].map((value, index) => String(value).padStart(index === 0 ? 4 : 2, "0")).join("-");
  const dayOfWeek = new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
  return { isoDate, dayOfWeek, minutes: parts.hour * 60 + parts.minute };
}

export function calculateAttendance(
  checkInAt: Date,
  checkOutAt: Date,
  settings: Pick<SystemSettings, "attendancePolicy" | "workSchedules" | "holidays">,
  timeZone = attendanceTimeZone()
): AttendanceCalculation {
  const checkIn = getLocalDateContext(checkInAt, timeZone);
  const checkOut = getLocalDateContext(checkOutAt, timeZone);
  const schedule = settings.workSchedules[0];
  const elapsedMinutes = Math.max(0, Math.floor((checkOutAt.getTime() - checkInAt.getTime()) / 60000));
  const breakMinutes = schedule && checkIn.isoDate === checkOut.isoDate
    ? overlapMinutes(checkIn.minutes, checkOut.minutes, toMinutes(schedule.morningEndTime), toMinutes(schedule.afternoonStartTime))
    : 0;
  const totalMinutes = Math.max(0, elapsedMinutes - breakMinutes);
  const overtimeThresholdMinutes = Math.max(0, Math.round(settings.attendancePolicy.overtimeAfterHours * 60));
  const overtimeMinutes = Math.max(0, totalMinutes - overtimeThresholdMinutes);
  const isHoliday = settings.holidays.some((holiday) => checkIn.isoDate >= holiday.startDate && checkIn.isoDate <= holiday.endDate);

  let status: CalculatedAttendanceStatus = "ON_TIME";
  if (isHoliday) {
    status = "HOLIDAY";
  } else if (!schedule || !schedule.workDays.includes(checkIn.dayOfWeek)) {
    status = "WEEKEND";
  } else {
    const lateAfter = toMinutes(schedule.startTime) + settings.attendancePolicy.lateGraceMinutes;
    const earlyBefore = toMinutes(schedule.endTime) - settings.attendancePolicy.earlyLeaveGraceMinutes;
    if (checkIn.minutes > lateAfter) status = "LATE";
    else if (checkOut.isoDate === checkIn.isoDate && checkOut.minutes < earlyBefore) status = "EARLY_LEAVE";
  }

  return { workDate: checkIn.isoDate, totalMinutes, overtimeMinutes, status };
}

function overlapMinutes(start: number, end: number, breakStart: number, breakEnd: number) {
  if (end <= start || breakEnd <= breakStart) return 0;
  return Math.max(0, Math.min(end, breakEnd) - Math.max(start, breakStart));
}

function toMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function zonedParts(date: Date, timeZone: string) {
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = createFormatter(timeZone);
  } catch {
    formatter = createFormatter(defaultTimeZone);
  }
  const values = Object.fromEntries(formatter.formatToParts(date).filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]));
  return { year: values.year, month: values.month, day: values.day, hour: values.hour, minute: values.minute };
}

function createFormatter(timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  });
}