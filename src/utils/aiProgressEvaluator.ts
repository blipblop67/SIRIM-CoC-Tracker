import { ActionItem, DocumentChecklistItem, SirimStatus, TimelineEvent } from '../types';

export interface ProgressEvaluationResult {
  hasProgress: boolean;
  statusChanged: boolean;
  previousStatus?: SirimStatus;
  newStatus?: SirimStatus;
  resolvedActions: {
    actionId: string;
    title: string;
    reason: string;
  }[];
  newActions: ActionItem[];
  updatedChecklistItems: {
    checklistId: string;
    name: string;
    newStatus: string;
    reason: string;
  }[];
  progressSummary: string;
}

/**
 * Evaluates whether an existing action item has been fulfilled / progressed by recent email activity.
 * E.g.:
 * - If Cytron sent technical documents or schematics, the action "Submit technical documentation" is fulfilled.
 * - If test samples were dispatched with courier tracking, the action "Deliver test samples" is fulfilled.
 * - If payment receipt / invoice settlement email was sent, the action "Settle invoice" is fulfilled.
 * - If supplier emailed the lab report / test data, the pending statement "Waiting for lab report from supplier" is fulfilled.
 * - If SIRIM officer replied with evaluation feedback or approved, the statement "Waiting for reply from SIRIM" is fulfilled.
 * - If status is now APPROVED, all pending pre-approval tasks are completed.
 */
export function evaluateActionProgress(
  existingAction: ActionItem,
  newStatus: SirimStatus,
  latestEmailContext: {
    subject?: string;
    snippet?: string;
    sender?: string;
    senderRole?: string;
    hasAttachments?: boolean;
    attachmentNames?: string[];
    courierTracking?: string;
    supplierStatus?: string;
  }
): { isResolved: boolean; reason: string } {
  // If already completed, nothing to resolve
  if (existingAction.isCompleted) {
    return { isResolved: true, reason: existingAction.autoResolvedReason || 'Already completed' };
  }

  const actType = existingAction.requiredActionType;
  const actTitle = (existingAction.title || '').toLowerCase();
  const actDesc = (existingAction.description || '').toLowerCase();
  const textCombined = `${actTitle} ${actDesc}`;
  const emailSnippet = `${latestEmailContext.subject || ''} ${latestEmailContext.snippet || ''}`.toLowerCase();
  const attNames = (latestEmailContext.attachmentNames || []).map((n) => n.toLowerCase());
  const senderRole = latestEmailContext.senderRole;

  // 1. Overall Approval automatically resolves all submission, payment, and testing actions
  if (newStatus === 'APPROVED') {
    return {
      isResolved: true,
      reason: 'Auto-resolved: Application granted Certificate of Conformity (Approved by SIRIM QAS).',
    };
  }

  // 2. Sample submission progress
  if (
    actType === 'SEND_SAMPLE' ||
    textCombined.includes('sample') ||
    textCombined.includes('deliver') ||
    textCombined.includes('hardware test unit')
  ) {
    if (newStatus === 'SAMPLE_SUBMITTED' || newStatus === 'TESTING_IN_PROGRESS' || newStatus === 'FINAL_EVALUATION') {
      return {
        isResolved: true,
        reason: 'Auto-resolved: Test samples received by SIRIM QAS lab / Courier tracking registered.',
      };
    }
    if (latestEmailContext.courierTracking) {
      return {
        isResolved: true,
        reason: `Auto-resolved: Courier dispatch verified (Tracking No: ${latestEmailContext.courierTracking}).`,
      };
    }
  }

  // 3. Fee payment progress
  if (
    actType === 'PAY_FEE' ||
    textCombined.includes('payment') ||
    textCombined.includes('invoice') ||
    textCombined.includes('receipt') ||
    textCombined.includes('processing fee')
  ) {
    if (
      emailSnippet.includes('payment received') ||
      emailSnippet.includes('receipt issued') ||
      emailSnippet.includes('resit rasmi') ||
      emailSnippet.includes('payment confirmed') ||
      (newStatus !== 'PAYMENT_PENDING' && newStatus !== 'REJECTED')
    ) {
      return {
        isResolved: true,
        reason: 'Auto-resolved: Payment acknowledged or receipt issued by e-ComM / SIRIM Finance.',
      };
    }
  }

  // 4. Supplier technical document waiting statement
  if (
    actType === 'WAITING_SUPPLIER' ||
    existingAction.assignedTo === 'SUPPLIER' ||
    textCombined.includes('waiting for lab report') ||
    textCombined.includes('waiting for supplier')
  ) {
    if (
      latestEmailContext.supplierStatus === 'DOCUMENTS_RECEIVED_FROM_SUPPLIER' ||
      latestEmailContext.supplierStatus === 'DOCUMENTS_SUBMITTED_TO_SIRIM' ||
      senderRole === 'SUPPLIER' ||
      attNames.some((n) => n.includes('report') || n.includes('schematic') || n.includes('test') || n.includes('.pdf'))
    ) {
      return {
        isResolved: true,
        reason: 'Auto-resolved: Supplier provided requested technical documents & test reports.',
      };
    }
  }

  // 5. Waiting for SIRIM review statement
  if (
    actType === 'AWAIT_SIRIM' ||
    existingAction.assignedTo === 'SIRIM' ||
    textCombined.includes('waiting for reply') ||
    textCombined.includes('waiting for review')
  ) {
    if (senderRole === 'SIRIM' || senderRole === 'SIRIM_OFFICER' || newStatus === 'RFI_ACTION_REQUIRED' || newStatus === 'SAMPLE_REQUESTED') {
      return {
        isResolved: true,
        reason: 'Auto-resolved: SIRIM officer replied with evaluation update or subsequent milestone.',
      };
    }
  }

  // 6. Submitting documentation to SIRIM
  if (
    actType === 'SUBMIT_DOC' ||
    actType === 'PROVIDE_CLARIFICATION' ||
    textCombined.includes('submit') ||
    textCombined.includes('clarification') ||
    textCombined.includes('schematic') ||
    textCombined.includes('report')
  ) {
    if (newStatus === 'UNDER_REVIEW' || newStatus === 'FINAL_EVALUATION') {
      return {
        isResolved: true,
        reason: 'Auto-resolved: Clarifications and technical documents submitted; application advanced to Under Review.',
      };
    }
  }

  return { isResolved: false, reason: '' };
}
