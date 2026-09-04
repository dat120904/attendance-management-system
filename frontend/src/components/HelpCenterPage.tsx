import { FormEvent, useEffect, useMemo, useState } from "react";
import { createSupportTicket, fetchHelpArticles } from "../api";
import type { HelpArticle, SupportTicket, User } from "../types";
import type { Translation } from "../i18n";

type HelpCenterPageProps = {
  articles: HelpArticle[];
  authToken: string | null;
  onTicketCreated: (ticket: SupportTicket) => void;
  t: Translation;
  user: User;
};

export function HelpCenterPage({ articles, authToken, onTicketCreated, t, user }: HelpCenterPageProps) {
  const [query, setQuery] = useState("");
  const [remoteArticles, setRemoteArticles] = useState<HelpArticle[] | null>(null);
  const [form, setForm] = useState({ subject: "", message: "" });
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!authToken) {
      setRemoteArticles(null);
      return;
    }
    let active = true;
    fetchHelpArticles(authToken, query)
      .then(({ articles }) => {
        if (!active) return;
        setRemoteArticles(articles);
        setError("");
      })
      .catch((err) => {
        if (!active) return;
        setRemoteArticles(null);
        setError(err instanceof Error ? err.message : t.backendFallback);
      });
    return () => {
      active = false;
    };
  }, [authToken, query, user.id]);

  const visibleArticles = useMemo(() => {
    const source = remoteArticles ?? articles.filter((article) => article.allowedRoles.includes(user.role));
    const normalized = query.trim().toLowerCase();
    if (!normalized || remoteArticles) return source;
    return source.filter((article) => [article.title, article.body, article.category].some((value) => value.toLowerCase().includes(normalized)));
  }, [articles, query, remoteArticles, user.role]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.subject.trim() || !form.message.trim()) {
      setError(t.requiredFields);
      return;
    }
    const fallbackTicket: SupportTicket = { id: `ticket-${Date.now()}`, requesterId: user.id, requesterName: user.name, subject: form.subject.trim(), message: form.message.trim(), status: "Open", createdAt: new Date().toISOString() };
    try {
      const ticket = authToken ? (await createSupportTicket(authToken, form)).ticket : fallbackTicket;
      onTicketCreated(ticket);
      setForm({ subject: "", message: "" });
      setNotice(t.supportRequestSent);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : t.registerFailed);
    }
  }

  return (
    <section className="help-page page-stack">
      <div className="page-heading">
        <div>
          <h3>{t.helpCenter}</h3>
          <p>{t.helpCenterScope}</p>
        </div>
      </div>
      {notice && <div className="attendance-toast success">{notice}</div>}
      {error && <div className="attendance-toast warning">{error}</div>}
      <div className="help-layout">
        <section className="help-articles-panel detail-card">
          <label className="field help-search">{t.search}<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t.helpSearchPlaceholder} /></label>
          <h3>{t.helpArticles}</h3>
          <div className="help-article-list">
            {visibleArticles.length === 0 && <p>{t.noHelpArticles}</p>}
            {visibleArticles.map((article) => <article className="help-article-card" key={article.id}><span>{categoryLabel(article.category, t)}</span><h4>{translateArticleTitle(article, t)}</h4><p>{translateArticleBody(article, t)}</p></article>)}
          </div>
        </section>
        <aside className="support-panel detail-card">
          <h3>{t.supportRequest}</h3>
          <form className="support-form" onSubmit={handleSubmit}>
            <label className="field">{t.supportSubject}<input value={form.subject} onChange={(event) => setForm((current) => ({ ...current, subject: event.target.value }))} /></label>
            <label className="field">{t.supportMessage}<textarea rows={7} value={form.message} onChange={(event) => setForm((current) => ({ ...current, message: event.target.value }))} /></label>
            <button className="primary-button" type="submit">{t.sendSupportRequest}</button>
          </form>
        </aside>
      </div>
    </section>
  );
}

function categoryLabel(category: HelpArticle["category"], t: Translation) {
  if (category === "faq") return t.faq;
  if (category === "check-in") return t.checkInGuide;
  if (category === "leave") return t.leaveGuide;
  if (category === "adjustment") return t.adjustmentGuide;
  return t.payrollGuide;
}

function translateArticleTitle(article: HelpArticle, t: Translation) {
  if (article.id === "help-faq") return t.faq;
  if (article.id === "help-checkin") return t.checkInGuide;
  if (article.id === "help-leave") return t.leaveGuide;
  if (article.id === "help-adjustment") return t.adjustmentGuide;
  if (article.id === "help-payroll") return t.payrollGuide;
  return article.title;
}

function translateArticleBody(article: HelpArticle, t: Translation) {
  if (article.id === "help-faq") return t.pageComingSoon.replace("Trang này", t.helpCenter).replace("This page", t.helpCenter);
  if (article.id === "help-checkin") return `${t.dashboard}: ${t.readyToStart}. ${t.checkIn} / ${t.checkOut}.`;
  if (article.id === "help-leave") return `${t.leaveRequests}: ${t.createLeaveRequest}, ${t.attachment}, ${t.submitLeaveRequest}.`;
  if (article.id === "help-adjustment") return `${t.attendanceLogs}: ${t.requestAdjustment}. ${t.lockedLogMessage}`;
  if (article.id === "help-payroll") return `${t.payrollSummaries}: ${t.recalculatePayroll}, ${t.confirmPayroll}, ${t.lockPayroll}.`;
  return article.body;
}
