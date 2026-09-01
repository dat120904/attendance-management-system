import { type FormEvent, useEffect, useMemo, useState } from "react";
import {
  cancelLeaveRequest,
  createLeaveRequest,
  downloadLeaveAttachment,
  decideLeaveRequest,
  fetchLeaveRequests,
  fetchLeaveWorkflow,
  submitLeaveRequest,
  updateLeaveWorkflow
} from "../api";
import type { AttendanceLog, LeaveAttachment, LeaveRequest, LeaveType, LeaveWorkflowConfig, User } from "../types";
import type { Translation } from "../i18n";
import { formatLogDate } from "../utils/time";

type LeaveRequestsPageProps = {
  authToken: string | null;
  requests: LeaveRequest[];
  workflowConfig: LeaveWorkflowConfig;
  onRequestsChange: (requests: LeaveRequest[]) => void;
  onWorkflowConfigChange: (workflow: LeaveWorkflowConfig) => void;
  onAttendanceLogsCreated: (logs: AttendanceLog[]) => void;
  onUserChange: (user: User) => void;
  t: Translation;
  user: User;
};

const leaveTypes: LeaveType[] = ["Annual Leave", "Sick Leave", "Unpaid Leave", "Compensatory Leave"];

export function LeaveRequestsPage({
  authToken,
  requests,
  workflowConfig,
  onRequestsChange,
  onWorkflowConfigChange,
  onAttendanceLogsCreated,
  onUserChange,
  t,
  user
}: LeaveRequestsPageProps) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    type: "Annual Leave" as LeaveType,
    startDate: today,
    endDate: today,
    reason: "",
    attachmentName: "",
    attachment: undefined as LeaveAttachment | undefined,
    attachmentFile: null as File | null
  });
  const [remoteRequests, setRemoteRequests] = useState<LeaveRequest[] | null>(null);
  const [selectedRequest, setSelectedRequest] = useState<LeaveRequest | null>(requests[0] ?? null);
  const [notice, setNotice] = useState("");
  const [apiError, setApiError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [draftWorkflow, setDraftWorkflow] = useState(workflowConfig);

  useEffect(() => {
    setDraftWorkflow(workflowConfig);
  }, [workflowConfig]);

  useEffect(() => {
    if (!authToken) {
      setRemoteRequests(null);
      setApiError("");
      return;
    }

    let isActive = true;
    setIsLoading(true);
    Promise.all([fetchLeaveRequests(authToken), fetchLeaveWorkflow(authToken)])
      .then(([leaveResult, workflowResult]) => {
        if (!isActive) return;
        setRemoteRequests(leaveResult.requests);
        onWorkflowConfigChange(workflowResult.workflow);
        setSelectedRequest((current) => leaveResult.requests.find((request) => request.id === current?.id) ?? leaveResult.requests[0] ?? null);
        setApiError("");
      })
      .catch((error) => {
        if (!isActive) return;
        setRemoteRequests(null);
        setApiError(error instanceof Error ? error.message : "Unable to load leave requests");
      })
      .finally(() => {
        if (isActive) setIsLoading(false);
      });

    return () => {
      isActive = false;
    };
  }, [authToken, onWorkflowConfigChange, refreshKey]);

  const sourceRequests = remoteRequests ?? requests;
  const scopedRequests = useMemo(() => getRoleScopedRequests(sourceRequests, user), [sourceRequests, user]);
  const requestedDays = calculateDays(form.startDate, form.endDate);
  const remainingLeaveAfterRequest = user.remainingLeaveDays - requestedDays;

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await saveRequest("submit");
  }

  async function saveRequest(submitMode: "draft" | "submit") {
    const validationMessage = validateRequestForm(submitMode);
    if (validationMessage) {
      setNotice(validationMessage);
      return;
    }

    if (authToken) {
      try {
        const result = await createLeaveRequest(authToken, { ...form, submitMode });
        setRemoteRequests((current) => [result.request, ...(current ?? [])]);
        setSelectedRequest(result.request);
        setNotice(submitMode === "draft" ? t.leaveDraftSaved : t.leaveCreated);
        resetForm(today);
      } catch (error) {
        setNotice(error instanceof Error ? error.message : t.leaveCreateFailed);
      }
      return;
    }

    const nextRequest: LeaveRequest = {
      id: `leave-${Date.now()}`,
      employeeId: user.id,
      employeeName: user.name,
      department: user.subtitle,
      managerId: user.role === "Manager" ? "u-admin" : "u-manager",
      type: form.type,
      startDate: form.startDate,
      endDate: form.endDate,
      days: requestedDays,
      reason: form.reason,
      attachmentName: form.attachmentName,
      attachment: form.attachment,
      status: submitMode === "draft" ? "Draft" : "Pending Manager",
      createdAt: new Date().toISOString()
    };
    onRequestsChange([nextRequest, ...requests]);
    setSelectedRequest(nextRequest);
    setNotice(submitMode === "draft" ? t.leaveDraftSaved : t.leaveCreated);
    resetForm(today);
  }

  function validateRequestForm(submitMode: "draft" | "submit") {
    if (requestedDays <= 0) return t.invalidLeaveDates;
    if (workflowConfig.attachmentRequiredForSickLeave && form.type === "Sick Leave" && !form.attachmentName) return t.attachmentRequired;
    if (submitMode === "submit" && workflowConfig.annualLeaveRequiresBalance && form.type === "Annual Leave" && requestedDays > user.remainingLeaveDays) return t.notEnoughLeaveBalance;
    if (submitMode === "submit" && hasOverlap(sourceRequests, form.startDate, form.endDate, user.id)) return t.leaveOverlap;
    return "";
  }

  async function handleSubmitDraft(request: LeaveRequest) {
    if (!canSubmitDraft(user, request)) {
      setNotice(t.noPermission);
      return;
    }

    if (authToken) {
      try {
        const result = await submitLeaveRequest(authToken, request.id);
        syncRequestResult(result);
        setNotice(t.leaveSubmitted);
      } catch (error) {
        setNotice(error instanceof Error ? error.message : t.leaveCreateFailed);
      }
      return;
    }

    if (workflowConfig.annualLeaveRequiresBalance && request.type === "Annual Leave" && request.days > user.remainingLeaveDays) {
      setNotice(t.notEnoughLeaveBalance);
      return;
    }

    if (hasOverlap(sourceRequests, request.startDate, request.endDate, request.employeeId, request.id)) {
      setNotice(t.leaveOverlap);
      return;
    }

    const nextRequest = { ...request, status: "Pending Manager" as const };
    onRequestsChange(updateRequestList(requests, nextRequest));
    setSelectedRequest(nextRequest);
    setNotice(t.leaveSubmitted);
  }

  async function handleDecision(request: LeaveRequest, decision: "approve" | "reject") {
    if (!canApprove(user, request)) {
      setNotice(t.noPermission);
      return;
    }

    if (authToken) {
      try {
        const result = await decideLeaveRequest(authToken, request.id, decision);
        syncRequestResult(result);
        setNotice(decision === "approve" ? t.leaveApproved : t.leaveRejected);
        setRefreshKey((current) => current + 1);
      } catch (error) {
        setNotice(error instanceof Error ? error.message : t.noPermission);
      }
      return;
    }

    const nextRequest = advanceLocalRequest(request, user, decision, workflowConfig);
    onRequestsChange(updateRequestList(requests, nextRequest));
    setSelectedRequest(nextRequest);
    if (nextRequest.status === "Approved") {
      onAttendanceLogsCreated(toLeaveAttendanceLogs(nextRequest));
      updateLocalBalance(nextRequest);
    }
    setNotice(decision === "approve" ? t.leaveApproved : t.leaveRejected);
  }

  async function handleCancel(request: LeaveRequest) {
    if (!canCancel(user, request, workflowConfig)) {
      setNotice(t.noPermission);
      return;
    }

    if (authToken) {
      try {
        const result = await cancelLeaveRequest(authToken, request.id);
        syncRequestResult(result);
        setNotice(t.leaveCancelled);
      } catch (error) {
        setNotice(error instanceof Error ? error.message : t.noPermission);
      }
      return;
    }

    const nextRequest = { ...request, status: "Cancelled" as const };
    onRequestsChange(updateRequestList(requests, nextRequest));
    setSelectedRequest(nextRequest);
    setNotice(t.leaveCancelled);
  }

  async function handleDownloadAttachment(request: LeaveRequest) {
    if (!request.attachment) return;

    try {
      const blob = authToken && request.attachment.url
        ? await downloadLeaveAttachment(authToken, request.attachment.url)
        : request.attachment.dataUrl
          ? dataUrlToBlob(request.attachment.dataUrl)
          : null;
      if (!blob) return;

      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = request.attachment.name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : t.noPermission);
    }
  }

  async function handleWorkflowSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedWorkflow = {
      ...draftWorkflow,
      defaultAnnualLeaveDays: Math.max(0, Number(draftWorkflow.defaultAnnualLeaveDays) || 0)
    };

    if (authToken) {
      try {
        const result = await updateLeaveWorkflow(authToken, normalizedWorkflow);
        onWorkflowConfigChange(result.workflow);
        setNotice(t.workflowSaved);
      } catch (error) {
        setNotice(error instanceof Error ? error.message : t.noPermission);
      }
      return;
    }

    onWorkflowConfigChange(normalizedWorkflow);
    setNotice(t.workflowSaved);
  }

  function syncRequestResult(result: { request: LeaveRequest; attendanceLog?: AttendanceLog; attendanceLogs?: AttendanceLog[]; employeeRemainingLeaveDays?: number }) {
    setRemoteRequests((current) => updateRequestList(current, result.request));
    setSelectedRequest(result.request);
    const createdLogs = result.attendanceLogs ?? (result.attendanceLog ? [result.attendanceLog] : []);
    if (createdLogs.length > 0) onAttendanceLogsCreated(createdLogs);
    if (typeof result.employeeRemainingLeaveDays === "number" && result.request.employeeId === user.id) {
      onUserChange({ ...user, remainingLeaveDays: result.employeeRemainingLeaveDays });
    }
  }

  function updateLocalBalance(request: LeaveRequest) {
    if (request.employeeId === user.id && workflowConfig.annualLeaveRequiresBalance && request.type === "Annual Leave") {
      onUserChange({ ...user, remainingLeaveDays: Math.max(0, user.remainingLeaveDays - request.days) });
    }
  }

  function resetForm(date: string) {
    setForm({ type: "Annual Leave", startDate: date, endDate: date, reason: "", attachmentName: "", attachment: undefined, attachmentFile: null });
  }

  async function handleAttachmentChange(file?: File) {
    if (!file) {
      setForm((current) => ({ ...current, attachmentName: "", attachment: undefined, attachmentFile: null }));
      return;
    }

    const dataUrl = await readFileAsDataUrl(file);
    setForm((current) => ({
      ...current,
      attachmentName: file.name,
      attachmentFile: file,
      attachment: {
        name: file.name,
        mimeType: file.type || "application/octet-stream",
        size: file.size,
        dataUrl,
        uploadedAt: new Date().toISOString(),
        uploadedBy: user.id
      }
    }));
  }

  return (
    <section className="leave-page page-stack">
      <div className="page-heading">
        <div>
          <h3>{t.leaveRequests}</h3>
          <p>{getScopeText(user, t)}</p>
        </div>
        <div className="leave-balance-card">
          <span>{t.remainingLeave}</span>
          <strong>{user.remainingLeaveDays}</strong>
          <small>{t.days}</small>
        </div>
      </div>

      {isLoading && <div className="attendance-toast success">{t.loadingLeaveRequests}</div>}
      {apiError && <div className="attendance-toast warning">{t.backendFallback} {apiError}</div>}
      {notice && <div className="attendance-toast success">{notice}</div>}

      <div className="leave-layout">
        <div className="leave-side-panel">
          {user.role !== "Payroll" && (
            <form className="leave-form-panel" onSubmit={handleCreate}>
              <h4>{t.createLeaveRequest}</h4>
              <label>
                {t.leaveType}
                <select value={form.type} onChange={(event) => setForm((current) => ({ ...current, type: event.target.value as LeaveType }))}>
                  {leaveTypes.map((type) => <option key={type} value={type}>{translateLeaveType(type, t)}</option>)}
                </select>
              </label>
              <div className="two-column-fields">
                <label>
                  {t.startDate}
                  <input type="date" value={form.startDate} onChange={(event) => setForm((current) => ({ ...current, startDate: event.target.value }))} />
                </label>
                <label>
                  {t.endDate}
                  <input type="date" value={form.endDate} onChange={(event) => setForm((current) => ({ ...current, endDate: event.target.value }))} />
                </label>
              </div>
              <div className="leave-balance-preview">
                <span>{t.requestedDays}: {requestedDays}</span>
                <span>{t.balanceAfter}: {Math.max(0, remainingLeaveAfterRequest)} {t.days}</span>
              </div>
              <label>
                {t.reason}
                <textarea value={form.reason} onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))} placeholder={t.reasonPlaceholder} />
              </label>
              <label>
                {t.attachment}
                <input type="file" onChange={(event) => void handleAttachmentChange(event.target.files?.[0])} />
              </label>
              <div className="leave-form-actions">
                <button className="secondary-button" type="button" onClick={() => void saveRequest("draft")}>{t.saveDraft}</button>
                <button className="primary-button" type="submit">{t.submitLeaveRequest}</button>
              </div>
            </form>
          )}

          {user.role === "Admin" && (
            <form className="leave-form-panel workflow-panel" onSubmit={handleWorkflowSubmit}>
              <h4>{t.workflowSettings}</h4>
              <label className="toggle-row">
                <input type="checkbox" checked={draftWorkflow.requireHrApproval} onChange={(event) => setDraftWorkflow((current) => ({ ...current, requireHrApproval: event.target.checked }))} />
                <span>{t.requireHrApproval}</span>
              </label>
              <label className="toggle-row">
                <input type="checkbox" checked={draftWorkflow.annualLeaveRequiresBalance} onChange={(event) => setDraftWorkflow((current) => ({ ...current, annualLeaveRequiresBalance: event.target.checked }))} />
                <span>{t.enforceLeaveBalance}</span>
              </label>
              <label className="toggle-row">
                <input type="checkbox" checked={draftWorkflow.allowEmployeeCancelBeforeManager} onChange={(event) => setDraftWorkflow((current) => ({ ...current, allowEmployeeCancelBeforeManager: event.target.checked }))} />
                <span>{t.allowCancelBeforeManager}</span>
              </label>
              <label className="toggle-row">
                <input type="checkbox" checked={draftWorkflow.attachmentRequiredForSickLeave} onChange={(event) => setDraftWorkflow((current) => ({ ...current, attachmentRequiredForSickLeave: event.target.checked }))} />
                <span>{t.requireSickAttachment}</span>
              </label>
              <label>
                {t.defaultAnnualLeaveDays}
                <input type="number" min="0" value={draftWorkflow.defaultAnnualLeaveDays} onChange={(event) => setDraftWorkflow((current) => ({ ...current, defaultAnnualLeaveDays: Number(event.target.value) }))} />
              </label>
              <button className="primary-button" type="submit">{t.saveWorkflow}</button>
            </form>
          )}
        </div>

        <section className="leave-list-panel">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t.employee}</th>
                  <th>{t.leaveType}</th>
                  <th>{t.dateRange}</th>
                  <th>{t.days}</th>
                  <th>{t.status}</th>
                </tr>
              </thead>
              <tbody>
                {scopedRequests.map((request) => (
                  <tr className={selectedRequest?.id === request.id ? "selected-row" : ""} key={request.id} onClick={() => setSelectedRequest(request)}>
                    <td data-label={t.employee}>{request.employeeName}</td>
                    <td data-label={t.leaveType}>{translateLeaveType(request.type, t)}</td>
                    <td data-label={t.dateRange}>{request.startDate} - {request.endDate}</td>
                    <td data-label={t.days}>{request.days}</td>
                    <td data-label={t.status}><span className={`badge ${leaveStatusClassName(request.status)}`}>{translateLeaveStatus(request.status, t)}</span></td>
                  </tr>
                ))}
                {scopedRequests.length === 0 && (
                  <tr>
                    <td colSpan={5}>{t.noLeaveRequests}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="detail-card leave-detail-card">
          <span>{t.leaveRequestDetail}</span>
          {selectedRequest ? (
            <>
              <h3>{selectedRequest.employeeName}</h3>
              <dl>
                <div><dt>{t.leaveType}</dt><dd>{translateLeaveType(selectedRequest.type, t)}</dd></div>
                <div><dt>{t.dateRange}</dt><dd>{selectedRequest.startDate} - {selectedRequest.endDate}</dd></div>
                <div><dt>{t.days}</dt><dd>{selectedRequest.days}</dd></div>
                <div><dt>{t.status}</dt><dd>{translateLeaveStatus(selectedRequest.status, t)}</dd></div>
                <div><dt>{t.attachment}</dt><dd>{selectedRequest.attachmentName || t.none}</dd></div>
                {selectedRequest.attachment && (
                  <div>
                    <dt>{t.downloadAttachment}</dt>
                    <dd><button className="detail-link" type="button" onClick={() => void handleDownloadAttachment(selectedRequest)}>{selectedRequest.attachment.name}</button></dd>
                  </div>
                )}
                <div><dt>{t.reason}</dt><dd>{selectedRequest.reason || t.none}</dd></div>
              </dl>
              <div className="detail-actions">
                {canSubmitDraft(user, selectedRequest) && <button type="button" onClick={() => void handleSubmitDraft(selectedRequest)}>{t.submitDraft}</button>}
                {canCancel(user, selectedRequest, workflowConfig) && <button type="button" onClick={() => void handleCancel(selectedRequest)}>{t.cancelRequest}</button>}
                {canApprove(user, selectedRequest) && (
                  <>
                    <button type="button" onClick={() => void handleDecision(selectedRequest, "approve")}>{t.approve}</button>
                    <button type="button" onClick={() => void handleDecision(selectedRequest, "reject")}>{t.reject}</button>
                  </>
                )}
              </div>
            </>
          ) : (
            <p>{t.noLeaveRequests}</p>
          )}
        </aside>
      </div>
    </section>
  );
}

