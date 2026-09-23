import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getManagerAssignmentError, invalidManagerError, isActiveManager, normalizeManagerId, selfManagerError } from "./managerAssignment.js";

const activeManager = { id: "manager-1", role: "MANAGER", employmentStatus: "ACTIVE", locked: false };

describe("manager assignment", () => {
  it("normalizes empty and padded manager IDs", () => {
    assert.equal(normalizeManagerId("  manager-1  "), "manager-1");
    assert.equal(normalizeManagerId("   "), null);
    assert.equal(normalizeManagerId(undefined), null);
  });

  it("accepts active Manager and Admin accounts", () => {
    assert.equal(isActiveManager(activeManager), true);
    assert.equal(isActiveManager({ ...activeManager, role: "ADMIN" }), true);
    assert.equal(getManagerAssignmentError(" manager-1 ", "employee-1", activeManager), "");
  });

  it("allows an employee to have no manager", () => {
    assert.equal(getManagerAssignmentError("", "employee-1", null), "");
  });

  it("rejects self-management", () => {
    assert.equal(getManagerAssignmentError("employee-1", "employee-1", null), selfManagerError);
  });

  it("rejects missing, mismatched, inactive, locked, and non-manager accounts", () => {
    const invalidCandidates = [
      null,
      { ...activeManager, id: "another-manager" },
      { ...activeManager, employmentStatus: "INACTIVE" },
      { ...activeManager, locked: true },
      { ...activeManager, role: "EMPLOYEE" }
    ];
    for (const candidate of invalidCandidates) {
      assert.equal(getManagerAssignmentError("manager-1", "employee-1", candidate), invalidManagerError);
    }
  });
});