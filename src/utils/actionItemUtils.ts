import { ActionItem, ActionItemCategory, ActionAssignee, ActionItemType } from '../types';

const WAITING_TYPES: ReadonlySet<string> = new Set(['AWAIT_SIRIM', 'WAITING_SUPPLIER', 'WAITING_LAB', 'WAITING_REPLY']);
const EXTERNAL_PARTIES: ReadonlySet<string> = new Set(['SIRIM', 'SUPPLIER', 'LAB']);

// Titles that unambiguously describe waiting on someone else, regardless of what category was stored.
const WAITING_TITLE_PREFIXES = ['waiting for', 'waiting on', 'awaiting', 'pending reply', 'pending response', 'pending confirmation', 'pending sirim', 'pending supplier', 'pending lab'];

// Looser phrases, only consulted when nothing explicit (type / assignee / category) decides it.
const WAITING_KEYWORDS = [
  'waiting for',
  'waiting on',
  'awaiting',
  'pending statement',
  'pending reply',
  'pending response',
  'pending confirmation',
  'pending report',
  'pending lab report',
  'waiting reply',
  'waiting report',
  'wait for supplier',
  'wait for sirim',
  'wait for lab',
  'wait for agent',
  'under review by sirim',
  'pending evaluation by',
  'sirim to confirm',
  'agent to confirm',
  'supplier to confirm',
  'lab to confirm',
];

export function isWaitingActionType(type?: string | null): boolean {
  return !!type && WAITING_TYPES.has(type);
}

export function isExternalParty(assignee?: string | null): boolean {
  return !!assignee && EXTERNAL_PARTIES.has(assignee);
}

function partyForWaitingType(type?: string | null, fallback: ActionAssignee = 'SIRIM'): ActionAssignee {
  if (type === 'WAITING_SUPPLIER') return 'SUPPLIER';
  if (type === 'WAITING_LAB') return 'LAB';
  if (type === 'AWAIT_SIRIM') return 'SIRIM';
  return fallback;
}

export function waitingTypeForParty(party?: string | null): ActionItemType {
  if (party === 'SUPPLIER') return 'WAITING_SUPPLIER';
  if (party === 'LAB') return 'WAITING_LAB';
  return 'AWAIT_SIRIM';
}

/**
 * Determines whether an item is a passive "Pending Statement" (waiting on another party's reply/lab report)
 * rather than an active task required from the applicant / Cytron team.
 *
 * Precedence (strongest first). Contradictory data (e.g. category ACTION_REQUIRED but type WAITING_REPLY,
 * or assigned to SIRIM) always resolves to "waiting", because something Cytron is waiting on can never be
 * a Cytron action.
 *  1. A waiting action type (AWAIT_SIRIM / WAITING_*)
 *  2. Assigned to an external party (SIRIM / SUPPLIER / LAB)
 *  3. A title that starts with "Waiting for…", "Awaiting…", "Pending reply…"
 *  4. The stored itemCategory
 *  5. Keyword heuristics on title + description
 */
export function isPendingStatement(item?: Partial<ActionItem> | null): boolean {
  if (!item) return false;

  if (isWaitingActionType(item.requiredActionType)) return true;
  if (isExternalParty(item.assignedTo)) return true;

  const title = (item.title || '').trim().toLowerCase();
  if (WAITING_TITLE_PREFIXES.some((p) => title.startsWith(p))) return true;

  if (item.itemCategory === 'PENDING_STATEMENT') return true;
  if (item.itemCategory === 'ACTION_REQUIRED') return false;

  const text = `${title} ${item.description || ''}`.toLowerCase();
  return WAITING_KEYWORDS.some((kw) => text.includes(kw));
}

/**
 * Returns a copy of the item whose itemCategory, assignedTo and requiredActionType all agree with each other.
 * Use this on every action item coming from the AI, the heuristic parser, manual entry or storage.
 */
export function normalizeActionItem<T extends Partial<ActionItem>>(item: T): T {
  if (!item) return item;
  if (isPendingStatement(item)) {
    const assignedTo: ActionAssignee = isExternalParty(item.assignedTo)
      ? (item.assignedTo as ActionAssignee)
      : partyForWaitingType(item.requiredActionType);
    const requiredActionType: ActionItemType = isWaitingActionType(item.requiredActionType)
      ? (item.requiredActionType as ActionItemType)
      : waitingTypeForParty(assignedTo);
    return { ...item, itemCategory: 'PENDING_STATEMENT', assignedTo, requiredActionType };
  }
  return {
    ...item,
    itemCategory: 'ACTION_REQUIRED',
    assignedTo: 'APPLICANT',
    requiredActionType: item.requiredActionType || 'PROVIDE_CLARIFICATION',
  };
}

/** Re-labels an item as "waiting on <party>" (e.g. a question Cytron sent that SIRIM / the agent must answer). */
export function toPendingStatement<T extends Partial<ActionItem>>(item: T, party: 'SIRIM' | 'SUPPLIER' | 'LAB'): T {
  return {
    ...item,
    itemCategory: 'PENDING_STATEMENT',
    assignedTo: party,
    requiredActionType: item.requiredActionType === 'WAITING_REPLY' ? 'WAITING_REPLY' : waitingTypeForParty(party),
  };
}

/** Re-labels a waiting item as an active Cytron action. */
export function toActionRequired<T extends Partial<ActionItem>>(item: T): T {
  return {
    ...item,
    itemCategory: 'ACTION_REQUIRED',
    assignedTo: 'APPLICANT',
    requiredActionType: isWaitingActionType(item.requiredActionType) ? 'PROVIDE_CLARIFICATION' : item.requiredActionType,
  };
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
    item = normalizeActionItem(item);
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
    } else if (titleLower.includes('confirm')) {
      waitingFor = 'confirmation';
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