function getRoleScopedRequests(requests: LeaveRequest[], user: User) {
  if (user.role === "Employee") return requests.filter((request) => request.employeeId === user.id);
  if (user.role === "Manager") return requests.filter((request) => request.managerId === user.id || request.employeeId === user.id);
  if (user.role === "Payroll") return requests.filter((request) => request.status === "Approved");
  return requests;
}

function canSubmitDraft(user: User, request: LeaveRequest) {
  return request.employeeId === user.id && request.status === "Draft";
}

function canCancel(user: User, request: LeaveRequest, workflow: LeaveWorkflowConfig) {
  if (user.role === "Admin") return request.status !== "Approved";
  if (request.employeeId !== user.id) return false;
  if (request.status === "Draft") return true;
  return workflow.allowEmployeeCancelBeforeManager && request.status === "Pending Manager";
}

function canApprove(user: User, request: LeaveRequest) {
  if (user.role === "Admin") return request.status === "Pending Manager" || request.status === "Pending HR";
  if (request.status === "Pending Manager") return user.role === "Manager" && request.managerId === user.id;
  if (request.status === "Pending HR") return user.role === "HR";
  return false;
}

function advanceLocalRequest(request: LeaveRequest, user: User, decision: "approve" | "reject", workflow: LeaveWorkflowConfig) {
  if (decision === "reject") return { ...request, status: "Rejected" as const };
  if (request.status === "Pending Manager" && user.role === "Manager" && workflow.requireHrApproval) return { ...request, status: "Pending HR" as const };
  return { ...request, status: "Approved" as const };
}

