import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { attendanceLogs, users } from "./data.js";
import { getUserByToken, login, logout, publicUser } from "./auth.js";

const port = Number(process.env.PORT ?? 4000);

const server = createServer(async (request, response) => {
  setCorsHeaders(response);

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  try {
    if (request.method === "POST" && request.url === "/api/auth/login") {
      const body = await readJsonBody<{ email?: string; password?: string }>(request);
      const result = login(body.email ?? "", body.password ?? "");

      if ("error" in result) {
        sendJson(response, result.status ?? 401, { error: result.error });
        return;
      }

      sendJson(response, 200, result);
      return;
    }

    if (request.method === "POST" && request.url === "/api/auth/logout") {
      const token = getBearerToken(request);
      if (token) logout(token);
      sendJson(response, 200, { ok: true });
      return;
    }

    if (request.method === "POST" && request.url === "/api/auth/forgot-password") {
      sendJson(response, 200, { ok: true, message: "Reset link generated for demo flow." });
      return;
    }

    if (request.method === "POST" && request.url === "/api/auth/reset-password") {
      sendJson(response, 200, { ok: true });
      return;
    }

    if (request.method === "GET" && request.url === "/api/me") {
      const user = requireUser(request, response);
      if (!user) return;
      sendJson(response, 200, { user });
      return;
    }

    if (request.method === "GET" && request.url === "/api/dashboard") {
      const user = requireUser(request, response);
      if (!user) return;

      const logs = user.role === "Employee" ? attendanceLogs.filter((log) => log.employeeId === user.id) : attendanceLogs;

      sendJson(response, 200, {
        greeting: "Good morning",
        summaryDate: "Thursday, October 26th",
        checkedInAt: "08:30 AM",
        sessionSeconds: 13515,
        weeklyHours: 32.5,
        weeklyTarget: 40,
        remainingLeaveDays: user.remainingLeaveDays,
        nextHoliday: {
          name: "Thanksgiving",
          dateRange: "Nov 23 - Nov 24"
        },
        logs,
        managerAlerts: canViewTeamDashboard(user.role) ? ["3 late arrivals this week", "1 missing check-out needs review"] : [],
        payrollReadiness: user.role === "Payroll" || user.role === "Admin" ? "92% ready" : null
      });
      return;
    }

    if (request.method === "GET" && request.url === "/api/users") {
      const user = requireUser(request, response);
      if (!user) return;

      if (user.role !== "Admin" && user.role !== "HR") {
        sendJson(response, 403, { error: "Forbidden" });
        return;
      }

      sendJson(response, 200, { users: users.map(publicUser) });
      return;
    }

    sendJson(response, 404, { error: "Not found" });
  } catch (error) {
    sendJson(response, 500, { error: error instanceof Error ? error.message : "Unknown error" });
  }
});

server.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${port} is already in use. Stop the old backend process or run with another PORT.`);
    console.error(`Windows check: netstat -ano | findstr :${port}`);
    console.error("Windows stop: taskkill /PID <PID> /F");
    process.exit(1);
  }

  throw error;
});

server.listen(port, () => {
  console.log(`Workforce Pro API listening on http://localhost:${port}`);
});

function canViewTeamDashboard(role: string) {
  return role === "Manager" || role === "HR" || role === "Admin";
}

function requireUser(request: IncomingMessage, response: ServerResponse) {
  const token = getBearerToken(request);
  const user = token ? getUserByToken(token) : null;

  if (!user) {
    sendJson(response, 401, { error: "Unauthorized" });
    return null;
  }

  return user;
}

function getBearerToken(request: IncomingMessage) {
  const authorization = request.headers.authorization;
  if (!authorization?.startsWith("Bearer ")) return null;
  return authorization.slice("Bearer ".length);
}

function setCorsHeaders(response: ServerResponse) {
  response.setHeader("Access-Control-Allow-Origin", "http://localhost:5173");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
}

function sendJson(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

function readJsonBody<T>(request: IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    let raw = "";

    request.on("data", (chunk) => {
      raw += chunk;
    });

    request.on("end", () => {
      if (!raw) {
        resolve({} as T);
        return;
      }

      try {
        resolve(JSON.parse(raw) as T);
      } catch (error) {
        reject(error);
      }
    });
  });
}
