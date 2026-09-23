export type ManagerCandidate = {
  id: string;
  role: string;
  employmentStatus: string;
  locked: boolean;
};

export const selfManagerError = "An employee cannot manage their own account";
export const invalidManagerError = "Manager must be an active Manager or Admin account";

export function normalizeManagerId(managerId?: string | null) {
  return managerId?.trim() || null;
}

export function isActiveManager(candidate?: ManagerCandidate | null): candidate is ManagerCandidate {
  return Boolean(
    candidate
      && (candidate.role === "MANAGER" || candidate.role === "ADMIN")
      && candidate.employmentStatus === "ACTIVE"
      && !candidate.locked
  );
}

export function getManagerAssignmentError(
  managerId?: string | null,
  employeeId?: string,
  candidate?: ManagerCandidate | null
) {
  const normalizedManagerId = normalizeManagerId(managerId);
  if (!normalizedManagerId) return "";
  if (employeeId && normalizedManagerId === employeeId) return selfManagerError;
  return candidate?.id === normalizedManagerId && isActiveManager(candidate) ? "" : invalidManagerError;
}