function updateRequestList(requests: LeaveRequest[] | null, updatedRequest: LeaveRequest) {
  if (!requests) return [updatedRequest];
  return requests.map((request) => (request.id === updatedRequest.id ? updatedRequest : request));
}

function calculateDays(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0;
  return Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
}

function hasOverlap(requests: LeaveRequest[], startDate: string, endDate: string, employeeId: string, ignoredRequestId?: string) {
  const start = new Date(`${startDate}T00:00:00`).getTime();
  const end = new Date(`${endDate}T00:00:00`).getTime();
  return requests.some((request) => {
    if (request.id === ignoredRequestId || request.employeeId !== employeeId || request.status === "Rejected" || request.status === "Cancelled") return false;
    const requestStart = new Date(`${request.startDate}T00:00:00`).getTime();
    const requestEnd = new Date(`${request.endDate}T00:00:00`).getTime();
    return start <= requestEnd && end >= requestStart;
  });
}

function toLeaveAttendanceLogs(request: LeaveRequest): AttendanceLog[] {
  return Array.from({ length: request.days }, (_, index) => {
    const date = new Date(`${request.startDate}T00:00:00`);
    date.setDate(date.getDate() + index);
    const workDate = date.toISOString().slice(0, 10);
    return {
      id: `leave-log-${request.id}-${index + 1}`,
      employeeId: request.employeeId,
      employeeName: request.employeeName,
      department: request.department,
      managerId: request.managerId,
      workDate,
      date: formatLogDate(date),
      checkIn: "--",
      checkOut: "--",
      totalHours: "0h 0m",
      overtime: "0h 0m",
      status: "On Leave",
      adjustmentStatus: "None",
      payrollLocked: false
    };
  });
}

