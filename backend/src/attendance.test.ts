import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { calculateAttendance, getLocalDateContext } from "./attendance.js";
import type { SystemSettings } from "./types.js";

const timeZone = "Asia/Ho_Chi_Minh";

function settings(overrides: Partial<Pick<SystemSettings, "attendancePolicy" | "workSchedules" | "holidays">> = {}) {
  return {
    attendancePolicy: {
      standardStartTime: "08:30",
      standardEndTime: "17:30",
      lateGraceMinutes: 10,
      earlyLeaveGraceMinutes: 10,
      overtimeAfterHours: 8,
      requireLocation: false
    },
    workSchedules: [{
      id: "standard",
      startTime: "08:30",
      morningEndTime: "12:00",
      afternoonStartTime: "13:00",
      endTime: "17:30",
      breakMinutes: 60,
      workDays: [1, 2, 3, 4, 5]
    }],
    holidays: [],
    ...overrides
  } satisfies Pick<SystemSettings, "attendancePolicy" | "workSchedules" | "holidays">;
}

function localDateTime(date: string, time: string) {
  return new Date(`${date}T${time}:00+07:00`);
}

describe("getLocalDateContext", () => {
  it("uses the configured timezone for date, weekday, and clock minutes", () => {
    assert.deepEqual(getLocalDateContext(new Date("2026-09-13T17:30:00.000Z"), timeZone), {
      isoDate: "2026-09-14",
      dayOfWeek: 1,
      minutes: 30
    });
  });

  it("falls back to the application timezone when the timezone is invalid", () => {
    const date = new Date("2026-09-14T01:30:00.000Z");
    assert.deepEqual(getLocalDateContext(date, "Invalid/Timezone"), getLocalDateContext(date, timeZone));
  });
});

describe("calculateAttendance", () => {
  it("deducts the lunch overlap from a standard workday", () => {
    const result = calculateAttendance(localDateTime("2026-09-14", "08:30"), localDateTime("2026-09-14", "17:30"), settings(), timeZone);
    assert.deepEqual(result, { workDate: "2026-09-14", totalMinutes: 480, overtimeMinutes: 0, status: "ON_TIME" });
  });

  it("deducts only the portion of a shift that overlaps lunch", () => {
    const result = calculateAttendance(localDateTime("2026-09-14", "11:30"), localDateTime("2026-09-14", "13:30"), settings(), timeZone);
    assert.equal(result.totalMinutes, 60);
  });

  it("honors the late grace boundary", () => {
    const onBoundary = calculateAttendance(localDateTime("2026-09-14", "08:40"), localDateTime("2026-09-14", "17:30"), settings(), timeZone);
    const afterBoundary = calculateAttendance(localDateTime("2026-09-14", "08:41"), localDateTime("2026-09-14", "17:30"), settings(), timeZone);
    assert.equal(onBoundary.status, "ON_TIME");
    assert.equal(afterBoundary.status, "LATE");
  });

  it("honors the early-leave grace boundary", () => {
    const onBoundary = calculateAttendance(localDateTime("2026-09-14", "08:30"), localDateTime("2026-09-14", "17:20"), settings(), timeZone);
    const beforeBoundary = calculateAttendance(localDateTime("2026-09-14", "08:30"), localDateTime("2026-09-14", "17:19"), settings(), timeZone);
    assert.equal(onBoundary.status, "ON_TIME");
    assert.equal(beforeBoundary.status, "EARLY_LEAVE");
  });

  it("calculates overtime after configured payable hours", () => {
    const result = calculateAttendance(localDateTime("2026-09-14", "08:30"), localDateTime("2026-09-14", "18:30"), settings(), timeZone);
    assert.equal(result.totalMinutes, 540);
    assert.equal(result.overtimeMinutes, 60);
  });

  it("marks configured holidays before applying schedule status", () => {
    const result = calculateAttendance(
      localDateTime("2026-09-14", "08:30"),
      localDateTime("2026-09-14", "17:30"),
      settings({ holidays: [{ id: "holiday", name: "Company holiday", startDate: "2026-09-14", endDate: "2026-09-14", paid: true }] }),
      timeZone
    );
    assert.equal(result.status, "HOLIDAY");
  });

  it("marks days outside the work schedule as weekend", () => {
    const result = calculateAttendance(localDateTime("2026-09-13", "08:30"), localDateTime("2026-09-13", "17:30"), settings(), timeZone);
    assert.equal(result.status, "WEEKEND");
  });
});