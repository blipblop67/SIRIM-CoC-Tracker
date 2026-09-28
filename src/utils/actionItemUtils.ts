import { ActionItem, ActionItemCategory, ActionAssignee } from '../types';

/**
 * Determines whether an item is a passive "Pending Statement" (waiting on another party's reply/lab report)
 * rather than an active task required from the applicant / Cytron team.
 */
export function isPendingStatement(item?: Partial<ActionItem> | null): boolean {
  if (!item) return false;

  // 1. Explicit itemCategory takes precedence
  if (item.itemCategory === 'PENDING_STATEMENT') return true;
  if (item.itemCategory === 'ACTION_REQUIRED') return false;

  // 2. Specific waiting action types
  if (
    item.requiredActionType === 'AWAIT_SIRIM' ||
    item.requiredActionType === 'WAITING_SUPPLIER' ||
    item.requiredActionType === 'WAITING_LAB' ||
    item.requiredActionType === 'WAITING_REPLY'
  ) {
    return true;
  }

  // 3. Assignees that indicate waiting for external party
  if (item.assignedTo === 'SUPPLIER' || item.assignedTo === 'SIRIM' || item.assignedTo === 'LAB') {
    return true;
  }

  // 4. Text heuristics for titles/descriptions containing waiting statements
  const text = `${item.title || ''} ${item.description || ''}`.toLowerCase();
  const waitingKeywords = [
    'waiting for',
    'waiting on',
    'awaiting',
    'pending statement',
    'pending reply',
    'pending response',
    'pending report',
    'pending lab report',
    'waiting reply',
    'waiting report',
    'wait for supplier',
    'wait for sirim',
    'wait for lab',
    'under review by sirim',
    'pending evaluation by',
  ];

  return waitingKeywords.some((kw) => text.includes(kw));
}

/**
 * Determines whether an item is an active action required by the applicant/user.
 */
export function isActionRequired(item?: Partial<ActionItem> | null): boolean {
  return !isPendingStatement(item);
}

/**
 * Resolves the category of an action item.
 */
export function getActionCategory(item?: Partial<ActionItem> | null): ActionItemCategory {
  return isPendingStatement(item) ? 'PENDING_STATEMENT' : 'ACTION_REQUIRED';
}

/**
 * Formats user-facing badge and label information distinguishing
 * Active Actions vs Passive Pending Statements.
 */
export function getActionLabelInfo(item: Partial<ActionItem>): {
  isPendingStatement: boolean;
  category: ActionItemCategory;
  categoryLabel: string; // "Pending Statement" or "Action Required"
  categoryBadge: string;
  tagClass: string;
  bg: string;
  text: string;
  border: string;
  shortLabel: string;
  statusSentence: string;
} {
  const pending = isPendingStatement(item);

  if (pending) {
    let partyLabel = 'Other Party';
    if (item.assignedTo === 'SUPPLIER') partyLabel = 'Supplier';
    else if (item.assignedTo === 'SIRIM') partyLabel = 'SIRIM';
    else if (item.assignedTo === 'LAB') partyLabel = 'Lab';

    // Extract statement focus if possible (e.g. lab report, quotation, reply)
    const titleLower = (item.title || '').toLowerCase();
    let waitingFor = 'reply / update';
    if (titleLower.includes('lab report') || titleLower.includes('test report')) {
      waitingFor = 'lab report';
    } else if (titleLower.includes('quotation') || titleLower.includes('invoice')) {
      waitingFor = 'quotation';
    } else if (titleLower.includes('evaluation') || titleLower.includes('review')) {
      waitingFor = 'review & evaluation';
    }

    return {
      isPendingStatement: true,
      category: 'PENDING_STATEMENT',
      categoryLabel: 'Pending Statement',
      categoryBadge: `Pending Statement: Waiting on ${partyLabel}`,
      tagClass: 'bg-purple-100 text-purple-800 border-purple-200',
      bg: 'bg-purple-50/70',
      text: 'text-purple-800',
      border: 'border-purple-200',
      shortLabel: `Waiting for ${partyLabel}`,
      statusSentence: `Waiting for ${waitingFor} from ${partyLabel}`,
    };
  }

  return {
    isPendingStatement: false,
    category: 'ACTION_REQUIRED',
    categoryLabel: 'Action Required',
    categoryBadge: 'Action Required: Cytron',
    tagClass: 'bg-amber-100 text-amber-800 border-amber-300',
    bg: 'bg-amber-50/70',
    text: 'text-amber-800',
    border: 'border-amber-300',
    shortLabel: 'Action Required',
    statusSentence: 'Active action required from compliance team',
  };
}

/**
 * Separates an array of action items into active actions vs pending statements.
 */
export function separateActionItems<T extends Partial<ActionItem>>(
  items: T[] = []
): {
  activeActions: T[];
  pendingStatements: T[];
} {
  const activeActions: T[] = [];
  const pendingStatements: T[] = [];

  for (const item of items) {
    if (isPendingStatement(item)) {
      pendingStatements.push(item);
    } else {
      activeActions.push(item);
    }
  }

  return { activeActions, pendingStatements };
}