function getScopeText(user: User, t: Translation) {
  if (user.role === "Employee") return t.leaveScopeEmployee;
  if (user.role === "Manager") return t.leaveScopeManager;
  if (user.role === "Payroll") return t.leaveScopePayroll;
  return t.leaveScopeCompany;
}

function leaveStatusClassName(status: LeaveRequest["status"]) {
  if (status === "Approved") return "success";
  if (status === "Rejected" || status === "Cancelled") return "danger";
  return "warning";
}

function translateLeaveType(type: LeaveType, t: Translation) {
  if (type === "Annual Leave") return t.annualLeave;
  if (type === "Sick Leave") return t.sickLeave;
  if (type === "Unpaid Leave") return t.unpaidLeave;
  return t.compensatoryLeave;
}

function translateLeaveStatus(status: LeaveRequest["status"], t: Translation) {
  if (status === "Draft") return t.draft;
  if (status === "Pending Manager") return t.pendingManager;
  if (status === "Pending HR") return t.pendingHr;
  if (status === "Approved") return t.approved;
  if (status === "Rejected") return t.rejected;
  return t.cancelled;
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function dataUrlToBlob(dataUrl: string) {
  const [meta, payload] = dataUrl.split(",");
  const mimeType = meta.match(/data:(.*?);base64/)?.[1] ?? "application/octet-stream";
  const binary = atob(payload ?? "");
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new Blob([bytes], { type: mimeType });
}
