/**
 * Utility functions for detecting and excluding Out-of-Office (OOO),
 * auto-reply, vacation notice, and automated system emails.
 */

// Common subject markers for Out of Office and automated replies
const OOO_SUBJECT_PATTERNS = [
  /\bout\s+of\s+(?:the\s+)?office\b/i,
  /\bautomatic\s+reply\b/i,
  /\bauto(?:matic)?\s*reply\b/i,
  /\bauto\s*respond(?:er)?\b/i,
  /\bautoreply\b/i,
  /\bauto-response\b/i,
  /\bauto\s*response\b/i,
  /\bon\s+leave\b/i,
  /\bannual\s+leave\b/i,
  /\bmedical\s+leave\b/i,
  /\bmaternity\s+leave\b/i,
  /\bpaternity\s+leave\b/i,
  /\bemergency\s+leave\b/i,
  /\baway\s+from\s+(?:the\s+)?office\b/i,
  /\baway\s+from\s+(?:my\s+)?desk\b/i,
  /\bvacation\s+notice\b/i,
  /\bholiday\s+notice\b/i,
  /\bundeliverable\b/i,
  /\bdelivery\s+status\s+notification\b/i,
  /\bmail\s+delivery\s+subsystem\b/i,
  /\bfailure\s+notice\b/i,
  /^(?:re:\s*|fwd:\s*)*\[?ooo\]?/i,
  /^(?:re:\s*|fwd:\s*)*\[?out\s+of\s+office\]?/i,
  // Malaysian Bahasa Malaysia government / SIRIM officer automated responses
  /\bjawapan\s+automatik\b/i,
  /\bmaklum\s*balas\s+automatik\b/i,
  /\bdi\s+luar\s+pejabat\b/i,
  /\bberada\s+di\s+luar\s+pejabat\b/i,
  /\bcuti\s+tahunan\b/i,
];

// Common body / snippet phrases indicating out of office
const OOO_BODY_PATTERNS = [
  /i\s+(?:am|will\s+be)\s+(?:currently\s+)?out\s+of\s+(?:the\s+)?office/i,
  /i\s+(?:am|will\s+be)\s+(?:currently\s+)?away\s+from\s+(?:the\s+)?office/i,
  /i\s+(?:am|will\s+be)\s+(?:currently\s+)?away\s+from\s+(?:my\s+)?desk/i,
  /i\s+(?:am|will\s+be)\s+(?:currently\s+)?on\s+(?:annual\s+|medical\s+|maternity\s+|emergency\s+)?leave/i,
  /this\s+is\s+an\s+automated\s+response/i,
  /this\s+is\s+an?\s+auto(?:matic)?[- ]reply/i,
  /this\s+is\s+an\s+auto-generated\s+(?:email|reply|message)/i,
  /this\s+message\s+(?:was|is)\s+automatically\s+generated/i,
  /i\s+will\s+have\s+(?:limited|no)\s+access\s+to\s+(?:my\s+)?email/i,
  /i\s+have\s+(?:limited|no)\s+access\s+to\s+(?:my\s+)?email/i,
  /for\s+urgent\s+(?:matters|inquiries|queries|assistance)[^.\n]*please\s+contact/i,
  /saya\s+(?:kini\s+)?berada\s+di\s+luar\s+pejabat/i,
  /saya\s+(?:sedang|kini)\s+bercuti/i,
  /ini\s+adalah\s+(?:jawapan|maklum\s*balas)\s+automatik/i,
];

/**
 * Checks if an email subject indicates an out-of-office or automated reply.
 */
export function isOutOfOfficeSubject(subject?: string): boolean {
  if (!subject) return false;
  const s = subject.trim();
  return OOO_SUBJECT_PATTERNS.some((pattern) => pattern.test(s));
}

/**
 * Checks if email snippet or body text indicates an out-of-office or automated reply.
 */
export function isOutOfOfficeText(text?: string): boolean {
  if (!text) return false;
  const t = text.trim();
  if (t.length === 0) return false;
  return OOO_BODY_PATTERNS.some((pattern) => pattern.test(t));
}

/**
 * Evaluates whether an email message or summary is an out-of-office auto-reply.
 */
export function isOutOfOfficeMessage(msg: {
  subject?: string | null;
  snippet?: string | null;
  bodyText?: string | null;
  headers?: Array<{ name?: string | null; value?: string | null }> | any[];
}): boolean {
  if (!msg) return false;

  // Check headers for standard RFC auto-reply indicators
  if (Array.isArray(msg.headers)) {
    for (const h of msg.headers) {
      const name = (h.name || '').toLowerCase();
      const val = (h.value || '').toLowerCase();

      if (name === 'auto-submitted' && val !== 'no' && val !== '') {
        return true;
      }
      if (name === 'x-autoreply' && val === 'yes') {
        return true;
      }
      if (name === 'x-auto-response-suppress' && val.length > 0) {
        return true;
      }
      if (name === 'precedence' && (val === 'auto_reply' || val === 'bulk' || val === 'junk')) {
        // Double-check with subject or text
        if (isOutOfOfficeSubject(msg.subject) || isOutOfOfficeText(msg.snippet || msg.bodyText)) {
          return true;
        }
      }
    }
  }

  // Check subject
  if (isOutOfOfficeSubject(msg.subject)) {
    return true;
  }

  // Check snippet / body
  if (isOutOfOfficeText(msg.snippet) || isOutOfOfficeText(msg.bodyText)) {
    return true;
  }

  return false;
}

