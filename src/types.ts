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

export type ActionAssignee = 'APPLICANT' | 'SIRIM' | 'LAB' | 'SUPPLIER';

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
  senderRole?: 'SIRIM' | 'APPLICANT' | 'SUPPLIER' | 'LAB' | 'OTHER';
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
  senderRole?: 'SIRIM' | 'APPLICANT' | 'SUPPLIER' | 'LAB' | 'OTHER';
}

export type DocumentChecklistStatus =
  | 'NOT_STARTED'
  | 'REQUESTED_FROM_SUPPLIER'
  | 'RECEIVED_FROM_SUPPLIER'
  | 'SUBMITTED_TO_SIRIM'
  | 'APPROVED_BY_SIRIM'
  | 'REJECTED';

export interface DocumentChecklistItem {
  id: string;
  name: string;
  category: 'TECHNICAL' | 'LEGAL_ADMIN' | 'TEST_REPORT' | 'LABELING';
  description: string;
  requiredForSchemes: CertificationScheme[];
  status: DocumentChecklistStatus;
  fileNotes?: string;
  updatedAt?: string;
}

export interface DocumentPreScreenIssue {
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  issue: string;
  malaysianStandardRef: string;
  recommendation: string;
}

export interface DocumentPreScreenResult {
  documentName: string;
  documentType: string;
  overallVerdict: 'COMPLIANT' | 'RISK_OF_REJECTION' | 'INSUFFICIENT_DATA';
  score: number;
  summary: string;
  issues: DocumentPreScreenIssue[];
  passedChecks: string[];
  detectedStandards: string[];
  detectedLabAccreditation?: string;
  detectedFrequencies?: string[];
  detectedPowerOutput?: string;
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
  supplierName?: string;
  supplierEmail?: string;
  supplierStatus?: 'NOT_INVOLVED' | 'WAITING_FOR_SUPPLIER_DOCS' | 'DOCUMENTS_RECEIVED_FROM_SUPPLIER' | 'DOCUMENTS_SUBMITTED_TO_SIRIM';
  supplierLastContactDate?: string;
  supplierChaserDueDate?: string;
  supplierChaserCount?: number;
  documentChecklist?: DocumentChecklistItem[];
  submissionDate: string;
  lastActivityDate: string;
  targetDeadline?: string;
  certificateNo?: string;
  certificateExpiryDate?: string;
  processingFeeRm?: number;
  paymentStatus?: 'NOT_APPLICABLE' | 'UNPAID' | 'PAID';
  standards?: string[];
  courierTracking?: string;
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

export type ScanDurationPreset = '1y' | '6m' | '3m' | '1m' | 'custom';

export interface ScanFilter {
  query: string;
  maxResults: number;
  includeRead: boolean;
  daysBack: number;
  preset?: ScanDurationPreset;
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
  timelineEvent?: Omit<TimelineEvent, 'id'>;
  timelineEvents?: Omit<TimelineEvent, 'id'>[];
  detectedStandards?: string[];
  sirimJobNo?: string;
  quotationOrInvoiceNo?: string;
  courierTracking?: string;
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
  // Scan Duration Policies
  hasCompletedFirstScan?: boolean;
  firstScanCompletedAt?: string;
  firstScanDurationDays?: number; // default 365 days (1 whole year)
  routineScanDurationDays?: number; // default 30 days (1 month)
  scanScopeMode?: 'auto' | 'first_time_1y' | 'routine_1m' | 'custom';
}

