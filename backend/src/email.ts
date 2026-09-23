import nodemailer from "nodemailer";

function smtpConfig() {
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM?.trim() || user;
  const port = Number(process.env.SMTP_PORT ?? 587);
  const secure = (process.env.SMTP_SECURE ?? "false").toLowerCase() === "true";
  if (!host || !user || !pass || !from || !Number.isInteger(port)) return null;
  return { host, port, secure, user, pass, from };
}

export function isEmailConfigured() {
  return smtpConfig() !== null;
}

export async function sendPasswordResetEmail(input: { email: string; name: string; token: string }) {
  const config = smtpConfig();
  if (!config) throw new Error("SMTP is not configured");
  const frontendUrl = (process.env.FRONTEND_URL ?? "http://localhost:5173").replace(/\/$/, "");
  const resetUrl = `${frontendUrl}/?resetToken=${encodeURIComponent(input.token)}`;
  const transporter = nodemailer.createTransport({ host: config.host, port: config.port, secure: config.secure, auth: { user: config.user, pass: config.pass }, connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 15_000 });
  const safeName = escapeHtml(input.name);
  const safeUrl = escapeHtml(resetUrl);
  await transporter.sendMail({
    from: config.from,
    to: input.email,
    subject: "Reset your Workforce Pro password",
    text: `Hello ${input.name},\n\nUse this link to reset your Workforce Pro password:\n${resetUrl}\n\nThe link expires in 30 minutes and can only be used once. If you did not request this, you can ignore this email.`,
    html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#111827"><h2>Reset your Workforce Pro password</h2><p>Hello ${safeName},</p><p>We received a request to reset your password.</p><p><a href="${safeUrl}" style="display:inline-block;padding:12px 18px;background:#294bc7;color:#fff;text-decoration:none;border-radius:6px;font-weight:700">Reset password</a></p><p>This link expires in 30 minutes and can only be used once.</p><p style="color:#64748b;font-size:13px">If you did not request this, you can ignore this email.</p></div>`
  });
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character] ?? character);
}