/**
 * Checks if a SirimApplication record originated from an out-of-office notification.
 */
export function isOutOfOfficeApplication(app: {
  productName?: string;
  applicationRef?: string;
  emailSubject?: string;
  notes?: string;
  emailThreads?: Array<{ subject?: string; snippet?: string; bodyText?: string }>;
}): boolean {
  if (!app) return false;

  if (isOutOfOfficeSubject(app.emailSubject)) return true;
  if (isOutOfOfficeSubject(app.productName)) return true;
  if (isOutOfOfficeSubject(app.applicationRef)) return true;
  if (isOutOfOfficeText(app.notes)) return true;

  // If application has single email thread and it's out of office
  if (Array.isArray(app.emailThreads) && app.emailThreads.length === 1) {
    const thread = app.emailThreads[0];
    if (isOutOfOfficeSubject(thread.subject) || isOutOfOfficeText(thread.snippet || thread.bodyText)) {
      return true;
    }
  }

  return false;
}

/**
 * Negative search tokens to automatically append to Gmail API queries
 * so Gmail natively excludes out-of-office and auto-replies at source.
 */
export const GMAIL_OOO_EXCLUSION_QUERY =
  '-subject:"out of office" -subject:"automatic reply" -subject:"auto reply" -subject:"auto-reply" -subject:"autoreply" -subject:"on leave" -subject:"away from office" -subject:"vacation"';

/**
 * Common sender/subject patterns for unrelated spam, marketing newsletters,
 * automated consumer receipts, recruitment, and irrelevant noise that match broad queries.
 */
const UNRELATED_EMAIL_PATTERNS = [
  /newsletter/i,
  /promotions?@/i,
  /marketing@/i,
  /no-?reply@linkedin\.com/i,
  /notifications?@github\.com/i,
  /mailer-daemon/i,
  /accounts-noreply@google\.com/i,
  /\bdigest\b/i,
  /\bweekly\s+update\b/i,
  /\bmonthly\s+statement\b/i,
  /\bflight\s+booking\b/i,
  /\bhotel\s+reservation\b/i,
  /\bboarding\s+pass\b/i,
  /\bshopee\b/i,
  /\blazada\b/i,
  /\bgrab\s*food\b/i,
  /\bfoodpanda\b/i,
  /\bairasia\b/i,
  /\bagoda\b/i,
  /\bbooking\.com\b/i,
  /\bunsubscribe\b/i,
  /\bjob\s+alert\b/i,
  /\bcareer\s+opportunity\b/i,
  /\bpassword\s+reset\b/i,
  /\bsecurity\s+alert\b/i,
];

/**
 * Positive indicators that an email thread is genuinely related to
 * SIRIM QAS, e-ComM (MCMC), CIDB, or Type Approval / Certificate of Conformity.
 */
const REGULATORY_KEYWORD_PATTERNS = [
  /@sirim\.my\b/i,
  /@mcmc\.gov\.my\b/i,
  /@cidb\.gov\.my\b/i,
  /\bsirim\b/i,
  /\be-?comm\b/i,
  /\bsqas\b/i,
  /\btype\s+approval\b/i,
  /\bcertificate\s+of\s+conformity\b/i,
  /\bconformity\s+assessment\b/i,
  /\bmodular\s+approval\b/i,
  /\bspecial\s+approval\b/i,
  /\bcidb\b/i,
  /\bmcmc\b/i,
  /\bms\s*(?:iec\s*)?[0-9]+/i,
  /\bmtsfb\b/i,
  /\bspot\s+test\b/i,
  /\btest\s+report\b/i,
  /\bbuilding\s+25\b/i,
  /\brfi\b/i,
  /\brequest\s+for\s+information\b/i,
  /\bsample\s+(?:call|request|submission|delivery)\b/i,
  /\bquotation\s+for\s+(?:testing|certification|sirim)\b/i,
  /\bprocessing\s+fee\b/i,
  /\bapplicant\b/i,
  /\bcytron\b/i,
  /\bschematics?\b/i,
  /\bpcb\s+layout\b/i,
  /\bdeclaration\s+of\s+conformity\b/i,
];

/**
 * Checks if an email is unrelated marketing, consumer noise, or spam.
 */
