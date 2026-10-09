/**
 * Pure helpers for the autonomous SIRIM agent: dates, status wording, Gmail search query,
 * Google Sheet rows and the daily Telegram briefing. No I/O here, so it can be tested directly.
 */
import { isPendingStatement, normalizeActionItem } from "./src/utils/actionItemUtils";
import { cleanApplicationRef } from "./src/utils/reference";

const MYT = "Asia/Kuala_Lumpur";

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

/**
 * Converts an email "Date:" header ("Tue, 6 Oct 2026 10:15:00 +0800"), an ISO string or a
 * YYYY-MM-DD string into a YYYY-MM-DD date in Malaysia time. Returns "" if it can't be read.
 * (The old code did `date.split("T")[0]`, which cut "Tue"/"Thu" headers at the letter T.)
 */
export function toMytDate(value?: string | null): string {
  if (!value) return "";
  const v = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: MYT, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export function todayMyt(now: Date = new Date()): string {
  return toMytDate(now.toISOString());
}

export function daysBetween(fromYmd?: string, to: Date = new Date()): number | null {
  if (!fromYmd) return null;
  const from = new Date(`${fromYmd}T00:00:00+08:00`).getTime();
  const today = new Date(`${todayMyt(to)}T00:00:00+08:00`).getTime();
  if (Number.isNaN(from)) return null;
  return Math.round((today - from) / 86400000);
}

// ---------------------------------------------------------------------------
// Status wording (what people read in the Sheet and Telegram)
// "RFI" is deliberately not used: SIRIM's own emails say "RFI", and the briefing must not be confused with them.
// ---------------------------------------------------------------------------

export const STATUS_LABELS: Record<string, string> = {
  SUBMITTED: "Submitted",
  UNDER_REVIEW: "Under Review",
  SAMPLE_REQUESTED: "Sample Requested",
  SAMPLE_SUBMITTED: "Sample Sent",
  TESTING_IN_PROGRESS: "Testing in Progress",
  RFI_ACTION_REQUIRED: "Action Pending",
  PAYMENT_PENDING: "Payment Pending",
  FINAL_EVALUATION: "Final Evaluation",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  EXPIRED: "Expired",
};

export function statusLabel(status?: string | null): string {
  if (!status) return "Unknown";
  return STATUS_LABELS[status] || status.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}

const PARTY_LABELS: Record<string, string> = { SIRIM: "SIRIM / agent", SUPPLIER: "Supplier", LAB: "Lab" };

export interface OpenItems {
  cytron: any[]; // things Cytron has to do
  waiting: any[]; // things Cytron is waiting on (SIRIM / agent, supplier, lab)
}

export function splitOpenItems(app: any): OpenItems {
  const open = (app?.actionItems || []).filter((a: any) => a && !a.isCompleted).map((a: any) => normalizeActionItem(a));
  return {
    cytron: open.filter((a: any) => !isPendingStatement(a)),
    waiting: open.filter((a: any) => isPendingStatement(a)),
  };
}

export function waitingOnLabel(item: any): string {
  return PARTY_LABELS[item?.assignedTo] || "Other party";
}

const PRIORITY_RANK: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

export function highestPriority(items: any[]): string {
  return items.map((a) => a.priority || "LOW").sort((a, b) => (PRIORITY_RANK[a] ?? 9) - (PRIORITY_RANK[b] ?? 9))[0] || "";
}

const CLOSED_STATUSES = new Set(["APPROVED", "REJECTED", "EXPIRED"]);
export function isClosedStatus(status?: string): boolean {
  return CLOSED_STATUSES.has(status || "");
}

// ---------------------------------------------------------------------------
// Gmail search
// ---------------------------------------------------------------------------

/** People / domains that count as the SIRIM side even though they aren't @sirim.my (e.g. the registration agent). */
export function parseTrustedSenders(raw?: string | string[] | null): string[] {
  const list = Array.isArray(raw) ? raw : String(raw || "").split(/[,\s;]+/);
  return Array.from(new Set(list.map((s) => s.trim().toLowerCase().replace(/^@/, "")).filter((s) => s.includes(".") || s.includes("@"))));
}

export const OOO_EXCLUSION =
  '-subject:"out of office" -subject:"automatic reply" -subject:"auto reply" -subject:"auto-reply" -subject:"autoreply" -subject:"on leave" -subject:"away from office" -subject:"vacation"';

/**
 * Gmail query that finds SIRIM CoC threads. `after` is a unix timestamp (seconds); `newerThanDays` is used when it is absent.
 */
export function buildScanQuery(opts: { after?: number; newerThanDays?: number; trustedSenders?: string[] }): string {
  const terms = [
    "from:sirim.my",
    "to:sirim.my",
    "cc:sirim.my",
    "from:mcmc.gov.my",
    "subject:sirim",
    "subject:sqas",
    "subject:ecomm",
    'subject:"e-comm"',
    "subject:coc",
    'subject:"type approval"',
    'subject:"certificate of conformity"',
    'subject:"special approval"',
    'subject:"modular approval"',
    '"SIRIM QAS"',
    '"certificate of conformity"',
  ];
  for (const s of opts.trustedSenders || []) {
    terms.push(`from:${s}`, `to:${s}`, `cc:${s}`);
  }
  const window = opts.after ? `after:${Math.floor(opts.after)}` : `newer_than:${Math.max(1, Math.floor(opts.newerThanDays || 30))}d`;
  return `(${terms.join(" OR ")}) ${window} ${OOO_EXCLUSION}`;
}

/** True if any participant of the thread is an official SIRIM/MCMC address or a configured trusted sender. */
export function hasTrustedParticipant(participants: string[], trustedSenders: string[] = []): boolean {
  const text = participants.join(" ").toLowerCase();
  if (/@sirim\.my\b|@mcmc\.gov\.my\b/.test(text)) return true;
  return trustedSenders.some((s) => (s.includes("@") ? text.includes(s) : new RegExp(`@([a-z0-9-]+\\.)*${s.replace(/\./g, "\\.")}\\b`).test(text)));
}

// ---------------------------------------------------------------------------
// Matching threads to applications
// ---------------------------------------------------------------------------

/** True when this isn't a real SIRIM reference (empty, generated, placeholder or a name). */
export function isGeneratedRef(ref?: string | null): boolean {
  return !cleanApplicationRef(ref);
}

export function normalizeModel(model?: string | null): string {
  const m = String(model || "").trim().toUpperCase().replace(/\s+/g, "");
  if (!m || m === "CYT-NEW-01" || m === "N/A" || m.length < 4) return "";
  return m;
}

export function appThreadIds(app: any): string[] {
  const ids = new Set<string>();
  if (Array.isArray(app?.threadIds)) app.threadIds.forEach((t: string) => t && ids.add(t));
  if (app?.threadId) ids.add(app.threadId);
  return Array.from(ids);
}

/** Before AI parsing: by Gmail thread id, then by a real application reference in the subject. */
export function findAppByThread(apps: any[], threadId: string, subject: string): number {
  let idx = apps.findIndex((a) => appThreadIds(a).includes(threadId));
  if (idx >= 0) return idx;
  const subj = (subject || "").toLowerCase();
  idx = apps.findIndex((a) => !isGeneratedRef(a.applicationRef) && subj.includes(String(a.applicationRef).toLowerCase()));
  return idx;
}

/**
 * After AI parsing: the same application can arrive in a separate thread (agent thread, supplier thread…).
 * Match on the real application reference, or on the exact model number of an application that is still open.
 */
export function findAppByParsedDetails(apps: any[], parsed: any): number {
  const ref = String(parsed?.applicationRef || "").trim().toLowerCase();
  if (ref && !isGeneratedRef(parsed.applicationRef)) {
    const idx = apps.findIndex((a) => !isGeneratedRef(a.applicationRef) && String(a.applicationRef).trim().toLowerCase() === ref);
    if (idx >= 0) return idx;
  }
  const model = normalizeModel(parsed?.modelNumber);
  if (model) {
    const matches = apps
      .map((a, i) => ({ a, i }))
      .filter(({ a }) => !isClosedStatus(a.status) && normalizeModel(a.modelNumber) === model);
    if (matches.length === 1) return matches[0].i;
  }
  return -1;
}

// ---------------------------------------------------------------------------
// Google Sheet
// ---------------------------------------------------------------------------

export const SHEET_HEADERS = [
  "Application Ref No",
  "Product Name",
  "Model Number",
  "Brand",
  "Certification Scheme",
  "Status",
  "Cytron To Do",
  "Waiting On",
  "Priority",
  "Latest Update",
  "Last Activity",
  "Days Since Activity",
  "Submission Date",
  "Target Deadline",
  "SIRIM Officer / Agent",
  "Officer Email",
  "Gmail Thread",
  "Certificate No",
  "Certificate Expiry",
  "Fee (RM)",
  "Payment Status",
  "Last Synced (MYT)",
];

const STATUS_SORT: Record<string, number> = {
  RFI_ACTION_REQUIRED: 0,
  SAMPLE_REQUESTED: 1,
  PAYMENT_PENDING: 2,
  UNDER_REVIEW: 3,
  SUBMITTED: 4,
  SAMPLE_SUBMITTED: 5,
  TESTING_IN_PROGRESS: 6,
  FINAL_EVALUATION: 7,
  APPROVED: 8,
  REJECTED: 9,
  EXPIRED: 10,
};

/** Orders applications for people: Cytron's to-dos first, then by status, then most recent activity. */
export function sortForReport(apps: any[]): any[] {
  return [...apps].sort((a, b) => {
    const aTodo = splitOpenItems(a).cytron.length > 0 ? 0 : 1;
    const bTodo = splitOpenItems(b).cytron.length > 0 ? 0 : 1;
    if (aTodo !== bTodo) return aTodo - bTodo;
    const s = (STATUS_SORT[a.status] ?? 99) - (STATUS_SORT[b.status] ?? 99);
    if (s !== 0) return s;
    return String(b.lastActivityDate || "").localeCompare(String(a.lastActivityDate || ""));
  });
}

export function gmailLinkFor(app: any): string {
  if (app?.gmailThreadLink && String(app.gmailThreadLink).startsWith("http")) return app.gmailThreadLink;
  const t = appThreadIds(app).find((id) => !id.startsWith("th_manual") && !id.startsWith("th_sirim"));
  if (t) return `https://mail.google.com/mail/u/0/#all/${t}`;
  const q = app?.applicationRef || app?.modelNumber || app?.emailSubject || "SIRIM";
  return `https://mail.google.com/mail/u/0/#search/${encodeURIComponent(q)}`;
}

export function buildSheetRows(apps: any[], now: Date = new Date()): any[][] {
  const synced = new Intl.DateTimeFormat("en-GB", {
    timeZone: MYT, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(now);
  const rows: any[][] = [SHEET_HEADERS];
  for (const app of sortForReport(apps)) {
    const { cytron, waiting } = splitOpenItems(app);
    const days = daysBetween(app.lastActivityDate, now);
    rows.push([
      isGeneratedRef(app.applicationRef) ? "" : app.applicationRef || "",
      app.productName || "",
      app.modelNumber === "CYT-NEW-01" ? "" : app.modelNumber || "",
      app.brand || "",
      app.scheme || "",
      statusLabel(app.status),
      cytron.map((a: any) => `• ${a.title}${a.dueDate ? ` (due ${a.dueDate})` : ""}`).join("\n") || "—",
      waiting.map((a: any) => `• ${waitingOnLabel(a)}: ${a.title}`).join("\n") || "—",
      highestPriority([...cytron, ...waiting]),
      app.latestUpdateSummary || app.notes || "",
      app.lastActivityDate || "",
      days === null ? "" : days,
      app.submissionDate || "",
      app.targetDeadline || "",
      app.officerName || "",
      app.officerEmail || "",
      gmailLinkFor(app),
      app.certificateNo || "",
      app.certificateExpiryDate || "",
      app.processingFeeRm ? Number(app.processingFeeRm) : "",
      app.paymentStatus && app.paymentStatus !== "NOT_APPLICABLE" ? app.paymentStatus : "",
      synced,
    ]);
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Telegram
// ---------------------------------------------------------------------------

export function escapeHtml(str: any): string {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function clip(text: string, max = 140): string {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function appHeading(app: any): string {
  const ref = isGeneratedRef(app.applicationRef) ? "" : `[${escapeHtml(app.applicationRef)}] `;
  const model = app.modelNumber && app.modelNumber !== "CYT-NEW-01" ? ` (<code>${escapeHtml(app.modelNumber)}</code>)` : "";
  return `${ref}<b>${escapeHtml(app.productName || "Application")}</b>${model}`;
}

export interface BriefingOptions {
  title?: string;
  sheetUrl?: string;
  /** Applications changed since this time are listed under "Updates since last briefing". */
  since?: string;
  /** Problem with today's Gmail check, shown at the top so nobody trusts stale figures. */
  scanWarning?: string;
  /** e.g. "First-time scan in progress: 40 of 120 email threads read." */
  scanProgressNote?: string;
  maxPerSection?: number;
  now?: Date;
}

/**
 * Daily briefing. Sections: overview counts → what changed since the last briefing → what Cytron must do →
 * what Cytron is waiting on → items the agent closed from emails since the last briefing.
 */
export function formatDailyBriefing(apps: any[], opts: BriefingOptions = {}): string {
  const now = opts.now || new Date();
  const max = opts.maxPerSection ?? 8;
  const since = opts.since ? new Date(opts.since).getTime() : 0;
  const dateStr = now.toLocaleDateString("en-GB", { timeZone: MYT, day: "2-digit", month: "short", year: "numeric" });
  const timeStr = now.toLocaleTimeString("en-GB", { timeZone: MYT, hour: "2-digit", minute: "2-digit" });

  const open = apps.filter((a) => !isClosedStatus(a.status));
  const withTodo = sortForReport(open.filter((a) => splitOpenItems(a).cytron.length > 0));
  // Longest wait first, so the team knows whom to chase.
  const waitingOnly = open
    .filter((a) => splitOpenItems(a).cytron.length === 0 && splitOpenItems(a).waiting.length > 0)
    .sort((a, b) => String(a.lastActivityDate || "").localeCompare(String(b.lastActivityDate || "")));
  const count = (s: string) => apps.filter((a) => a.status === s).length;
  const waitingParty = (party: string) =>
    open.filter((a) => splitOpenItems(a).cytron.length === 0 && splitOpenItems(a).waiting.some((w: any) => w.assignedTo === party)).length;

  let msg = `🌅 <b>${escapeHtml(opts.title || "SIRIM CoC Daily Briefing")}</b>\n`;
  msg += `📅 ${dateStr}, ${timeStr} (MYT)\n\n`;

  if (opts.scanWarning) msg += `⚠️ <b>${escapeHtml(opts.scanWarning)}</b>\n\n`;
  if (opts.scanProgressNote) msg += `⏳ <i>${escapeHtml(opts.scanProgressNote)}</i>\n\n`;

  msg += `📊 <b>Overview</b> (${apps.length} applications)\n`;
  msg += `• 🔴 Action pending (Cytron): <b>${withTodo.length}</b>\n`;
  msg += `• ⏳ Waiting on SIRIM / agent: <b>${waitingParty("SIRIM")}</b>\n`;
  const supplierLab = waitingParty("SUPPLIER") + waitingParty("LAB");
  if (supplierLab) msg += `• ⏳ Waiting on supplier / lab: <b>${supplierLab}</b>\n`;
  if (count("SAMPLE_REQUESTED")) msg += `• 📦 Sample requested: <b>${count("SAMPLE_REQUESTED")}</b>\n`;
  if (count("PAYMENT_PENDING")) msg += `• 💳 Payment pending: <b>${count("PAYMENT_PENDING")}</b>\n`;
  if (count("TESTING_IN_PROGRESS")) msg += `• 🔬 Testing in progress: <b>${count("TESTING_IN_PROGRESS")}</b>\n`;
  msg += `• ✅ Approved: <b>${count("APPROVED")}</b>\n\n`;

  // What changed since the last briefing: status changes first, then new applications, then other new emails.
  // Applications added by the first-time scan are summarised in one line instead of listed one by one.
  if (since) {
    const after = (v?: string) => Boolean(v) && new Date(v as string).getTime() > since;
    const touched = apps.filter((a) => after(a.agentUpdatedAt));
    const statusChanges = touched.filter((a) => a.previousStatus && after(a.statusChangedAt));
    const fromFirstScan = touched.filter((a) => a.createdInFirstScan && after(a.agentCreatedAt) && !statusChanges.includes(a));
    const newApps = touched.filter((a) => after(a.agentCreatedAt) && !a.createdInFirstScan && !statusChanges.includes(a));
    const otherEmails = touched.filter((a) => !statusChanges.includes(a) && !fromFirstScan.includes(a) && !newApps.includes(a));
    const listed = [...statusChanges, ...newApps, ...otherEmails];

    msg += `🆕 <b>Updates since last briefing</b> (${listed.length})\n`;
    if (fromFirstScan.length) msg += `• First-time inbox scan added <b>${fromFirstScan.length}</b> applications (all in the Google Sheet).\n`;
    if (listed.length === 0 && !fromFirstScan.length) msg += `No new emails on any application.\n`;
    listed.slice(0, max).forEach((a, i) => {
      let what = `New email · now ${escapeHtml(statusLabel(a.status))}`;
      if (statusChanges.includes(a)) what = `${escapeHtml(statusLabel(a.previousStatus))} → <b>${escapeHtml(statusLabel(a.status))}</b>`;
      else if (newApps.includes(a)) what = `New application · ${escapeHtml(statusLabel(a.status))}`;
      msg += `${i + 1}. ${appHeading(a)}\n   ${what}\n`;
      if (a.latestUpdateSummary) msg += `   ↳ <i>${escapeHtml(clip(a.latestUpdateSummary))}</i>\n`;
    });
    if (listed.length > max) msg += `…and ${listed.length - max} more in the Google Sheet\n`;
    msg += `\n`;
  }

  // Cytron to do
  msg += `🔴 <b>Action pending (Cytron)</b> (${withTodo.length})\n`;
  if (withTodo.length === 0) msg += `Nothing for Cytron to do right now.\n`;
  withTodo.slice(0, max).forEach((a, i) => {
    const { cytron } = splitOpenItems(a);
    msg += `${i + 1}. ${appHeading(a)}\n`;
    cytron.slice(0, 3).forEach((t: any) => {
      msg += `   • ${escapeHtml(clip(t.title, 110))}${t.dueDate ? ` <i>(due ${escapeHtml(t.dueDate)})</i>` : ""}\n`;
    });
    if (cytron.length > 3) msg += `   • …and ${cytron.length - 3} more\n`;
    msg += `   <a href="${gmailLinkFor(a)}">✉️ Open email</a>\n`;
  });
  if (withTodo.length > max) msg += `…and ${withTodo.length - max} more in the Google Sheet\n`;
  msg += `\n`;

  // Waiting on others
  msg += `⏳ <b>Waiting on others</b> (${waitingOnly.length})\n`;
  if (waitingOnly.length === 0) msg += `Nothing outstanding.\n`;
  waitingOnly.slice(0, max).forEach((a, i) => {
    const w = splitOpenItems(a).waiting[0];
    const days = daysBetween(a.lastActivityDate, now);
    const age = days !== null && days >= 0 ? ` · last email ${days === 0 ? "today" : `${days}d ago`}` : "";
    msg += `${i + 1}. ${appHeading(a)}\n   ${escapeHtml(waitingOnLabel(w))}: ${escapeHtml(clip(w.title, 110))}${age}\n`;
  });
  if (waitingOnly.length > max) msg += `…and ${waitingOnly.length - max} more in the Google Sheet\n`;
  msg += `\n`;

  // Closed automatically since last briefing
  if (since) {
    const closed = apps.flatMap((a) =>
      (a.actionItems || [])
        .filter((t: any) => t.isCompleted && t.autoResolvedByAi && new Date(t.autoResolvedAt || 0).getTime() > since)
        .map((t: any) => ({ a, t }))
    );
    if (closed.length) {
      msg += `✅ <b>Closed automatically from emails</b> (${closed.length})\n`;
      closed.slice(0, max).forEach(({ a, t }, i) => {
        msg += `${i + 1}. ${appHeading(a)}: ${escapeHtml(clip(t.title, 100))}\n`;
      });
      if (closed.length > max) msg += `…and ${closed.length - max} more\n`;
      msg += `\n`;
    }
  }

  if (opts.sheetUrl) msg += `📈 <a href="${opts.sheetUrl}">Open the Google Sheet</a>\n`;
  return msg.trim();
}

/** Single-application alert (instant notification). */
export function formatAppAlert(app: any): string {
  const { cytron, waiting } = splitOpenItems(app);
  const next = cytron[0] || waiting[0];
  let msg = `🚨 <b>SIRIM CoC – Action Pending</b>\n\n${appHeading(app)}\n`;
  msg += `Status: <b>${escapeHtml(statusLabel(app.status))}</b>\n`;
  if (app.officerName) msg += `SIRIM officer / agent: ${escapeHtml(app.officerName)}\n`;
  if (app.targetDeadline) msg += `Target deadline: <b>${escapeHtml(app.targetDeadline)}</b>\n`;
  if (next) {
    const label = cytron[0] ? "Cytron to do" : `Waiting on ${waitingOnLabel(next)}`;
    msg += `\n<b>${escapeHtml(label)}:</b> ${escapeHtml(next.title)}\n`;
  } else if (app.latestUpdateSummary || app.notes) {
    msg += `\n${escapeHtml(clip(app.latestUpdateSummary || app.notes, 300))}\n`;
  }
  msg += `\n<a href="${gmailLinkFor(app)}">✉️ Open email</a>`;
  return msg;
}

/** Telegram rejects messages over 4096 characters; split on line breaks. */
export function splitTelegramMessage(text: string, limit = 3900): string[] {
  if (text.length <= limit) return [text];
  const parts: string[] = [];
  let current = "";
  for (const line of text.split("\n")) {
    if ((current + "\n" + line).length > limit && current) {
      parts.push(current);
      current = line;
    } else {
      current = current ? `${current}\n${line}` : line;
    }
  }
  if (current) parts.push(current);
  return parts;
}
