export type SirimStatus =
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'SAMPLE_REQUESTED'
  | 'SAMPLE_SUBMITTED'
  | 'TESTING_IN_PROGRESS'
  | 'RFI_ACTION_REQUIRED'
  | 'PAYMENT_PENDING'
  | 'FINAL_EVALUATION'
  | 'APPROVED'
  | 'REJECTED'
  | 'EXPIRED';

export type CertificationScheme =
  | 'Type Approval (MCMC/SIRIM)'
  | 'Special Approval'
  | 'Modular Approval'
  | 'CIDB Certification'
  | 'Safety & EMC (MS Standards)';

export type ActionItemPriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export type ActionItemType =
  | 'SUBMIT_DOC'
  | 'PAY_FEE'
  | 'SEND_SAMPLE'
  | 'PROVIDE_CLARIFICATION'
  | 'AWAIT_SIRIM'
  | 'RENEW_CERTIFICATE';

export type ActionAssignee = 'APPLICANT' | 'SIRIM' | 'LAB';

export interface ActionItem {
  id: string;
  title: string;
  description: string;
  assignedTo: ActionAssignee;
  dueDate?: string;
  isCompleted: boolean;
  priority: ActionItemPriority;
  requiredActionType: ActionItemType;
  completedAt?: string;
  emailSourceSnippet?: string;
}

export interface TimelineEvent {
  id: string;
  date: string;
  title: string;
  description: string;
  sender: string;
  emailSubject?: string;
  emailSnippet?: string;
  type: 'status_change' | 'rfi' | 'document' | 'payment' | 'approval' | 'sample';
}

export interface EmailMessage {
  id: string;
  messageId: string;
  from: string;
  to: string;
  date: string;
  subject: string;
  snippet: string;
  bodyText?: string;
  hasAttachments?: boolean;
  attachmentNames?: string[];
}

export interface SirimApplication {
  id: string;
  threadId: string;
  applicationRef: string; // e.g. "SQAS/CMCS/2026/0418" or "eComM-2026-0819"
  productName: string;
  modelNumber: string;
  brand: string;
  applicant: string;
  scheme: CertificationScheme;
  status: SirimStatus;
  officerName?: string;
  officerEmail?: string;
  submissionDate: string;
  lastActivityDate: string;
  targetDeadline?: string;
  certificateNo?: string;
  certificateExpiryDate?: string;
  processingFeeRm?: number;
  paymentStatus?: 'NOT_APPLICABLE' | 'UNPAID' | 'PAID';
  actionItems: ActionItem[];
  timeline: TimelineEvent[];
  emailThreads: EmailMessage[];
  syncedToSheet: boolean;
  emailSubject?: string;
  gmailThreadLink?: string;
  lastSyncedAt?: string;
  sheetRowIndex?: number;
  notes?: string;
}

export interface SheetSyncConfig {
  spreadsheetId: string;
  spreadsheetUrl: string;
  sheetName: string;
  autoSync: boolean;
  lastSynced?: string;
  columnsCount?: number;
  rowsCount?: number;
}

export interface ScanFilter {
  query: string;
  maxResults: number;
  includeRead: boolean;
  daysBack: number;
}

export interface UserAuthSession {
  accessToken: string;
  tokenType: string;
  expiresAt: number;
  email?: string;
  name?: string;
  picture?: string;
  isAuthenticated: boolean;
}

export interface NotificationAlert {
  id: string;
  applicationId: string;
  applicationRef: string;
  productName: string;
  title: string;
  message: string;
  priority: ActionItemPriority;
  dueDate?: string;
  isRead: boolean;
  createdAt: string;
  actionItemId?: string;
}

export interface ParsedEmailResult {
  isSirimRelated: boolean;
  confidence: number;
  applicationRef: string;
  productName: string;
  modelNumber: string;
  brand: string;
  applicant: string;
  scheme: CertificationScheme;
  status: SirimStatus;
  officerName?: string;
  officerEmail?: string;
  submissionDate?: string;
  lastActivityDate?: string;
  targetDeadline?: string;
  certificateNo?: string;
  certificateExpiryDate?: string;
  processingFeeRm?: number;
  paymentStatus?: 'NOT_APPLICABLE' | 'UNPAID' | 'PAID';
  summary: string;
  actionItems: Omit<ActionItem, 'id' | 'isCompleted'>[];
  timelineEvent: Omit<TimelineEvent, 'id'>;
}

export interface TelegramConfig {
  botToken: string;
  chatId: string;
  topicId?: string;
  enabled: boolean;
  dailyDigest: boolean;
  instantAlertOnCritical: boolean;
  lastSentAt?: string;
}

export interface AutomationLogEntry {
  id: string;
  timestamp: string;
  type: 'SCAN' | 'PARSE' | 'SHEET_SYNC' | 'TELEGRAM' | 'SYSTEM';
  status: 'SUCCESS' | 'WARNING' | 'ERROR' | 'INFO';
  message: string;
  details?: string;
}

export interface AutomationConfig {
  enabled: boolean;
  scheduleTime: string; // e.g. "08:30" (AM)
  timezone: string; // e.g. "Asia/Kuala_Lumpur (MYT UTC+8)"
  intervalHours: number; // 24 = daily morning
  autoScanGmail: boolean;
  autoSyncGoogleSheet: boolean;
  autoSendTelegram: boolean;
  alertOnCriticalOnly: boolean;
  telegram: TelegramConfig;
  lastRunAt?: string;
  lastRunStatus?: 'SUCCESS' | 'WARNING' | 'ERROR' | 'IDLE';
  lastRunSummary?: string;
  logs: AutomationLogEntry[];
}