export function isUnrelatedEmail(item: {
  subject?: string | null;
  from?: string | null;
  to?: string | null;
  snippet?: string | null;
  bodyText?: string | null;
}): boolean {
  if (!item) return false;

  const combined = `${item.from || ''} ${item.to || ''} ${item.subject || ''} ${item.snippet || ''}`;

  // If it's OOO, it's definitely not a actionable application
  if (isOutOfOfficeSubject(item.subject || '') || isOutOfOfficeText(item.snippet || item.bodyText || '')) {
    return true;
  }

  // If sent from official SIRIM or MCMC domain, it is NEVER considered unrelated spam
  if (/@sirim\.my/i.test(item.from || '') || /@mcmc\.gov\.my/i.test(item.from || '')) {
    return false;
  }

  // Check known spam/marketing patterns
  const isSpamSender = UNRELATED_EMAIL_PATTERNS.some((p) => p.test(combined));
  if (isSpamSender) {
    // If it mentions genuine SIRIM application reference (e.g. SQAS/CMCS), spare it
    if (/SQAS\/|e-?ComM\/|CIDB\//i.test(combined)) {
      return false;
    }
    return true;
  }

  return false;
}

/**
 * Evaluates whether an email thread is genuinely related to SIRIM / e-ComM / CoC.
 * Returns an object with relevance status, confidence, and detection flags.
 */
export function isSirimRegulatoryThread(thread: {
  subject?: string | null;
  from?: string | null;
  to?: string | null;
  snippet?: string | null;
  bodyText?: string | null;
}): {
  isRelated: boolean;
  confidence: number;
  isOfficialSirimDomain: boolean;
  matchedKeywords: string[];
} {
  if (!thread) {
    return { isRelated: false, confidence: 0, isOfficialSirimDomain: false, matchedKeywords: [] };
  }

  const subject = (thread.subject || '').trim();
  const from = (thread.from || '').trim();
  const to = (thread.to || '').trim();
  const snippet = (thread.snippet || thread.bodyText || '').trim();
  const fullText = `${from} ${to} ${subject} ${snippet}`;

  // 1. Check out of office
  if (isOutOfOfficeSubject(subject) || isOutOfOfficeText(snippet)) {
    return { isRelated: false, confidence: 0, isOfficialSirimDomain: false, matchedKeywords: ['out-of-office'] };
  }

  // 2. Official SIRIM or MCMC email address
  const isOfficialSirimDomain = /@sirim\.my\b/i.test(from) || /@sirim\.my\b/i.test(to) ||
                                /@mcmc\.gov\.my\b/i.test(from) || /@mcmc\.gov\.my\b/i.test(to);

  if (isOfficialSirimDomain) {
    return { isRelated: true, confidence: 1.0, isOfficialSirimDomain: true, matchedKeywords: ['sirim-domain'] };
  }

  // 3. Check for specific application reference format (e.g. SQAS/CMCS/..., eComM/...)
  const hasOfficialRef = /(?:SQAS\/[A-Z0-9\/_-]+|e-?ComM\/[A-Z0-9\/_-]+|CIDB\/[A-Z0-9\/_-]+|COA\/[A-Z0-9\/_-]+)/i.test(fullText);
  if (hasOfficialRef) {
    return { isRelated: true, confidence: 0.98, isOfficialSirimDomain: false, matchedKeywords: ['official-ref'] };
  }

  // 4. Check regulatory keywords in subject and body
  const matchedKeywords: string[] = [];
  for (const pattern of REGULATORY_KEYWORD_PATTERNS) {
    if (pattern.test(fullText)) {
      matchedKeywords.push(pattern.source);
    }
  }

  // Subject match is strong
  const hasSubjectKeyword = /\bsirim\b|\be-?comm\b|\bsqas\b|\btype\s+approval\b|\bcertificate\s+of\s+conformity\b|\bcidb\b|\bmodular\s+approval\b|\bspecial\s+approval\b/i.test(subject);

  if (hasSubjectKeyword) {
    return { isRelated: true, confidence: 0.92, isOfficialSirimDomain: false, matchedKeywords };
  }

  // Check if unrelated email
  if (isUnrelatedEmail(thread)) {
    return { isRelated: false, confidence: 0.1, isOfficialSirimDomain: false, matchedKeywords: [] };
  }

  // If at least 2 distinct regulatory keywords matched in body
  if (matchedKeywords.length >= 2) {
    return { isRelated: true, confidence: 0.8, isOfficialSirimDomain: false, matchedKeywords };
  }

  // Weak match or single generic keyword in body
  if (matchedKeywords.length === 1 && /\bsirim\b|\becomm\b|\bsqas\b/i.test(snippet)) {
    return { isRelated: true, confidence: 0.65, isOfficialSirimDomain: false, matchedKeywords };
  }

  return { isRelated: false, confidence: 0.2, isOfficialSirimDomain: false, matchedKeywords: [] };
}

