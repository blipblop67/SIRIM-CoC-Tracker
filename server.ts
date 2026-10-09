import express, { Request, Response } from "express";
import path from "path";
import fs from "fs";
import { GoogleGenAI, Type } from "@google/genai";
import { google } from "googleapis";
import dotenv from "dotenv";
import {
  isOutOfOfficeSubject,
  isOutOfOfficeText,
  isOutOfOfficeMessage,
  isOutOfOfficeApplication,
  isUnrelatedEmail,
  isSirimRegulatoryThread,
  GMAIL_OOO_EXCLUSION_QUERY,
} from "./src/utils/outOfOffice";
import { normalizeActionItem } from "./src/utils/actionItemUtils";
import { requireApiAuth, getAccessTokenEmail } from "./server-auth";

// Secrets never leave the server. The UI gets this placeholder instead of the real Telegram bot token
// and sends it back unchanged when the token was not edited.
const BOT_TOKEN_MASK = "__saved_on_server__";
function isMaskedOrEmpty(token?: string | null): boolean {
  return !token || !String(token).trim() || String(token).trim() === BOT_TOKEN_MASK;
}

// Shared prompt rules: WHO has the ball decides whether an item is a Cytron action or a waiting statement.
const ACTION_DIRECTION_RULES = `CRITICAL - WHO HAS THE BALL (DIRECTION OF THE LATEST QUESTION / REQUEST):
Before creating any action item, work out who sent the latest message and who is expected to respond next.
Cytron people include anyone @cytron.io (e.g. Rupa). The SIRIM side includes SIRIM QAS / e-ComM / MCMC officers AND any SIRIM agent / consultant / registration agent acting for the application.
- If CYTRON sent the latest message asking a question, asking for confirmation, advice or a decision (e.g. "Can we apply under one model?", "Please confirm whether…", "Is X acceptable?"), or submitted documents, then Cytron is WAITING. This is a PENDING_STATEMENT, NOT an action for Cytron:
    * itemCategory 'PENDING_STATEMENT', assignedTo 'SIRIM' (officer or agent) / 'SUPPLIER' / 'LAB' = whoever must answer
    * requiredActionType 'AWAIT_SIRIM' (or 'WAITING_REPLY' for a general question, 'WAITING_SUPPLIER', 'WAITING_LAB')
    * Title starts with "Waiting for…", e.g. "Waiting for SIRIM agent to confirm if UC100-915M and UC100-915M-EA can be registered under one Type Approval"
- Only when SIRIM / the agent / supplier / lab asked CYTRON to do, provide, answer or decide something (and Cytron has not yet done it) is it an ACTION_REQUIRED item (assignedTo 'APPLICANT').
- Never create an ACTION_REQUIRED item whose content is Cytron's own question. Quoting Cytron's own question in 'emailSourceSnippet' means Cytron is waiting.
- Never mix: ACTION_REQUIRED always has assignedTo 'APPLICANT' and an active type (SUBMIT_DOC, PAY_FEE, SEND_SAMPLE, PROVIDE_CLARIFICATION, RENEW_CERTIFICATE). PENDING_STATEMENT always has assignedTo SIRIM/SUPPLIER/LAB and a waiting type (AWAIT_SIRIM, WAITING_SUPPLIER, WAITING_LAB, WAITING_REPLY).
- If the other party has since answered a question Cytron was waiting on, list the old waiting item in 'resolvedRequirements' and create any new item based on their answer.`;

/** Normalizes AI / heuristic action items so category, assignee and type never contradict each other. */
function normalizeParsedActionItems(data: any): any {
  if (data && Array.isArray(data.actionItems)) {
    data.actionItems = data.actionItems.map((a: any) => normalizeActionItem(a));
  }
  return data;
}

// Statuses that can only be reached after the processing fee has been settled.
const POST_PAYMENT_STATUSES = new Set(["TESTING_IN_PROGRESS", "FINAL_EVALUATION", "APPROVED"]);

dotenv.config();

// Lazy initialization for Gemini API
function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is not configured");
  }
  return new GoogleGenAI({ apiKey });
}

// Robust Gemini call with automatic retry and model failover
async function generateContentWithRetryAndFallback(
  ai: GoogleGenAI,
  primaryModel: string,
  contents: any,
  config?: any,
  fallbackModel: string = "gemini-3.1-flash-lite"
) {
  const modelsToTry = [primaryModel, fallbackModel];
  let lastError: any = null;

  for (const model of modelsToTry) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents,
          config,
        });
        return response;
      } catch (err: any) {
        lastError = err;
        const errMsg = String(err?.message || err);
        const isTransient =
          errMsg.includes("503") ||
          errMsg.includes("429") ||
          errMsg.includes("UNAVAILABLE") ||
          errMsg.includes("high demand") ||
          errMsg.includes("ResourceExhausted") ||
          errMsg.includes("overloaded");

        console.warn(`[Gemini API] Attempt ${attempt} with ${model} encountered: ${errMsg}`);

        if (isTransient && attempt < 2) {
          const delayMs = attempt * 800 + Math.floor(Math.random() * 300);
          await new Promise((r) => setTimeout(r, delayMs));
        } else {
          break; // Try fallback model
        }
      }
    }
  }

  throw lastError;
}

// ----------------------------------------------------
// Recursive MIME Body Extractor for Gmail Messages
// Handles nested multipart/mixed, multipart/alternative, and HTML text stripping
// ----------------------------------------------------
function extractEmailBodyText(payload: any): string {
  if (!payload) return "";

  function decodeBase64Url(dataStr: string): string {
    try {
      const normalized = dataStr.replace(/-/g, "+").replace(/_/g, "/");
      return Buffer.from(normalized, "base64").toString("utf-8");
    } catch {
      return "";
    }
  }

  function stripHtml(html: string): string {
    return html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<br\s*[\/]?>/gi, "\n")
      .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/[ \t]+/g, " ")
      .replace(/\n\s*\n+/g, "\n\n")
      .trim();
  }

  let plainText = "";
  let htmlText = "";

  function traverseParts(parts: any[]) {
    if (!Array.isArray(parts)) return;
    for (const part of parts) {
      if (part.mimeType === "text/plain" && part.body?.data) {
        plainText += decodeBase64Url(part.body.data) + "\n";
      } else if (part.mimeType === "text/html" && part.body?.data) {
        htmlText += decodeBase64Url(part.body.data) + "\n";
      }
      if (part.parts && Array.isArray(part.parts)) {
        traverseParts(part.parts);
      }
    }
  }

  if (payload.parts && Array.isArray(payload.parts)) {
    traverseParts(payload.parts);
  } else if (payload.body?.data) {
    if (payload.mimeType === "text/html") {
      htmlText = decodeBase64Url(payload.body.data);
    } else {
      plainText = decodeBase64Url(payload.body.data);
    }
  }

  if (plainText.trim().length > 0) {
    return plainText.trim();
  }
  if (htmlText.trim().length > 0) {
    return stripHtml(htmlText);
  }
  return "";
}

function extractAttachments(payload: any): { hasAttachments: boolean; attachmentNames: string[] } {
  const attachmentNames: string[] = [];
  function traverse(parts: any[]) {
    if (!Array.isArray(parts)) return;
    for (const p of parts) {
      if (p.filename && p.filename.trim().length > 0) {
        attachmentNames.push(p.filename.trim());
      }
      if (p.parts && Array.isArray(p.parts)) {
        traverse(p.parts);
      }
    }
  }
  if (payload?.parts) {
    traverse(payload.parts);
  }
  return {
    hasAttachments: attachmentNames.length > 0,
    attachmentNames,
  };
}

// Heuristic fallback parser for SIRIM emails when model experiences temporary high demand
function fallbackHeuristicSirimParser(emailSubject: string, emailBody: string, sender: string, date: string) {
  if (isOutOfOfficeSubject(emailSubject) || isOutOfOfficeText(emailBody)) {
    return {
      isSirimRelated: false,
      isOutOfOffice: true,
      confidence: 0.99,
      applicationRef: "",
      productName: "Out of Office Notification",
      modelNumber: "",
      brand: "",
      applicant: "",
      scheme: "Type Approval (MCMC/SIRIM)",
      status: "UNDER_REVIEW",
      statusExplanation: "Out-of-office / automated reply notification excluded.",
      actionItems: [],
      timelineEvents: [],
      emailThreads: [],
    };
  }

  const rawChunks = (emailBody || "")
    .split(/(?==== MESSAGE \d+|\[Message \d+|\[[^\]]+ \([^\)]+\)\]:|\n---\n)/gi)
    .map((c) => c.trim())
    .filter((c) => c.length > 0);

  // Message 1 is the MAIN THREAD / original application message
  const firstChunk = rawChunks.length > 0 ? rawChunks[0] : emailBody;
  // Message N is the LATEST UPDATE in the thread
  const latestChunk = rawChunks.length > 0 ? rawChunks[rawChunks.length - 1] : emailBody;

  // Extract clean main thread subject (stripping "Re:", "Fwd:", etc.)
  const firstSubjectMatch = firstChunk.match(/SUBJECT:\s*([^\r\n]+)/i);
  const mainSubject = firstSubjectMatch ? firstSubjectMatch[1].trim() : emailSubject;
  const cleanSubject = (mainSubject || emailSubject || "")
    .replace(/^(?:re|fwd|urgent|update|fw):\s*/gi, "")
    .replace(/^(?:re|fwd|urgent|update|fw):\s*/gi, "")
    .trim();

  const fullText = `${cleanSubject}\n${emailSubject || ""}\n${emailBody || ""}`;

  // Extract Application Ref - check firstChunk (Main Thread) first, then fullText
  const refMatch =
    firstChunk.match(/(SQAS\/[A-Z0-9\/_-]+|e-?ComM\/[A-Z0-9\/_-]+|CIDB\/[A-Z0-9\/_-]+|COA\/[A-Z0-9\/_-]+|SIRIM\/[A-Z0-9\/_-]+|[A-Z]{3,4}\/[A-Z0-9\/_-]{4,})/i) ||
    fullText.match(/(SQAS\/[A-Z0-9\/_-]+|e-?ComM\/[A-Z0-9\/_-]+|CIDB\/[A-Z0-9\/_-]+|COA\/[A-Z0-9\/_-]+|SIRIM\/[A-Z0-9\/_-]+|[A-Z]{3,4}\/[A-Z0-9\/_-]{4,})/i);
  const applicationRef = refMatch ? refMatch[0].trim() : `SQAS/GEN/${Date.now().toString().slice(-4)}`;

  // Extract Model Number - check firstChunk (Main Thread) first, then fullText
  const modelMatch =
    firstChunk.match(/(?:Model(?:\s*No\.?|\s*Number)?|M\/N)[:\s]+([A-Za-z0-9-_/]+)/i) ||
    firstChunk.match(/\((CYT-[A-Za-z0-9-_]+|[A-Z0-9]{3,}-[A-Z0-9-_]+)\)/i) ||
    fullText.match(/(?:Model(?:\s*No\.?|\s*Number)?|M\/N)[:\s]+([A-Za-z0-9-_/]+)/i) ||
    fullText.match(/\((CYT-[A-Za-z0-9-_]+|[A-Z0-9]{3,}-[A-Z0-9-_]+)\)/i);
  const modelNumber = modelMatch ? modelMatch[1].trim() : "CYT-GEN-01";

  // Product Name - check firstChunk explicit fields or clean main thread subject
  const explicitProductMatch = firstChunk.match(/(?:Product(?:\s*Name)?|Equipment(?:\s*Name)?|Device(?:\s*Name)?)[:\s]+([^\r\n,;]{3,60})/i);
  let productName = explicitProductMatch ? explicitProductMatch[1].trim() : "";
  if (!productName || productName.length < 3) {
    productName = cleanSubject.length > 5 ? cleanSubject : `SIRIM Product (${modelNumber})`;
  }

  // Officer name
  const officerMatch = fullText.match(/(?:Officer|Regards|From|Auditor|Evaluator)[:,\s]+([A-Za-z\s]+(?:Ahmad|Zulkifli|Subramaniam|Othman|Ibrahim|Nurul|Farhan|Kavitha|Zainab|Faiz|Mohd|Bin|Binti)[A-Za-z\s]*)/i);
  const officerName = officerMatch ? officerMatch[1].trim().slice(0, 40) : undefined;

  // Extract Standards (e.g., MCMC MTSFB TC T007, MS IEC 62368-1, etc.)
  const standardsMatches = fullText.match(/(?:MS\s*(?:IEC\s*)?[A-Z0-9-]+(?::[0-9]{4})?|MCMC\s*MTSFB\s*[A-Z0-9\s-]+|CISPR\s*[0-9]+|ETSI\s*EN\s*[0-9\s-]+)/gi);
  const detectedStandards = standardsMatches ? Array.from(new Set(standardsMatches.map(s => s.trim()))) : [];

  // Extract Courier / Tracking info
  const courierMatch = fullText.match(/(?:tracking(?:\s*no\.?|\s*number)?|consignment(?:\s*no\.?)?|courier(?:\s*ref)?|gdex|pos\s*laju|dhl)[:\s]+([A-Za-z0-9-_]{6,25})/i);
  const courierTracking = courierMatch ? courierMatch[1].trim() : undefined;

  // Extract Quotation or Invoice No
  const quoteMatch = fullText.match(/(?:quotation(?:\s*no\.?)?|inv(?:oice)?(?:\s*no\.?)?|receipt(?:\s*no\.?)?)[:\s]+([A-Za-z0-9-_/]{5,25})/i);
  const quotationOrInvoiceNo = quoteMatch ? quoteMatch[1].trim() : undefined;

  // Extract Fee
  const feeMatch = fullText.match(/(?:RM|MYR)\s*([0-9,]+(?:\.[0-9]{2})?)/i);
  const processingFeeRm = feeMatch ? parseFloat(feeMatch[1].replace(/,/g, "")) : undefined;

  // Extract Certificate No & Expiry
  const certMatch = fullText.match(/(?:certificate(?:\s*no\.?|\s*number)?|coc(?:\s*no\.?)?)[:\s]+([A-Za-z0-9-_/]{6,30})/i);
  const certificateNo = certMatch ? certMatch[1].trim() : undefined;
  
  // ----------------------------------------------------
  // Precise Status Detection & Multi-Party Analysis (SIRIM + APPLICANT + SUPPLIER)
  // ----------------------------------------------------
  const latestLower = latestChunk.toLowerCase();
  const fullLower = fullText.toLowerCase();

  // Extract Supplier / Vendor details
  let supplierName: string | undefined;
  let supplierEmail: string | undefined;
  let supplierStatus: 'NOT_INVOLVED' | 'WAITING_FOR_SUPPLIER_DOCS' | 'DOCUMENTS_RECEIVED_FROM_SUPPLIER' | 'DOCUMENTS_SUBMITTED_TO_SIRIM' = 'NOT_INVOLVED';

  const supplierEmailMatch = fullText.match(/(?:from|to|cc|supplier|vendor|factory):\s*([a-zA-Z0-9._%+-]+@(?!sirim\.my|mcmc\.gov\.my|cytron\.io)[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);
  if (supplierEmailMatch) {
    supplierEmail = supplierEmailMatch[1].trim();
  }

  const supplierNameMatch = fullText.match(/(?:supplier|vendor|factory|manufacturer|oem|odm)[:\s]+([A-Za-z0-9\s.,&-]+?(?:Technologies|Electronics|Co\.?,?\s*Ltd|Inc|Semiconductor|Corp|Factory|Shenzhen|Espressif|Raspberry\s*Pi|Quectel|Simcom))/i) ||
    fullText.match(/(?:from\s+supplier|dear\s+supplier|supplier\s+team|factory\s+team)[:\s]*([A-Za-z0-9\s.,&-]+)/i);
  if (supplierNameMatch) {
    supplierName = supplierNameMatch[1].trim().slice(0, 50);
  } else if (supplierEmail) {
    const domainPart = supplierEmail.split('@')[1]?.split('.')[0];
    if (domainPart && !['gmail', 'yahoo', 'hotmail', 'outlook'].includes(domainPart.toLowerCase())) {
      supplierName = domainPart.charAt(0).toUpperCase() + domainPart.slice(1) + " Supplier";
    }
  }

  // Check if supplier is involved in the thread
  const hasSupplierInThread = Boolean(
    supplierEmail ||
    supplierName ||
    fullLower.includes("supplier") ||
    fullLower.includes("vendor") ||
    fullLower.includes("manufacturer") ||
    fullLower.includes("factory") ||
    fullLower.includes("from our supplier") ||
    fullLower.includes("forward to supplier") ||
    fullLower.includes("request from supplier")
  );

  // Check if latest message is sent by applicant (replying to SIRIM or Supplier)
  const isApplicantReply =
    (latestLower.includes("from: ") && (latestLower.includes("@cytron") || latestLower.includes("applicant"))) ||
    latestLower.includes("we have submitted") ||
    latestLower.includes("uploaded the requested") ||
    latestLower.includes("attached please find the revised") ||
    latestLower.includes("forwarding the supplier") ||
    latestLower.includes("submitted to ecomm") ||
    latestLower.includes("submitted to sirim");

  // Check if latest message is from supplier providing documents
  const isSupplierSender =
    (supplierEmail && latestLower.includes(supplierEmail.toLowerCase())) ||
    latestLower.includes("dear cytron") ||
    latestLower.includes("hi cytron") ||
    latestLower.includes("dear rupa") ||
    latestLower.includes("hi rupa") ||
    latestLower.includes("from supplier") ||
    latestLower.includes("from our factory") ||
    latestLower.includes("from our lab");

  const isSupplierSendingDocs =
    (isSupplierSender || hasSupplierInThread) &&
    (latestLower.includes("attached please find") ||
     latestLower.includes("please find attached") ||
     latestLower.includes("here is the test report") ||
     latestLower.includes("here are the test reports") ||
     latestLower.includes("attached the rf test report") ||
     latestLower.includes("attached the safety report") ||
     latestLower.includes("declaration of conformity") ||
     latestLower.includes("schematics and pcb") ||
     latestLower.includes("attached doc") ||
     latestLower.includes("sharing the test results") ||
     latestLower.includes("here are the documents for sirim"));

  // Check if applicant has forwarded supplier documents to SIRIM
  const hasApplicantForwardedToSirim =
    isApplicantReply &&
    (latestLower.includes("@sirim.my") || latestLower.includes("officer") || latestLower.includes("encik") || latestLower.includes("puan") || latestLower.includes("sirim team")) &&
    (latestLower.includes("attached") || latestLower.includes("submitted") || latestLower.includes("uploaded"));

  let status = "UNDER_REVIEW";
  let scheme = "Type Approval (MCMC/SIRIM)";

  if (latestLower.includes("approved") || latestLower.includes("certificate issued") || latestLower.includes("coa issued") || latestLower.includes("issuance of certificate") || latestLower.includes("type approval granted")) {
    status = "APPROVED";
    if (hasSupplierInThread) supplierStatus = "DOCUMENTS_SUBMITTED_TO_SIRIM";
  } else if (isSupplierSendingDocs && !hasApplicantForwardedToSirim) {
    // SUPPLIER PROVIDED DOCUMENTS, BUT CYTRON HAS NOT YET FORWARDED/UPLOADED THEM TO SIRIM
    status = "RFI_ACTION_REQUIRED";
    supplierStatus = "DOCUMENTS_RECEIVED_FROM_SUPPLIER";
  } else if (
    // DOCUMENT REQUESTS (RFI): Check if officer or lab is requesting documents, test reports, schematics, clarifications
    latestLower.includes("please submit") ||
    latestLower.includes("please provide") ||
    latestLower.includes("kindly provide") ||
    latestLower.includes("kindly submit") ||
    latestLower.includes("request for information") ||
    /\brfi\b/.test(latestLower) ||
    latestLower.includes("clarification") ||
    latestLower.includes("amendment") ||
    latestLower.includes("test report") ||
    latestLower.includes("schematic") ||
    latestLower.includes("user manual") ||
    latestLower.includes("declaration of conformity") ||
    /\bdoc\b/.test(latestLower) ||
    latestLower.includes("authorization letter") ||
    latestLower.includes("datasheet") ||
    latestLower.includes("missing document") ||
    latestLower.includes("required document") ||
    latestLower.includes("upload document") ||
    latestLower.includes("rectify") ||
    latestLower.includes("discrepancy") ||
    latestLower.includes("furnish")
  ) {
    if (hasApplicantForwardedToSirim) {
      status = "UNDER_REVIEW"; // Applicant has already submitted supplier/updated docs to SIRIM
      if (hasSupplierInThread) supplierStatus = "DOCUMENTS_SUBMITTED_TO_SIRIM";
    } else if (isApplicantReply && !isSupplierSender) {
      // The latest message is Cytron's OWN outgoing reply/question (e.g. "Can we apply under one model?").
      // Cytron has the ball in the other party's court: this is waiting, not a Cytron action.
      status = "UNDER_REVIEW";
      if (hasSupplierInThread && (latestLower.includes("supplier") || latestLower.includes("factory") || latestLower.includes("vendor"))) {
        status = "RFI_ACTION_REQUIRED";
        supplierStatus = "WAITING_FOR_SUPPLIER_DOCS";
      }
    } else if (hasSupplierInThread && (latestLower.includes("waiting for supplier") || latestLower.includes("requested from supplier") || latestLower.includes("checking with factory"))) {
      status = "RFI_ACTION_REQUIRED";
      supplierStatus = "WAITING_FOR_SUPPLIER_DOCS";
    } else {
      status = "RFI_ACTION_REQUIRED"; // Officer is waiting for documents
      if (hasSupplierInThread) supplierStatus = "WAITING_FOR_SUPPLIER_DOCS";
    }
  } else if (
    latestLower.includes("sample") &&
    (latestLower.includes("submit") || latestLower.includes("courier") || latestLower.includes("deliver") || latestLower.includes("call notice") || latestLower.includes("shah alam") || latestLower.includes("building 25") || latestLower.includes("test unit"))
  ) {
    if (isApplicantReply || courierTracking || latestLower.includes("tracking") || latestLower.includes("consignment")) {
      status = "SAMPLE_SUBMITTED";
    } else {
      status = "SAMPLE_REQUESTED";
    }
  } else if (
    // PAYMENT: ONLY when explicitly asking for payment and NOT asking for documents
    (latestLower.includes("payment pending") || latestLower.includes("please make payment") || latestLower.includes("unpaid invoice") || latestLower.includes("remit payment") || latestLower.includes("fee is due")) &&
    !latestLower.includes("document") && !latestLower.includes("report") && !latestLower.includes("schematic")
  ) {
    status = "PAYMENT_PENDING";
  } else if (latestLower.includes("testing in progress") || latestLower.includes("lab test") || latestLower.includes("undergoing testing")) {
    status = "TESTING_IN_PROGRESS";
  } else if (fullLower.includes("submitted") || fullLower.includes("e-comm submission")) {
    status = "UNDER_REVIEW";
  }

  if (fullLower.includes("special approval")) scheme = "Special Approval";
  else if (fullLower.includes("modular approval")) scheme = "Modular Approval";
  else if (fullLower.includes("cidb")) scheme = "CIDB Certification";
  else if (fullLower.includes("safety") || fullLower.includes("emc") || fullLower.includes("ms standards")) scheme = "Safety & EMC (MS Standards)";

  // Action items & Pending statements
  const actionItems: any[] = [];
  if (status === "RFI_ACTION_REQUIRED") {
    if (supplierStatus === "DOCUMENTS_RECEIVED_FROM_SUPPLIER") {
      actionItems.push({
        itemCategory: "ACTION_REQUIRED",
        title: `Review and submit ${supplierName ? `${supplierName} ` : ""}supplier documents to SIRIM officer`,
        description: `Supplier has provided the requested CoC technical documents in the thread. Verify file formats (RF/EMC reports, schematics, DoC) and upload to e-ComM / email to SIRIM officer.`,
        assignedTo: "APPLICANT",
        dueDate: new Date(Date.now() + 5 * 86400000).toISOString().split("T")[0],
        priority: "HIGH",
        requiredActionType: "SUBMIT_DOC",
        emailSourceSnippet: cleanSubject,
      });
    } else if (supplierStatus === "WAITING_FOR_SUPPLIER_DOCS") {
      actionItems.push({
        itemCategory: "PENDING_STATEMENT",
        title: `Waiting for lab report & technical documents from supplier${supplierName ? ` (${supplierName})` : ""}`,
        description: "Pending statement: SIRIM officer requested technical reports/schematics. Cytron is currently waiting for the supplier to furnish the required lab report/documentation.",
        assignedTo: "SUPPLIER",
        dueDate: new Date(Date.now() + 5 * 86400000).toISOString().split("T")[0],
        priority: "MEDIUM",
        requiredActionType: "WAITING_SUPPLIER",
        emailSourceSnippet: cleanSubject,
      });
    } else {
      actionItems.push({
        itemCategory: "ACTION_REQUIRED",
        title: "Submit required technical documentation / clarification to SIRIM",
        description: "Review SIRIM queries and reply with updated schematics, user manual, test reports, or declarations.",
        assignedTo: "APPLICANT",
        dueDate: new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0],
        priority: "HIGH",
        requiredActionType: "SUBMIT_DOC",
        emailSourceSnippet: cleanSubject,
      });
    }
  } else if (status === "SAMPLE_REQUESTED") {
    actionItems.push({
      itemCategory: "ACTION_REQUIRED",
      title: "Deliver test samples to SIRIM QAS Lab (Building 25, Shah Alam)",
      description: "Prepare hardware test units along with power adaptors, test cables, and continuous RF test mode firmware.",
      assignedTo: "APPLICANT",
      dueDate: new Date(Date.now() + 14 * 86400000).toISOString().split("T")[0],
      priority: "HIGH",
      requiredActionType: "SEND_SAMPLE",
      emailSourceSnippet: cleanSubject,
    });
  } else if (status === "PAYMENT_PENDING") {
    actionItems.push({
      itemCategory: "ACTION_REQUIRED",
      title: "Settle outstanding SIRIM processing fee invoice via e-ComM",
      description: `Submit payment online${processingFeeRm ? ` (RM ${processingFeeRm})` : ""} and upload payment receipt.`,
      assignedTo: "APPLICANT",
      dueDate: new Date(Date.now() + 5 * 86400000).toISOString().split("T")[0],
      priority: "CRITICAL",
      requiredActionType: "PAY_FEE",
      emailSourceSnippet: cleanSubject,
    });
  } else if (status === "UNDER_REVIEW") {
    actionItems.push({
      itemCategory: "PENDING_STATEMENT",
      title: "Waiting for reply / review from SIRIM officer",
      description: "Pending statement: Application documents have been submitted to SIRIM. Currently waiting for officer review and evaluation feedback.",
      assignedTo: "SIRIM",
      dueDate: new Date(Date.now() + 10 * 86400000).toISOString().split("T")[0],
      priority: "LOW",
      requiredActionType: "AWAIT_SIRIM",
      emailSourceSnippet: cleanSubject,
    });
  }

  // Build timeline events (if multiple messages are embedded in the body, parse each one)
  const timelineEvents: any[] = [];
  const messageChunks = emailBody.split(/(?==== MESSAGE \d+|\[Message \d+|\[[^\]]+ \([^\)]+\)\]:|\n---\n)/gi).filter(c => c.trim().length > 0);
  if (messageChunks.length > 1) {
    messageChunks.forEach((chunk, i) => {
      const matchHeader = chunk.match(/\[([^\]]+) \(([^\)]+)\)\]:/) || chunk.match(/FROM:\s*([^\n]+)[\s\S]*?DATE:\s*([^\n]+)/i);
      const chunkSender = matchHeader ? matchHeader[1].trim() : sender || "SIRIM QAS";
      const chunkDate = matchHeader ? matchHeader[2].trim() : date;
      const parsedDate = chunkDate ? new Date(chunkDate).toISOString().split("T")[0] : new Date().toISOString().split("T")[0];
      const chunkSnippet = chunk.replace(/\[[^\]]+ \([^\)]+\)\]:\s*/, "").slice(0, 150).trim();

      let evtType = "document";
      let evtTitle = `Email Update: ${cleanSubject.slice(0, 40)}`;
      const cLow = chunk.toLowerCase();
      if (cLow.includes("rfi") || cLow.includes("clarification") || cLow.includes("document") || cLow.includes("test report")) {
        evtType = "rfi";
        evtTitle = "SIRIM Document Request / Clarification (RFI)";
      } else if (cLow.includes("sample")) {
        evtType = "sample";
        evtTitle = "Test Sample Request / Dispatch";
      } else if (cLow.includes("payment") || cLow.includes("invoice")) {
        evtType = "payment";
        evtTitle = "Processing Fee Invoice Issued";
      } else if (cLow.includes("approved") || cLow.includes("certificate")) {
        evtType = "approval";
        evtTitle = "Certificate of Conformity Approved";
      }

      timelineEvents.push({
        date: parsedDate,
        title: evtTitle,
        description: chunkSnippet || `Communication recorded for ${applicationRef}.`,
        sender: chunkSender,
        emailSubject,
        type: evtType,
      });
    });
  }

  if (timelineEvents.length === 0) {
    timelineEvents.push({
      date: date ? date.split("T")[0] : new Date().toISOString().split("T")[0],
      title: `SIRIM Communication: ${cleanSubject.slice(0, 50)}`,
      description: `Ingested email communication regarding ${applicationRef} (${status}).`,
      sender: sender || "SIRIM QAS",
      emailSubject,
      type: status === "RFI_ACTION_REQUIRED" ? "rfi" : status === "SAMPLE_REQUESTED" ? "sample" : status === "PAYMENT_PENDING" ? "payment" : "status_change",
    });
  }

  return {
    isSirimRelated: true,
    confidence: 0.85,
    applicationRef,
    productName,
    modelNumber,
    brand: "Cytron",
    applicant: "Cytron Technologies Sdn Bhd",
    scheme,
    status,
    officerName,
    officerEmail: sender.includes("@sirim.my") ? sender : undefined,
    supplierName,
    supplierEmail,
    supplierStatus,
    submissionDate: date ? date.split("T")[0] : new Date().toISOString().split("T")[0],
    lastActivityDate: new Date().toISOString().split("T")[0],
    targetDeadline: new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0],
    certificateNo,
    processingFeeRm,
    paymentStatus: status === "PAYMENT_PENDING" ? "UNPAID" : processingFeeRm ? "PAID" : "NOT_APPLICABLE",
    detectedStandards,
    courierTracking,
    quotationOrInvoiceNo,
    summary: `Communication ingested: ${cleanSubject}${detectedStandards.length ? ` (${detectedStandards.join(', ')})` : ''}`,
    actionItems,
    timelineEvent: timelineEvents[timelineEvents.length - 1],
    timelineEvents,
  };
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: "15mb" }));
  // Every /api route (except /api/health) requires a signed-in, allowed Cytron account.
  app.use(requireApiAuth);

  // ----------------------------------------------------
  // Server-side Shared Application & Automation Storage
  // Provides central persistence on Raspberry Pi / Container so multiple users
  // (e.g. Lead, Boss, Team) share the exact same synchronized records.
  // ----------------------------------------------------
  const DATA_DIR = path.join(process.cwd(), "data");
  if (!fs.existsSync(DATA_DIR)) {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    } catch (e) {}
  }
  const CONFIG_FILE = path.join(DATA_DIR, "automation-config.json");
  const APPS_FILE = path.join(DATA_DIR, "applications-store.json");
  const ACTIVITY_FILE = path.join(DATA_DIR, "team-activity.json");
  const PRESENCE_FILE = path.join(DATA_DIR, "user-presence.json");
  const DELETED_FILE = path.join(DATA_DIR, "deleted-applications.json");
  const BACKUP_DIR = path.join(DATA_DIR, "backups");
  const MAX_BACKUPS = 30;

  /** Write via a temp file + rename so a crash mid-write can't leave a half-written (unreadable) store. */
  function writeJsonAtomic(file: string, data: any) {
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
    fs.renameSync(tmp, file);
  }

  /** Copy the application store to data/backups before anything destructive. Keeps the newest MAX_BACKUPS. */
  function backupApplicationsStore(reason: string) {
    try {
      if (!fs.existsSync(APPS_FILE)) return;
      if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      fs.copyFileSync(APPS_FILE, path.join(BACKUP_DIR, `applications-${stamp}-${reason}.json`));
      const files = fs.readdirSync(BACKUP_DIR).filter((f) => f.startsWith("applications-")).sort();
      for (const old of files.slice(0, Math.max(0, files.length - MAX_BACKUPS))) {
        fs.unlinkSync(path.join(BACKUP_DIR, old));
      }
    } catch (err) {
      console.error("Could not back up applications-store.json:", err);
    }
  }

  // Deleted applications are remembered so a teammate's open tab (or the Gmail scanner) can't bring them back.
  interface DeletedApplication {
    id?: string;
    applicationRef?: string;
    threadId?: string;
    deletedAt: string;
    deletedBy?: string;
  }

  function getDeletedApplications(): DeletedApplication[] {
    try {
      if (fs.existsSync(DELETED_FILE)) {
        const parsed = JSON.parse(fs.readFileSync(DELETED_FILE, "utf8"));
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (err) {
      console.warn("Could not read deleted-applications.json:", err);
    }
    return [];
  }

  function recordDeletedApplications(apps: any[], deletedBy?: string) {
    const list = getDeletedApplications();
    const now = new Date().toISOString();
    for (const a of apps) {
      if (!a) continue;
      list.push({ id: a.id, applicationRef: a.applicationRef, threadId: a.threadId, deletedAt: now, deletedBy });
    }
    try {
      writeJsonAtomic(DELETED_FILE, list.slice(-2000));
    } catch (err) {
      console.error("Could not write deleted-applications.json:", err);
    }
  }

  function isDeletedApplication(a: any, deleted: DeletedApplication[] = getDeletedApplications()): boolean {
    if (!a) return false;
    const ref = (a.applicationRef || "").trim().toLowerCase();
    return deleted.some(
      (d) =>
        (d.id && a.id && d.id === a.id) ||
        (d.threadId && a.threadId && d.threadId === a.threadId) ||
        (ref && d.applicationRef && d.applicationRef.trim().toLowerCase() === ref)
    );
  }

  // Forward declaration for triggering autonomous cycle from any handler
  let triggerAutonomousRunSafely: (source: string, userEmail?: string) => void = () => {};

  function getStoredAutomationConfig() {
    const defaults = {
      enabled: true,
      scheduleTime: "08:30",
      timezone: "Asia/Kuala_Lumpur",
      intervalHours: 24,
      autonomousIntervalMinutes: 0,
      autoScanGmail: true,
      autoSyncGoogleSheet: true,
      autoSendTelegram: true,
      autoProgressEvaluation: true,
      alertOnCriticalOnly: false,
      hasCompletedFirstScan: false,
      firstScanDurationDays: 365,
      routineScanDurationDays: 30,
      scanScopeMode: "auto",
      activeSession: null,
      sheetConfig: null,
      telegram: {
        botToken: process.env.TELEGRAM_BOT_TOKEN || "",
        chatId: process.env.TELEGRAM_CHAT_ID || "",
        topicId: process.env.TELEGRAM_TOPIC_ID || "",
        enabled: true,
        dailyDigest: true,
        instantAlertOnCritical: true,
      },
      logs: [],
    };

    try {
      if (fs.existsSync(CONFIG_FILE)) {
        const raw = fs.readFileSync(CONFIG_FILE, "utf8");
        const parsed = JSON.parse(raw);
        return {
          ...defaults,
          ...parsed,
          telegram: {
            ...defaults.telegram,
            ...(parsed.telegram || {}),
          },
        };
      }
    } catch (err) {
      console.warn("Could not read automation-config.json:", err);
    }
    return defaults;
  }

  function saveStoredAutomationConfig(config: any) {
    try {
      writeJsonAtomic(CONFIG_FILE, config);
    } catch (err) {
      console.error("Could not write automation-config.json:", err);
    }
  }

  /** Copy of the automation config that is safe to send to a browser (no Gmail or Telegram secrets). */
  function redactConfig(config: any) {
    const { activeSession, ...rest } = config || {};
    const telegram = { ...(rest.telegram || {}) };
    const hasBotToken = Boolean(telegram.botToken || process.env.TELEGRAM_BOT_TOKEN);
    telegram.botToken = hasBotToken ? BOT_TOKEN_MASK : "";
    if (!telegram.chatId && process.env.TELEGRAM_CHAT_ID) telegram.chatId = process.env.TELEGRAM_CHAT_ID;
    if (!telegram.topicId && process.env.TELEGRAM_TOPIC_ID) telegram.topicId = process.env.TELEGRAM_TOPIC_ID;
    return {
      ...rest,
      telegram,
      activeSession: activeSession
        ? {
            email: activeSession.email,
            name: activeSession.name,
            picture: activeSession.picture,
            expiresAt: activeSession.expiresAt,
            updatedAt: activeSession.updatedAt,
            isExpired: Boolean(activeSession.expiresAt && Date.now() > activeSession.expiresAt),
          }
        : null,
    };
  }

  /** The real Telegram bot token: the one in the request unless it is blank/the mask, else the stored one. */
  function resolveBotToken(requestToken?: string): string {
    if (!isMaskedOrEmpty(requestToken)) return String(requestToken).trim();
    return (getStoredAutomationConfig().telegram?.botToken || process.env.TELEGRAM_BOT_TOKEN || "").trim();
  }

  function getStoredApplications(): any[] {
    try {
      if (fs.existsSync(APPS_FILE)) {
        const raw = fs.readFileSync(APPS_FILE, "utf8");
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const cleaned = parsed.filter((app) => !isOutOfOfficeApplication(app));
          if (cleaned.length !== parsed.length) {
            try {
              fs.writeFileSync(APPS_FILE, JSON.stringify(cleaned, null, 2), "utf8");
            } catch (e) {}
          }
          return cleaned;
        }
      }
    } catch (err) {
      // Refuse to carry on with an empty list: the next save would overwrite (wipe) the real data.
      console.error("Could not read applications-store.json:", err);
      throw new Error("Application store could not be read. Restore it from data/backups before continuing.");
    }
    return [];
  }

  function saveStoredApplications(apps: any[]) {
    try {
      writeJsonAtomic(APPS_FILE, apps);
    } catch (err) {
      console.error("Could not write applications-store.json:", err);
    }
  }

  function getStoredTeamActivity(): any[] {
    try {
      if (fs.existsSync(ACTIVITY_FILE)) {
        const raw = fs.readFileSync(ACTIVITY_FILE, "utf8");
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          // Filter out dummy/placeholder accounts
          return parsed.filter((a) => {
            const em = (a.userEmail || "").toLowerCase();
            return em !== "team-member@cytron.io" && !em.startsWith("team-member");
          });
        }
      }
    } catch (err) {
      console.warn("Could not read team-activity.json:", err);
    }
    return [];
  }

  function recordTeamActivity(entry: any) {
    try {
      const current = getStoredTeamActivity();
      const rawEmail = (entry.userEmail || "").trim();
      const isPlaceholder = !rawEmail || rawEmail === "team-member@cytron.io" || rawEmail.startsWith("team-member");
      const userEmail = isPlaceholder ? "" : rawEmail;
      const userName = entry.userName || (userEmail ? userEmail.split("@")[0] : "Team Collaborator");

      const enriched = {
        id: entry.id || `act-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        timestamp: entry.timestamp || new Date().toISOString(),
        userEmail,
        userName,
        userPicture: entry.userPicture,
        actionType: entry.actionType || "APP_EDITED",
        applicationRef: entry.applicationRef || "",
        productName: entry.productName || "",
        description: entry.description || "",
        details: entry.details || {},
      };
      const updated = [enriched, ...current].slice(0, 150);
      fs.writeFileSync(ACTIVITY_FILE, JSON.stringify(updated, null, 2), "utf8");
      return enriched;
    } catch (err) {
      console.error("Could not write team-activity.json:", err);
      return null;
    }
  }

  function getStoredPresence(): any[] {
    try {
      if (fs.existsSync(PRESENCE_FILE)) {
        const raw = fs.readFileSync(PRESENCE_FILE, "utf8");
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          // Filter out users inactive for more than 5 minutes and remove any placeholder emails
          const fiveMinAgo = Date.now() - 5 * 60 * 1000;
          const filtered = parsed.filter((p) => {
            const email = (p.email || "").toLowerCase().trim();
            const name = (p.name || "").toLowerCase().trim();
            if (
              !email ||
              email === "team-member@cytron.io" ||
              email.includes("team-member") ||
              email.startsWith("team-") ||
              name === "team-member" ||
              name === "teammember" ||
              !email.includes("@")
            ) {
              return false;
            }
            const t = new Date(p.lastActive).getTime();
            return !isNaN(t) && t > fiveMinAgo;
          });

          // If stale/placeholder items were pruned, save clean state back to disk
          if (filtered.length !== parsed.length) {
            try {
              fs.writeFileSync(PRESENCE_FILE, JSON.stringify(filtered, null, 2), "utf8");
            } catch (e) {}
          }

          return filtered;
        }
      }
    } catch (err) {
      console.warn("Could not read user-presence.json:", err);
    }
    return [];
  }

  function recordUserPresence(user: { email: string; name?: string; picture?: string; activeAction?: string }) {
    if (!user || !user.email) return getStoredPresence();
    const cleanEmail = user.email.trim().toLowerCase();
    const cleanName = (user.name || "").trim().toLowerCase();
    // Strictly reject placeholder / non-real emails
    if (
      cleanEmail === "team-member@cytron.io" ||
      cleanEmail.includes("team-member") ||
      cleanEmail.startsWith("team-") ||
      cleanName === "team-member" ||
      cleanName === "teammember" ||
      !cleanEmail.includes("@")
    ) {
      return getStoredPresence();
    }

    try {
      const activeList = getStoredPresence();
      const nowStr = new Date().toISOString();
      const idx = activeList.findIndex((p) => p.email.toLowerCase() === cleanEmail);
      const record = {
        email: cleanEmail,
        name: user.name || cleanEmail.split("@")[0],
        picture: user.picture,
        lastActive: nowStr,
        activeAction: user.activeAction || "Active in workspace",
      };
      if (idx >= 0) {
        activeList[idx] = record;
      } else {
        activeList.push(record);
        // Log member active if new
        recordTeamActivity({
          userEmail: cleanEmail,
          userName: record.name,
          userPicture: record.picture,
          actionType: "MEMBER_JOINED",
          description: `${record.name} connected to the team workspace.`,
        });
      }
      fs.writeFileSync(PRESENCE_FILE, JSON.stringify(activeList, null, 2), "utf8");
      return activeList;
    } catch (err) {
      console.error("Could not write user-presence.json:", err);
      return [];
    }
  }

  /**
   * Smart Multi-User Application List Merger:
   * Prevents overwriting or loss of data when multiple team members (e.g. Lead, Boss)
   * access, scan, or modify records from different browsers or Google inboxes.
   */
  function toTime(v?: string): number {
    const t = v ? new Date(v).getTime() : 0;
    return Number.isFinite(t) ? t : 0;
  }

  /**
   * Merges a browser's (or the scanner's) copy of the applications into the shared store.
   *
   * Rules:
   *  - The copy with the newer lastModifiedAt wins for application fields, so an old browser tab can't
   *    undo a teammate's newer edit.
   *  - Action items are merged one by one: the newer `updatedAt` wins (falling back to whichever
   *    application copy is newer). A tick can therefore be removed again; it is no longer "sticky".
   *  - Email threads and timeline events are only ever added (they come from Gmail).
   *  - Deleted applications are never brought back.
   */
  function mergeApplicationsList(baseApps: any[], incomingApps: any[], authorEmail?: string): any[] {
    if (!Array.isArray(baseApps)) baseApps = [];
    if (!Array.isArray(incomingApps)) return baseApps;

    const deleted = getDeletedApplications();
    const cleanBase = baseApps.filter((a) => !isOutOfOfficeApplication(a));
    const cleanIncoming = incomingApps.filter((a) => a && !isOutOfOfficeApplication(a) && !isDeletedApplication(a, deleted));

    const merged = [...cleanBase];
    const nowStr = new Date().toISOString();

    for (const inc of cleanIncoming) {
      const idx = merged.findIndex((existing) => {
        if (inc.id && existing.id && inc.id === existing.id) return true;
        if (
          inc.applicationRef &&
          existing.applicationRef &&
          inc.applicationRef.trim() !== "" &&
          inc.applicationRef.trim().toLowerCase() === existing.applicationRef.trim().toLowerCase()
        )
          return true;
        if (inc.threadId && existing.threadId && inc.threadId === existing.threadId) return true;
        return false;
      });

      if (idx < 0) {
        merged.push({
          ...inc,
          id: inc.id || `app-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
          lastModifiedAt: inc.lastModifiedAt || nowStr,
          lastModifiedBy: inc.lastModifiedBy || authorEmail || "team",
        });
        continue;
      }

      const existing = merged[idx];
      const incomingIsNewer = toTime(inc.lastModifiedAt) > toTime(existing.lastModifiedAt);

      // Email threads & timeline: union
      const mergedThreads = [...(existing.emailThreads || [])];
      for (const th of inc.emailThreads || []) {
        if (!mergedThreads.some((m) => m.id === th.id || (m.messageId && m.messageId === th.messageId))) mergedThreads.push(th);
      }
      const mergedTimeline = [...(existing.timeline || [])];
      for (const tl of inc.timeline || []) {
        if (!mergedTimeline.some((t) => t.title === tl.title && t.date === tl.date)) mergedTimeline.push(tl);
      }
      mergedTimeline.sort((a, b) => (a.date < b.date ? -1 : 1));

      // Action items: per item, newest edit wins
      const mergedActions = [...(existing.actionItems || [])];
      for (const act of inc.actionItems || []) {
        if (!act) continue;
        const actIdx = mergedActions.findIndex(
          (a) => (act.id && a.id === act.id) || (act.title && a.title && a.title.toLowerCase() === act.title.toLowerCase())
        );
        if (actIdx < 0) {
          mergedActions.push(act);
          continue;
        }
        const cur = mergedActions[actIdx];
        const curT = toTime(cur.updatedAt);
        const actT = toTime(act.updatedAt);
        const takeIncoming = curT || actT ? actT > curT : incomingIsNewer;
        if (takeIncoming) mergedActions[actIdx] = { ...cur, ...act, id: cur.id || act.id };
      }

      const base = incomingIsNewer ? { ...existing, ...inc } : existing;
      merged[idx] = {
        ...base,
        id: existing.id || inc.id,
        emailThreads: mergedThreads,
        timeline: mergedTimeline,
        actionItems: mergedActions,
        lastModifiedAt: incomingIsNewer ? inc.lastModifiedAt : existing.lastModifiedAt || nowStr,
        lastModifiedBy: incomingIsNewer
          ? inc.lastModifiedBy || authorEmail || existing.lastModifiedBy || "team"
          : existing.lastModifiedBy || "team",
      };
    }

    return merged;
  }

  // ----------------------------------------------------
  // Health Check
  // ----------------------------------------------------
  app.get("/api/health", (req: Request, res: Response) => {
    res.json({
      status: "ok",
      service: "SIRIM CoC Progress Tracker API",
      timestamp: new Date().toISOString(),
      hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
    });
  });

  // ----------------------------------------------------
  // 1. Gemini AI: Parse Email Thread for SIRIM CoC Data
  // ----------------------------------------------------
  app.post("/api/gemini/parse-email-thread", async (req: Request, res: Response) => {
    try {
      const {
        emailSubject,
        emailBody,
        sender,
        date,
        existingApplication,
        mainSender,
        latestSender,
        mainSubject,
      } = req.body;

      if (!emailSubject && !emailBody) {
        return res.status(400).json({ error: "emailSubject or emailBody is required" });
      }

      // Pre-check: If this email/thread is an Out of Office or automated reply, return immediately
      if (isOutOfOfficeSubject(emailSubject) || isOutOfOfficeText(emailBody)) {
        return res.json({
          success: true,
          data: {
            isSirimRelated: false,
            isOutOfOffice: true,
            statusExplanation: "Out-of-office / automated reply notification excluded.",
            actionItems: [],
            timelineEvents: [],
            emailThreads: [],
          },
        });
      }

      // Pre-check: If this email is unrelated spam, marketing newsletter, or consumer noise
      if (isUnrelatedEmail({ subject: mainSubject || emailSubject, from: mainSender || sender, snippet: emailBody?.slice(0, 300) })) {
        return res.json({
          success: true,
          data: {
            isSirimRelated: false,
            statusExplanation: "Filtered: Unrelated non-regulatory communication or commercial notice.",
            actionItems: [],
            timelineEvents: [],
            emailThreads: [],
          },
        });
      }

      const ai = getGeminiClient();

      const prompt = `You are an expert Malaysian regulatory compliance specialist in SIRIM QAS International, e-ComM (MCMC), CIDB, and Certificate of Conformity (CoC) certification procedures.
Analyze the following email communication or full multi-stage email thread related to a SIRIM certification application. The thread may span several weeks, months, or up to 1 year of historical back-and-forth communication.

CRITICAL INSTRUCTION - DISTINGUISHING MAIN APPLICATION THREAD (MESSAGE 1) FROM SUBSEQUENT REPLIES (MESSAGE 2+):
1. THE MAIN THREAD (MESSAGE 1) is the original application root / submission notice:
   - Always extract 'applicationRef', 'productName', 'modelNumber', 'brand', 'applicant', and 'scheme' from MESSAGE 1 (the main thread).
   - Clean the product name by stripping "Re:", "Fwd:", and reference codes so it reflects the actual physical equipment (e.g. "Raspberry Pi 5", "ESP32-S3 Wireless Module", "Smart IoT Gateway").
   - Do NOT name the product after a follow-up reply, acknowledgement, or internal remark in Message 2!
2. THE LATEST MESSAGE (MESSAGE N) determines the active workflow state:
   - Evaluate the latest communication to establish current 'status', 'statusExplanation', and pending 'actionItems'.

CRITICAL OUT-OF-OFFICE & AUTOMATED REPLY EXCLUSION:
- If this email or thread is an Out-of-Office auto-reply, auto-response, automated leave notice, vacation response, bounce/delivery failure notification, or contains no substantive regulatory information:
  * SET 'isSirimRelated': false
  * SET 'isOutOfOffice': true
  * SET 'statusExplanation': "Out-of-office / automated reply notification excluded."
  * Do NOT create action items or extract this as a valid application.

CRITICAL INSTRUCTIONS FOR READING THE ENTIRE THREAD:
1. READ EVERY SINGLE MESSAGE IN THE THREAD: Do not stop at the first or last message. Trace the chronological history from Message 1 to the final message.
2. RECONSTRUCT THE TIMELINE: Extract all milestones across the thread into 'timelineEvents' (e.g. Initial Submission, Quotation/Fee issued, Samples requested/sent, Clarifications/RFIs raised, Officer responses, Supplier document delivery, Final Evaluation, Approval).

CRITICAL MULTI-PARTY HANDLING (SIRIM OFFICER + APPLICANT + SUPPLIER/OEM/VENDOR):
The email thread may involve THREE or more distinct parties:
1. SIRIM QAS / e-ComM / MCMC Officer: Regulating authority requesting documents, fees, samples, or issuing approval.
2. Applicant (Cytron Technologies / Compliance team): Company managing the application and coordinating with SIRIM and suppliers.
3. Supplier / Hardware Vendor / OEM / ODM / Component Manufacturer (e.g. Espressif, Raspberry Pi, Shenzhen supplier, vendor lab): The hardware manufacturer sending technical documents needed for SIRIM CoC (e.g., MS IEC 62368-1 safety test reports, RF/EMC test reports, circuit schematics, PCB layout, block diagrams, EU/CE Declaration of Conformity, user manuals).

CRITICAL RULES FOR SUPPLIER PARTICIPATION & LATEST STATUS:
- Extract 'supplierName' and 'supplierEmail' if a supplier or external manufacturer is present in the thread.
- EVALUATE THE STATUS ACCORDING TO SUPPLIER DOCUMENT FLOW:
  a) IF THE LATEST MESSAGE IS FROM THE SUPPLIER SENDING/ATTACHING THE REQUESTED DOCUMENTS TO CYTRON:
     * NOTE: SIRIM has NOT received these documents yet! Cytron must review and submit/forward them to the SIRIM officer or e-ComM portal.
     * STATUS MUST BE: 'RFI_ACTION_REQUIRED'
     * ACTION ITEM: Assigned to 'APPLICANT' (e.g., "Review supplier documents and submit/upload to SIRIM officer").
     * 'supplierStatus': 'DOCUMENTS_RECEIVED_FROM_SUPPLIER'
     * 'statusExplanation': "Supplier has provided the requested CoC technical documents in the thread. Cytron compliance team must verify and submit/upload them to SIRIM."

  b) IF SIRIM ISSUED AN RFI FOR DOCUMENTS AND APPLICANT IS WAITING FOR THE SUPPLIER TO PROVIDE THEM:
     * STATUS MUST BE: 'RFI_ACTION_REQUIRED'
     * ITEM CATEGORY: 'PENDING_STATEMENT' (NOT an action required from Cytron! It is a passive pending statement).
     * TITLE: "Waiting for lab report & CoC technical documents from supplier" (or specific missing document).
     * 'requiredActionType': 'WAITING_SUPPLIER'
     * 'assignedTo': 'SUPPLIER'
     * 'supplierStatus': 'WAITING_FOR_SUPPLIER_DOCS'
     * 'statusExplanation': "Waiting for hardware supplier to furnish required CoC test reports/schematics."

  c) IF APPLICANT HAS ALREADY FORWARDED/SUBMITTED THE SUPPLIER'S DOCUMENTS TO SIRIM OFFICER:
     * STATUS: 'UNDER_REVIEW'
     * ITEM CATEGORY: 'PENDING_STATEMENT' (title: "Waiting for reply / review from SIRIM officer").
     * 'requiredActionType': 'AWAIT_SIRIM'
     * 'assignedTo': 'SIRIM'
     * 'supplierStatus': 'DOCUMENTS_SUBMITTED_TO_SIRIM'
     * 'statusExplanation': "Supplier documents have been submitted to SIRIM; awaiting officer review."

  d) IF NO SUPPLIER IS INVOLVED:
     * 'supplierStatus': 'NOT_INVOLVED'

CRITICAL ACTION LABELING vs PENDING STATEMENT:
You MUST differentiate clearly between an ACTIVE ACTION REQUIRED vs a PASSIVE PENDING STATEMENT:
1. 'ACTION_REQUIRED': Use ONLY when Cytron / applicant must actively do something (e.g. submit documents, upload to e-ComM, pay fee, deliver physical hardware test samples, write an email reply to officer).
   - Set 'itemCategory': 'ACTION_REQUIRED'
   - Set 'assignedTo': 'APPLICANT'
2. 'PENDING_STATEMENT': If we just need to wait for the reply, report, deliverable, or feedback from the other party (e.g. waiting for lab report from supplier, waiting for reply from SIRIM officer, waiting for test results from accredited lab):
   - IT MUST NOT BE A PENDING ACTION! IT IS A PENDING STATEMENT!
   - Set 'itemCategory': 'PENDING_STATEMENT'
   - Title MUST state what we are waiting for, e.g. "Waiting for lab report from supplier", "Waiting for reply from SIRIM officer", "Waiting for RF test data from supplier lab".
   - Set 'assignedTo': 'SUPPLIER' | 'SIRIM' | 'LAB'
   - Set 'requiredActionType': 'WAITING_SUPPLIER' | 'AWAIT_SIRIM' | 'WAITING_LAB' | 'WAITING_REPLY'

${ACTION_DIRECTION_RULES}

CRITICAL STATUS CLASSIFICATION RULES (BASED ON THE LATEST STATE):
- 'RFI_ACTION_REQUIRED':
  CHOOSE THIS whenever the SIRIM officer, e-ComM officer, or testing lab is requesting technical documents, reports, or clarifications, OR when supplier has provided documents that have not yet been submitted to SIRIM. This includes:
  * RF test reports, EMC test reports, Safety test reports (MS IEC 62368-1), SAR reports.
  * Product schematics, PCB layout, block diagram, technical specifications, user manual, datasheet.
  * Declaration of Conformity (DoC), Letter of Authorization, brand authorization.
  * Exterior/interior product photos, marking/label artwork, rating plate drawings.
  * Any written clarifications, answers to officer queries, or amendments.
  IMPORTANT: Even if an invoice number, quotation, or processing fee is mentioned in the thread or in a quotation table, IF SIRIM IS REQUESTING TECHNICAL DOCUMENTS OR TEST REPORTS, THE STATUS MUST BE 'RFI_ACTION_REQUIRED' (NOT 'PAYMENT_PENDING')!

- 'PAYMENT_PENDING':
  ONLY choose this if paying an outstanding invoice/fee or uploading payment receipt is the EXCLUSIVE or PRIMARY pending action, and SIRIM is NOT waiting for technical documents or test reports.

- 'UNDER_REVIEW':
  Choose this if:
  * The application was submitted and is undergoing initial technical review by SIRIM.
  * OR the applicant (Cytron) already responded to the previous RFI by sending/uploading the requested documents (including supplier documents), and is now waiting for the SIRIM officer to evaluate them.

- 'SAMPLE_REQUESTED':
  SIRIM has issued a call notice requesting physical hardware test samples to be delivered/couriered to SIRIM QAS Lab (Building 25, Shah Alam).

- 'SAMPLE_SUBMITTED':
  The applicant has dispatched the physical samples and provided courier tracking consignment info (e.g. GDEX, PosLaju, DHL).

- 'TESTING_IN_PROGRESS':
  SIRIM QAS lab or accredited third-party lab is actively conducting laboratory tests (RF, EMC, Safety).

- 'FINAL_EVALUATION':
  Testing and document evaluation are completed; application is queued for final approval committee review.

- 'APPROVED':
  SIRIM QAS has approved the application, issued the Certificate of Conformity (CoC) / Type Approval / e-ComM certificate, or granted certification.

EMAIL DETAILS:
Main Thread Subject: ${mainSubject || emailSubject || ""}
Original / Main Sender: ${mainSender || sender || "Unknown"}
Latest Activity Sender: ${latestSender || sender || "Unknown"}
Latest Activity Date: ${date || new Date().toISOString()}
Full Thread Transcript:
${emailBody || ""}

${
  existingApplication
    ? `EXISTING APPLICATION CONTEXT:
Ref: ${existingApplication.applicationRef}
Product: ${existingApplication.productName}
Current Status: ${existingApplication.status}
Open Items: ${JSON.stringify((existingApplication.actionItems || []).filter((a: any) => !a.isCompleted).map((a: any) => ({ title: a.title, category: a.itemCategory, assignedTo: a.assignedTo })))}
`
    : ""
}

OUTPUT RULES:
1. Determine if this email/thread is related to SIRIM QAS / e-ComM / MCMC / CIDB / CoC / Type Approval / Safety approval.
2. Extract the Application Reference No / Job No (e.g. SQAS/CMCS/2026/..., eComM Ref, etc.). If none found, generate a plausible reference based on the subject.
3. Extract Product Name, Model Number, Brand, Applicant company name (e.g. Cytron Technologies Sdn Bhd).
4. Identify Certification Scheme ('Type Approval (MCMC/SIRIM)', 'Special Approval', 'Modular Approval', 'CIDB Certification', 'Safety & EMC (MS Standards)').
5. Identify current status based on the CRITICAL STATUS CLASSIFICATION RULES above.
6. Provide a concise 'statusExplanation' stating why this status was determined from the latest communication.
7. Extract officer name and direct email if mentioned.
8. Extract Malaysian standards tested against (e.g., MS IEC 62368-1, MCMC MTSFB TC T007, CISPR 32, etc.).
9. Extract any courier tracking consignment numbers for test sample deliveries to SIRIM QAS (e.g. GDEX, PosLaju, DHL).
10. Extract Quotation/Invoice number and processing fee in RM (Ringgit Malaysia).
11. Extract Certificate Number and Expiry Date if approved.
12. Extract the open items for the LATEST state: ACTION_REQUIRED items for things SIRIM / the agent / supplier / lab asked Cytron to do, and PENDING_STATEMENT items for anything Cytron is waiting on (including questions Cytron asked). Follow the WHO HAS THE BALL rules.
13. IMPORTANT: Extract ALL chronological timeline milestones across the entire thread history into 'timelineEvents' (e.g., initial submission, quotation issued, sample requested, RFI clarification sent, lab evaluation, approval). Also provide a single 'timelineEvent' for the latest update.
14. AUTONOMOUS PROGRESS EVALUATION (AI REPLACES MANUAL CHECKMARK TICKING):
    - Identify if recent communications in the thread fulfill, answer, or resolve any pending requirements or earlier RFIs.
    - If the user/supplier sent the missing schematics/DoC/reports, or dispatched test samples, or confirmed payment, specify them in 'resolvedRequirements' with clear reasons explaining how the email proved progress.
    - If status has advanced to APPROVED, all earlier submission/testing requirements are resolved.

Return ONLY a valid JSON object matching this schema.`;

      const response = await generateContentWithRetryAndFallback(
        ai,
        "gemini-3.8-flash",
        prompt,
        {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              isSirimRelated: { type: Type.BOOLEAN },
              isOutOfOffice: { type: Type.BOOLEAN },
              confidence: { type: Type.NUMBER },
              applicationRef: { type: Type.STRING },
              productName: { type: Type.STRING },
              modelNumber: { type: Type.STRING },
              brand: { type: Type.STRING },
              applicant: { type: Type.STRING },
              scheme: {
                type: Type.STRING,
                enum: [
                  "Type Approval (MCMC/SIRIM)",
                  "Special Approval",
                  "Modular Approval",
                  "CIDB Certification",
                  "Safety & EMC (MS Standards)",
                ],
              },
              status: {
                type: Type.STRING,
                enum: [
                  "SUBMITTED",
                  "UNDER_REVIEW",
                  "SAMPLE_REQUESTED",
                  "SAMPLE_SUBMITTED",
                  "TESTING_IN_PROGRESS",
                  "RFI_ACTION_REQUIRED",
                  "PAYMENT_PENDING",
                  "FINAL_EVALUATION",
                  "APPROVED",
                  "REJECTED",
                  "EXPIRED",
                ],
              },
              statusExplanation: { type: Type.STRING },
              officerName: { type: Type.STRING },
              officerEmail: { type: Type.STRING },
              supplierName: { type: Type.STRING },
              supplierEmail: { type: Type.STRING },
              supplierStatus: {
                type: Type.STRING,
                enum: [
                  "NOT_INVOLVED",
                  "WAITING_FOR_SUPPLIER_DOCS",
                  "DOCUMENTS_RECEIVED_FROM_SUPPLIER",
                  "DOCUMENTS_SUBMITTED_TO_SIRIM",
                ],
              },
              submissionDate: { type: Type.STRING },
              lastActivityDate: { type: Type.STRING },
              targetDeadline: { type: Type.STRING },
              certificateNo: { type: Type.STRING },
              certificateExpiryDate: { type: Type.STRING },
              processingFeeRm: { type: Type.NUMBER },
              paymentStatus: {
                type: Type.STRING,
                enum: ["NOT_APPLICABLE", "UNPAID", "PAID"],
              },
              detectedStandards: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              courierTracking: { type: Type.STRING },
              quotationOrInvoiceNo: { type: Type.STRING },
              sirimJobNo: { type: Type.STRING },
              summary: { type: Type.STRING },
              actionItems: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    itemCategory: {
                      type: Type.STRING,
                      enum: ["ACTION_REQUIRED", "PENDING_STATEMENT"],
                    },
                    title: { type: Type.STRING },
                    description: { type: Type.STRING },
                    assignedTo: {
                      type: Type.STRING,
                      enum: ["APPLICANT", "SIRIM", "LAB", "SUPPLIER"],
                    },
                    dueDate: { type: Type.STRING },
                    priority: {
                      type: Type.STRING,
                      enum: ["CRITICAL", "HIGH", "MEDIUM", "LOW"],
                    },
                    requiredActionType: {
                      type: Type.STRING,
                      enum: [
                        "SUBMIT_DOC",
                        "PAY_FEE",
                        "SEND_SAMPLE",
                        "PROVIDE_CLARIFICATION",
                        "AWAIT_SIRIM",
                        "WAITING_SUPPLIER",
                        "WAITING_LAB",
                        "WAITING_REPLY",
                        "RENEW_CERTIFICATE",
                      ],
                    },
                    emailSourceSnippet: { type: Type.STRING },
                  },
                  required: ["title", "description", "assignedTo", "priority", "requiredActionType"],
                },
              },
              timelineEvent: {
                type: Type.OBJECT,
                properties: {
                  date: { type: Type.STRING },
                  title: { type: Type.STRING },
                  description: { type: Type.STRING },
                  sender: { type: Type.STRING },
                  senderRole: {
                    type: Type.STRING,
                    enum: ["SIRIM_OFFICER", "APPLICANT", "SUPPLIER", "TEST_LAB", "OTHER"],
                  },
                  emailSubject: { type: Type.STRING },
                  emailSnippet: { type: Type.STRING },
                  type: {
                    type: Type.STRING,
                    enum: ["status_change", "rfi", "document", "payment", "approval", "sample"],
                  },
                },
                required: ["date", "title", "description", "sender", "type"],
              },
              timelineEvents: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    date: { type: Type.STRING },
                    title: { type: Type.STRING },
                    description: { type: Type.STRING },
                    sender: { type: Type.STRING },
                    senderRole: {
                      type: Type.STRING,
                      enum: ["SIRIM_OFFICER", "APPLICANT", "SUPPLIER", "TEST_LAB", "OTHER"],
                    },
                    emailSubject: { type: Type.STRING },
                    emailSnippet: { type: Type.STRING },
                    type: {
                      type: Type.STRING,
                      enum: ["status_change", "rfi", "document", "payment", "approval", "sample"],
                    },
                  },
                  required: ["date", "title", "description", "sender", "type"],
                },
              },
              resolvedRequirements: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    reason: { type: Type.STRING },
                  },
                  required: ["title", "reason"],
                },
              },
            },
            required: [
              "isSirimRelated",
              "applicationRef",
              "productName",
              "modelNumber",
              "brand",
              "applicant",
              "scheme",
              "status",
              "summary",
              "actionItems",
              "timelineEvent",
            ],
          },
        },
        "gemini-3.1-flash-lite"
      );

      const jsonText = response.text?.trim();
      if (!jsonText) {
        throw new Error("No response returned by Gemini model");
      }

      const parsedData = normalizeParsedActionItems(JSON.parse(jsonText));
      res.json({ success: true, data: parsedData });
    } catch (err: any) {
      console.warn("Gemini AI parse error, utilizing fallback regulatory parser:", err?.message || err);
      try {
        const heuristicData = fallbackHeuristicSirimParser(
          req.body?.emailSubject || "",
          req.body?.emailBody || "",
          req.body?.sender || "",
          req.body?.date || ""
        );
        res.json({ success: true, data: normalizeParsedActionItems(heuristicData), isFallback: true });
      } catch (fallbackErr) {
        res.status(500).json({
          error: "Failed to parse email with Gemini AI",
          details: err?.message || String(err),
        });
      }
    }
  });

  // ----------------------------------------------------
  // 2. Gemini AI: Draft Official Response (to SIRIM or Supplier)
  // ----------------------------------------------------
  app.post("/api/gemini/generate-reply", async (req: Request, res: Response) => {
    const {
      applicationRef,
      productName,
      modelNumber,
      officerName,
      recipientType = "SIRIM", // 'SIRIM' | 'SUPPLIER'
      supplierName,
      supplierEmail,
      responseIntent, // 'SUBMIT_DOCS' | 'REQUEST_EXTENSION' | 'STATUS_FOLLOWUP' | 'SAMPLE_TRACKING' | 'REQUEST_SUPPLIER_DOCS' | 'FOLLOWUP_SUPPLIER' | 'CUSTOM'
      customNotes,
      actionItemDetails,
    } = req.body;

    try {
      const ai = getGeminiClient();

      const isSupplierTarget = recipientType === "SUPPLIER";

      const prompt = isSupplierTarget
        ? `You are a technical compliance specialist at Cytron Technologies Sdn Bhd (Malaysian electronics & IoT company).
Draft an urgent, clear, and professional B2B email to our Hardware Supplier / ODM / Manufacturer (${supplierName || "Supplier Team"}) requesting the mandatory technical documentation needed for SIRIM QAS International Certificate of Conformity (CoC) / Type Approval.

PRODUCT & REGULATORY DETAILS:
- Product Name: ${productName || "N/A"}
- Model Number: ${modelNumber || "N/A"}
- SIRIM Application Ref: ${applicationRef || "N/A"}
- Supplier: ${supplierName || "Hardware Supplier Team"} (${supplierEmail || "supplier@vendor.com"})
- Purpose / Intent: ${responseIntent || "REQUEST_SUPPLIER_DOCS"}
- Specific Documents / Action Required: ${actionItemDetails || "Missing test reports, schematics, and Declaration of Conformity"}
- User Notes: ${customNotes || "Please supply unredacted laboratory test reports and complete schematics"}

DRAFTING GUIDELINES:
- Formal, cooperative, and urgent B2B engineering tone.
- Clearly enumerate the exact technical documents SIRIM requires (e.g. MS IEC 62368-1 / IEC 62368-1 safety test report with ILAC-MRA mark, RF & EMC test reports, circuit schematics, PCB trace layout, EU/CE Declaration of Conformity, manufacturer authorization letter).
- Emphasize regulatory deadlines so the application does not stall or lapse.

Return a JSON with "subject", "body", and "suggestedAttachments" (array of strings).`
        : `You are a professional regulatory compliance manager at a high-tech Malaysian electronics & IoT manufacturer (Cytron Technologies Sdn Bhd).
Draft an official, polite, and compliant email reply to SIRIM QAS International regarding a Certificate of Conformity (CoC) / Type Approval application.

APPLICATION DETAILS:
- Application Ref: ${applicationRef || "N/A"}
- Product Name: ${productName || "N/A"}
- Model Number: ${modelNumber || "N/A"}
- Addressed Officer: ${officerName || "SIRIM QAS Certification Officer"}
- Purpose / Intent: ${responseIntent}
- Specific Action Item / Context: ${actionItemDetails || ""}
- Additional User Notes / Clarification: ${customNotes || "Standard submission of requested documentation/information"}
${supplierName ? `- Supplier Origin of Documents: ${supplierName}` : ""}

DRAFTING GUIDELINES:
- Include a clear formal subject line with Reference Number and Model Name (e.g., "RE: SQAS/CMCS/... - Submission of Revised Technical Documents")
- Formal Malaysian business letter salutation and closing ("Dear Encik/Puan/Mr/Ms...", "Best regards, Regulatory Compliance Team")
- Clear itemized points answering the officer's queries or providing courier tracking / payment proof details.
- If forwarding supplier documents (test reports, schematics), explicitly state that they have been reviewed and verified by Cytron.
- Professional, respectful, and compliant tone conforming to Malaysian Standards (MS) and MCMC regulatory conventions.

Return a JSON with "subject", "body", and "suggestedAttachments" (array of strings).`;

      const response = await generateContentWithRetryAndFallback(
        ai,
        "gemini-3.8-flash",
        prompt,
        {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              subject: { type: Type.STRING },
              body: { type: Type.STRING },
              suggestedAttachments: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
            },
            required: ["subject", "body", "suggestedAttachments"],
          },
        },
        "gemini-3.1-flash-lite"
      );

      const jsonText = response.text?.trim();
      const parsedDraft = JSON.parse(jsonText || "{}");
      res.json({ success: true, draft: parsedDraft });
    } catch (err: any) {
      console.warn("Gemini AI draft reply error, generating fallback draft template:", err?.message || err);
      const isSupplierTarget = req.body?.recipientType === "SUPPLIER";
      const fallbackDraft = isSupplierTarget
        ? {
            subject: `URGENT: Technical Documentation Required for SIRIM CoC Approval - ${productName || "Product"} (${modelNumber || "Model"})`,
            body: `Dear ${supplierName || "Supplier Team"},\n\nWe are currently processing the Malaysian SIRIM QAS Certificate of Conformity (CoC) / Type Approval for ${productName || "Equipment"} (Model: ${modelNumber || "N/A"}).\n\nSIRIM regulatory evaluators have requested the following technical documentation:\n${actionItemDetails ? `- ${actionItemDetails}\n` : ""}- Full RF and EMC Test Reports (with test frequency allocation and EIRP tables)\n- MS IEC 62368-1 / IEC 62368-1 Safety Test Report (ISO/IEC 17025 accredited)\n- Circuit Schematics & PCB Layout Diagram\n- EU/CE Declaration of Conformity (DoC)\n\nPlease provide these documents at your earliest convenience to avoid application delays.\n\nBest regards,\nRegulatory Compliance Team\nCytron Technologies Sdn Bhd`,
            suggestedAttachments: ["SIRIM_Requirement_Checklist.pdf"]
          }
        : {
            subject: `RE: ${applicationRef || "SIRIM CoC"} - ${responseIntent === "SUBMIT_DOCS" ? "Submission of Requested Documents" : responseIntent === "REQUEST_EXTENSION" ? "Request for Extension of Time" : responseIntent === "SAMPLE_TRACKING" ? "Submission of Test Samples Courier Details" : "Follow-up on Application Status"}`,
            body: `Dear ${officerName || "SIRIM QAS Certification Officer"},\n\nWe refer to our Certificate of Conformity / Type Approval application for reference ${applicationRef || "N/A"} (${productName || "Equipment"}, Model: ${modelNumber || "N/A"}).\n\n${customNotes || (actionItemDetails ? `Regarding the requested item: "${actionItemDetails}", we have reviewed the requirements and prepared the necessary updates.` : "We are pleased to provide the requested information and documentation as required by the technical evaluation team.")}\n\nPlease let us know if any further clarification or documentation is required for your evaluation.\n\nThank you for your assistance.\n\nBest regards,\nRegulatory Compliance Team\nCytron Technologies Sdn Bhd`,
            suggestedAttachments: responseIntent === "SUBMIT_DOCS" ? ["Technical_Datasheet_v2.pdf", "RF_Test_Report.pdf"] : responseIntent === "SAMPLE_TRACKING" ? ["Courier_Consignment_Note.pdf"] : ["Company_Cover_Letter.pdf"]
          };
      res.json({ success: true, draft: fallbackDraft, isFallback: true });
    }
  });

  // ----------------------------------------------------
  // 2B. Gemini: Automated Compliance Pre-Screening for PDF / Reports
  // Pre-screens test reports and technical files against Malaysian SIRIM / MCMC standards
  // ----------------------------------------------------
  app.post("/api/gemini/pre-screen-document", async (req: Request, res: Response) => {
    try {
      const {
        documentName = "Compliance Document",
        documentText = "",
        scheme = "Type Approval (MCMC/SIRIM)",
        productName = "Equipment",
        modelNumber = "Model",
      } = req.body;

      if (!documentText || documentText.trim().length === 0) {
        return res.status(400).json({ error: "documentText is required for compliance pre-screening" });
      }

      const ai = getGeminiClient();
      const prompt = `You are an elite Malaysian regulatory compliance engineer and SIRIM QAS technical evaluator specializing in MCMC Type Approval, e-ComM compliance, and Malaysian Standards (MS).

Perform a rigorous compliance pre-screening audit of the following technical document text:
DOCUMENT NAME: ${documentName}
EQUIPMENT: ${productName} (Model: ${modelNumber})
CERTIFICATION SCHEME: ${scheme}

DOCUMENT EXCERPT:
"""
${documentText.slice(0, 15000)}
"""

MALAYSIAN SIRIM / MCMC CRITICAL EVALUATION RULES:
1. Standards Applicability:
   - RF (2.4 GHz / 5 GHz / BT / Zigbee): Check for ETSI EN 300 328, ETSI EN 301 893, MCMC MTSFB TC T007.
   - Cellular: Check for 3GPP, ETSI EN 301 908, MCMC MTSFB TC T011.
   - Safety: Check for MS IEC 62368-1 or IEC 62368-1 / IEC 60950-1.
   - EMC: Check for MS CISPR 32, ETSI EN 301 489 series.
2. Accreditation:
   - Must be issued by an ISO/IEC 17025 accredited laboratory with ILAC-MRA or SAMM recognition.
3. Power and Frequency limits in Malaysia Class Assignment:
   - 2.4 GHz band (2400 - 2483.5 MHz): Max 20 dBm (100 mW) EIRP.
   - 5 GHz band: 5150 - 5350 MHz (Indoor only, max 200 mW EIRP), 5470 - 5725 MHz (max 1 W EIRP), 5725 - 5850 MHz (max 1 W EIRP).
4. Rejection Triggers:
   - Redactions of critical laboratory tables, model mismatch between test report and applicant's model, missing laboratory accreditation symbol, or outdated draft standards.

Evaluate thoroughly and return a JSON matching the schema.`;

      const response = await generateContentWithRetryAndFallback(
        ai,
        "gemini-3.8-flash",
        prompt,
        {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              documentName: { type: Type.STRING },
              documentType: { type: Type.STRING },
              overallVerdict: {
                type: Type.STRING,
                enum: ["COMPLIANT", "RISK_OF_REJECTION", "INSUFFICIENT_DATA"],
              },
              score: { type: Type.INTEGER },
              summary: { type: Type.STRING },
              issues: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    severity: { type: Type.STRING, enum: ["CRITICAL", "WARNING", "INFO"] },
                    issue: { type: Type.STRING },
                    malaysianStandardRef: { type: Type.STRING },
                    recommendation: { type: Type.STRING },
                  },
                  required: ["severity", "issue", "malaysianStandardRef", "recommendation"],
                },
              },
              passedChecks: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              detectedStandards: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              detectedLabAccreditation: { type: Type.STRING },
              detectedFrequencies: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              detectedPowerOutput: { type: Type.STRING },
            },
            required: [
              "documentName",
              "documentType",
              "overallVerdict",
              "score",
              "summary",
              "issues",
              "passedChecks",
              "detectedStandards",
            ],
          },
        },
        "gemini-3.1-flash-lite"
      );

      const jsonText = response.text?.trim();
      const parsedResult = JSON.parse(jsonText || "{}");
      res.json({ success: true, result: parsedResult });
    } catch (err: any) {
      console.error("Error in gemini/pre-screen-document:", err);
      const { documentName = "Report", scheme = "Type Approval", modelNumber = "Model" } = req.body;
      const fallbackResult = {
        documentName,
        documentType: "Laboratory Test Report",
        overallVerdict: "RISK_OF_REJECTION",
        score: 65,
        summary: `Pre-screening analyzed against Malaysian MCMC/SIRIM ${scheme} guidelines. Laboratory accreditation and frequency allocations require verification.`,
        issues: [
          {
            severity: "WARNING",
            issue: "Verify ILAC-MRA mutual recognition endorsement on front sheet of test laboratory report.",
            malaysianStandardRef: "MCMC MTSFB TC T007 / ISO/IEC 17025",
            recommendation: "Request test laboratory to provide accreditation certificate and unredacted test plots."
          },
          {
            severity: "INFO",
            issue: `Ensure model number '${modelNumber}' is explicitly designated as the Tested Unit in the EUT description table.`,
            malaysianStandardRef: "SIRIM QAS e-ComM Guideline Section 4.2",
            recommendation: "Provide manufacturer declaration letter if model differs slightly in branding."
          }
        ],
        passedChecks: [
          "Document structure contains required RF test parameters",
          "Test report format conforms to international test laboratory presentation"
        ],
        detectedStandards: ["ETSI EN 300 328", "MS IEC 62368-1"],
        detectedLabAccreditation: "ISO/IEC 17025 (Verification advised)",
        detectedFrequencies: ["2400 - 2483.5 MHz"],
        detectedPowerOutput: "≤ 20 dBm EIRP",
      };
      res.json({ success: true, result: fallbackResult, isFallback: true });
    }
  });

  // ----------------------------------------------------
  // 3. Google Sheets: Create & Format Tracking Sheet
  // ----------------------------------------------------
  app.post("/api/sheets/create", async (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Missing or invalid Google OAuth Authorization header" });
      }

      const accessToken = authHeader.split(" ")[1];
      const { title = "SIRIM CoC Progress Tracker - Master Register", initialRows = [] } = req.body;

      const oauth2Client = new google.auth.OAuth2();
      oauth2Client.setCredentials({ access_token: accessToken });

      const sheets = google.sheets({ version: "v4", auth: oauth2Client });

      // Create spreadsheet
      const createResponse = await sheets.spreadsheets.create({
        requestBody: {
          properties: {
            title: title,
          },
          sheets: [
            {
              properties: {
                title: "Active CoC Applications",
                gridProperties: {
                  frozenRowCount: 1,
                  frozenColumnCount: 2,
                },
              },
            },
          ],
        },
      });

      const spreadsheetId = createResponse.data.spreadsheetId;
      const spreadsheetUrl = createResponse.data.spreadsheetUrl;

      if (!spreadsheetId) {
        throw new Error("Failed to obtain spreadsheetId from Google Sheets API");
      }

      // Headers definition
      const headers = [
        "Application Ref No",
        "Product Name",
        "Model Number",
        "Brand",
        "Certification Scheme",
        "Status",
        "Assigned SIRIM Officer",
        "Officer Email",
        "Email Subject / Thread Name",
        "Gmail Thread Link",
        "Submission Date",
        "Last Activity",
        "Target SLA Deadline",
        "Pending Action Items",
        "Action Assignee",
        "Priority",
        "Certificate No",
        "Certificate Expiry",
        "Fee (RM)",
        "Payment Status",
        "Notes / Summary",
        "Last Synced (UTC)",
      ];

      // Helper to determine email subject and gmail link
      const extractEmailMeta = (appItem: any) => {
        const emailSubject =
          appItem.emailSubject ||
          appItem.emailThreads?.[appItem.emailThreads.length - 1]?.subject ||
          appItem.timeline?.find((t: any) => t.emailSubject)?.emailSubject ||
          `SIRIM e-ComM: ${appItem.applicationRef || appItem.productName || "Update"}`;

        let gmailLink = appItem.gmailThreadLink || "";
        if (!gmailLink) {
          if (appItem.threadId && !appItem.threadId.startsWith("th_manual") && !appItem.threadId.startsWith("th_sirim")) {
            gmailLink = `https://mail.google.com/mail/u/0/#all/${appItem.threadId}`;
          } else {
            const query = appItem.applicationRef || appItem.emailSubject || appItem.modelNumber || "SIRIM";
            gmailLink = `https://mail.google.com/mail/u/0/#search/${encodeURIComponent(query)}`;
          }
        }
        return { emailSubject, gmailLink };
      };

      // Prepare initial data rows if provided
      const rowsData: any[][] = [headers];

      if (Array.isArray(initialRows) && initialRows.length > 0) {
        initialRows.forEach((appItem: any) => {
          const pendingActions = (appItem.actionItems || [])
            .filter((a: any) => !a.isCompleted)
            .map((a: any) => `• [${a.priority}] ${a.title}`)
            .join("\n");

          const primaryAssignee = (appItem.actionItems || []).find((a: any) => !a.isCompleted)?.assignedTo || "None";
          const maxPriority = (appItem.actionItems || []).find((a: any) => !a.isCompleted)?.priority || "LOW";
          const { emailSubject, gmailLink } = extractEmailMeta(appItem);

          rowsData.push([
            appItem.applicationRef || "",
            appItem.productName || "",
            appItem.modelNumber || "",
            appItem.brand || "",
            appItem.scheme || "",
            appItem.status || "",
            appItem.officerName || "",
            appItem.officerEmail || "",
            emailSubject,
            gmailLink,
            appItem.submissionDate || "",
            appItem.lastActivityDate || "",
            appItem.targetDeadline || "",
            pendingActions || "None (On Track)",
            primaryAssignee,
            maxPriority,
            appItem.certificateNo || "Pending Approval",
            appItem.certificateExpiryDate || "-",
            appItem.processingFeeRm ? Number(appItem.processingFeeRm) : "",
            appItem.paymentStatus || "NOT_APPLICABLE",
            appItem.notes || "",
            new Date().toISOString(),
          ]);
        });
      }

      // Write values
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: "'Active CoC Applications'!A1",
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: rowsData,
        },
      });

      // Format Sheet Header & Columns
      const firstSheetId = createResponse.data.sheets?.[0]?.properties?.sheetId || 0;

      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            // Header styling: Navy fill, white bold text, center align
            {
              repeatCell: {
                range: {
                  sheetId: firstSheetId,
                  startRowIndex: 0,
                  endRowIndex: 1,
                },
                cell: {
                  userEnteredFormat: {
                    backgroundColor: { red: 0.08, green: 0.18, blue: 0.36 }, // Navy blue
                    textFormat: {
                      foregroundColor: { red: 1.0, green: 1.0, blue: 1.0 },
                      bold: true,
                      fontSize: 10,
                    },
                    horizontalAlignment: "CENTER",
                    verticalAlignment: "MIDDLE",
                    wrapStrategy: "WRAP",
                  },
                },
                fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,wrapStrategy)",
              },
            },
            // Auto resize or set reasonable column heights
            {
              updateDimensionProperties: {
                range: {
                  sheetId: firstSheetId,
                  dimension: "ROWS",
                  startIndex: 0,
                  endIndex: 1,
                },
                properties: {
                  pixelSize: 42,
                },
                fields: "pixelSize",
              },
            },
            // Set text wrap on Action items, Email Subject, and Notes columns
            {
              repeatCell: {
                range: {
                  sheetId: firstSheetId,
                  startRowIndex: 1,
                  startColumnIndex: 8, // Email Subject
                  endColumnIndex: 10,  // Email Link
                },
                cell: {
                  userEnteredFormat: {
                    wrapStrategy: "WRAP",
                    verticalAlignment: "TOP",
                  },
                },
                fields: "userEnteredFormat(wrapStrategy,verticalAlignment)",
              },
            },
            {
              repeatCell: {
                range: {
                  sheetId: firstSheetId,
                  startRowIndex: 1,
                  startColumnIndex: 13, // Pending Action Items
                  endColumnIndex: 14,
                },
                cell: {
                  userEnteredFormat: {
                    wrapStrategy: "WRAP",
                    verticalAlignment: "TOP",
                  },
                },
                fields: "userEnteredFormat(wrapStrategy,verticalAlignment)",
              },
            },
          ],
        },
      });

      // Automatically register new sheet into central autonomous config
      try {
        const autoConfig = getStoredAutomationConfig();
        autoConfig.sheetConfig = {
          spreadsheetId,
          spreadsheetUrl,
          sheetName: "Active CoC Applications",
          autoSync: true,
          rowsCount: rowsData.length,
          lastSynced: new Date().toISOString(),
        };
        autoConfig.enabled = true;
        autoConfig.autoSyncGoogleSheet = true;
        saveStoredAutomationConfig(autoConfig);
      } catch (e) {}

      res.json({
        success: true,
        spreadsheetId,
        spreadsheetUrl,
        title,
        sheetName: "Active CoC Applications",
        totalRows: rowsData.length,
      });
    } catch (err: any) {
      console.error("Error in sheets/create:", err);
      res.status(500).json({
        error: "Failed to create Google Sheet",
        details: err?.message || String(err),
      });
    }
  });

  // ----------------------------------------------------
  // 4. Google Sheets: Sync / Update Existing Sheet
  // ----------------------------------------------------
  app.post("/api/sheets/sync", async (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Missing or invalid Google OAuth Authorization header" });
      }

      const accessToken = authHeader.split(" ")[1];
      const { spreadsheetId, applications = [], sheetName = "Active CoC Applications", userEmail } = req.body;

      if (!spreadsheetId) {
        return res.status(400).json({ error: "spreadsheetId is required" });
      }

      // Multi-User Safeguard: Merge with server-stored applications
      // Prevents overwriting team records if a user connects with an empty browser cache
      const serverStoredApps = getStoredApplications();
      let appsToSync: any[];
      if (!Array.isArray(applications) || applications.length === 0) {
        appsToSync = serverStoredApps;
      } else {
        appsToSync = mergeApplicationsList(serverStoredApps, applications, userEmail);
        saveStoredApplications(appsToSync);
      }

      const oauth2Client = new google.auth.OAuth2();
      oauth2Client.setCredentials({ access_token: accessToken });

      const sheets = google.sheets({ version: "v4", auth: oauth2Client });

      const headers = [
        "Application Ref No",
        "Product Name",
        "Model Number",
        "Brand",
        "Certification Scheme",
        "Status",
        "Assigned SIRIM Officer",
        "Officer Email",
        "Email Subject / Thread Name",
        "Gmail Thread Link",
        "Submission Date",
        "Last Activity",
        "Target SLA Deadline",
        "Pending Action Items",
        "Action Assignee",
        "Priority",
        "Certificate No",
        "Certificate Expiry",
        "Fee (RM)",
        "Payment Status",
        "Notes / Summary",
        "Last Synced (UTC)",
      ];

      const rowsData: any[][] = [headers];

      appsToSync.forEach((appItem: any) => {
        const pendingActions = (appItem.actionItems || [])
          .filter((a: any) => !a.isCompleted)
          .map((a: any) => `• [${a.priority}] ${a.title}`)
          .join("\n");

        const primaryAssignee = (appItem.actionItems || []).find((a: any) => !a.isCompleted)?.assignedTo || "None";
        const maxPriority = (appItem.actionItems || []).find((a: any) => !a.isCompleted)?.priority || "LOW";

        const emailSubject =
          appItem.emailSubject ||
          appItem.emailThreads?.[appItem.emailThreads.length - 1]?.subject ||
          appItem.timeline?.find((t: any) => t.emailSubject)?.emailSubject ||
          `SIRIM e-ComM: ${appItem.applicationRef || appItem.productName || "Update"}`;

        let gmailLink = appItem.gmailThreadLink || "";
        if (!gmailLink) {
          if (appItem.threadId && !appItem.threadId.startsWith("th_manual") && !appItem.threadId.startsWith("th_sirim")) {
            gmailLink = `https://mail.google.com/mail/u/0/#all/${appItem.threadId}`;
          } else {
            const query = appItem.applicationRef || appItem.emailSubject || appItem.modelNumber || "SIRIM";
            gmailLink = `https://mail.google.com/mail/u/0/#search/${encodeURIComponent(query)}`;
          }
        }

        rowsData.push([
          appItem.applicationRef || "",
          appItem.productName || "",
          appItem.modelNumber || "",
          appItem.brand || "",
          appItem.scheme || "",
          appItem.status || "",
          appItem.officerName || "",
          appItem.officerEmail || "",
          emailSubject,
          gmailLink,
          appItem.submissionDate || "",
          appItem.lastActivityDate || "",
          appItem.targetDeadline || "",
          pendingActions || "None (On Track)",
          primaryAssignee,
          maxPriority,
          appItem.certificateNo || "Pending Approval",
          appItem.certificateExpiryDate || "-",
          appItem.processingFeeRm ? Number(appItem.processingFeeRm) : "",
          appItem.paymentStatus || "NOT_APPLICABLE",
          appItem.notes || "",
          new Date().toISOString(),
        ]);
      });

      // Overwrite full values in the sheet
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `'${sheetName}'!A1`,
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: rowsData,
        },
      });

      recordTeamActivity({
        userEmail,
        actionType: "SHEET_SYNC",
        description: `${userEmail ? userEmail.split("@")[0] : "Team member"} synchronized ${appsToSync.length} applications to Google Sheet.`,
        details: { spreadsheetId, count: appsToSync.length },
      });

      res.json({
        success: true,
        spreadsheetId,
        syncedRowsCount: appsToSync.length,
        applications: appsToSync,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      console.error("Error in sheets/sync:", err);
      res.status(500).json({
        error: "Failed to sync to Google Sheet",
        details: err?.message || String(err),
      });
    }
  });

  // ----------------------------------------------------
  // 5. Gmail: Search Relevant Threads with Duration Filter
  // ----------------------------------------------------
  app.post("/api/gmail/search", async (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Missing or invalid Google OAuth Authorization header" });
      }

      const accessToken = authHeader.split(" ")[1];
      const {
        query: rawQuery = 'SIRIM OR eComM OR "Certificate of Conformity" OR "Type Approval" OR "SIRIM QAS" OR "SQAS"',
        maxResults = 50,
        daysBack: customDaysBack,
        scope = "routine", // 'first_time' | 'routine' | 'custom'
        filterUnrelated = true,
      } = req.body;

      // Determine daysBack: default 365 for first_time, 30 for routine
      const daysBack =
        customDaysBack !== undefined && customDaysBack !== null && !isNaN(Number(customDaysBack))
          ? Number(customDaysBack)
          : scope === "first_time"
          ? 365
          : 30;

      // Calculate cutoff date ISO
      const cutoffDate = new Date(Date.now() - daysBack * 86400000).toISOString().split("T")[0];

      // Build effective query with newer_than if not already specified, excluding Out of Office
      let effectiveQuery = String(rawQuery).trim();
      if (!effectiveQuery.includes("out of office")) {
        effectiveQuery = `(${effectiveQuery}) ${GMAIL_OOO_EXCLUSION_QUERY}`;
      }
      if (!effectiveQuery.includes("newer_than:") && !effectiveQuery.includes("after:")) {
        effectiveQuery = `(${effectiveQuery}) newer_than:${daysBack}d`;
      }

      const oauth2Client = new google.auth.OAuth2();
      oauth2Client.setCredentials({ access_token: accessToken });

      const gmail = google.gmail({ version: "v1", auth: oauth2Client });

      const requestedLimit = Math.max(Number(maxResults) || 50, 15);
      const searchRes = await gmail.users.threads.list({
        userId: "me",
        q: effectiveQuery,
        maxResults: Math.min(requestedLimit, 100),
      });

      const threads = searchRes.data.threads || [];
      const threadSummaries = [];

      // Fetch preview for threads up to requestedLimit
      const previewLimit = Math.min(threads.length, Math.max(requestedLimit, 50));
      for (const thread of threads.slice(0, previewLimit)) {
        if (!thread.id) continue;
        try {
          const detailRes = await gmail.users.threads.get({
            userId: "me",
            id: thread.id,
            format: "metadata",
            metadataHeaders: ["Subject", "From", "To", "Date", "Auto-Submitted", "X-Autoreply", "Precedence"],
          });

          const messages = detailRes.data.messages || [];
          if (messages.length === 0) continue;

          // Message 1 is the MAIN THREAD / original application message
          const firstMsg = messages[0] || {};
          // Message N is the LATEST UPDATE in the thread
          const lastMsg = messages[messages.length - 1] || firstMsg;
          const firstHeaders = firstMsg.payload?.headers || [];
          const lastHeaders = lastMsg.payload?.headers || [];

          const rootSubject = firstHeaders.find((h) => h.name?.toLowerCase() === "subject")?.value || "";
          const lastSubject = lastHeaders.find((h) => h.name?.toLowerCase() === "subject")?.value || rootSubject;
          const cleanSubject = rootSubject.replace(/^(?:re|fwd|fw):\s*/gi, "").trim() || rootSubject || lastSubject || "(No Subject)";

          const rootFrom = firstHeaders.find((h) => h.name?.toLowerCase() === "from")?.value || "Unknown";
          const lastFrom = lastHeaders.find((h) => h.name?.toLowerCase() === "from")?.value || rootFrom;

          const firstDate = firstHeaders.find((h) => h.name?.toLowerCase() === "date")?.value || "";
          const lastDate = lastHeaders.find((h) => h.name?.toLowerCase() === "date")?.value || firstDate;

          const rootSnippet = firstMsg.snippet || "";
          const lastSnippet = lastMsg.snippet || thread.snippet || rootSnippet;

          // Exclude thread if subject, headers, or snippet indicate Out of Office / auto-reply
          if (
            isOutOfOfficeSubject(cleanSubject) ||
            isOutOfOfficeSubject(rootSubject) ||
            isOutOfOfficeSubject(lastSubject) ||
            isOutOfOfficeMessage({ subject: cleanSubject, snippet: lastSnippet, headers: lastHeaders }) ||
            (messages.length === 1 && isOutOfOfficeText(rootSnippet))
          ) {
            console.log(`[Gmail Search] Excluded Out-of-Office thread ${thread.id}: "${cleanSubject}"`);
            continue;
          }

          // Evaluate SIRIM regulatory relevance & filter unrelated marketing/noise
          const sirimCheck = isSirimRegulatoryThread({
            subject: cleanSubject || lastSubject,
            from: rootFrom,
            to: firstHeaders.find((h) => h.name?.toLowerCase() === "to")?.value,
            snippet: `${rootSnippet} ${lastSnippet}`,
          });

          if (filterUnrelated && !sirimCheck.isRelated) {
            console.log(`[Gmail Search] Excluded unrelated non-regulatory thread ${thread.id}: "${cleanSubject}"`);
            continue;
          }

          threadSummaries.push({
            id: thread.id,
            // Primary representation defaults to the MAIN THREAD (first email) so user immediately sees the root application
            subject: cleanSubject,
            from: rootFrom,
            date: lastDate,
            firstDate: firstDate,
            snippet: rootSnippet || lastSnippet,
            messageCount: messages.length,
            // Granular breakdown of Main Thread vs Latest Update
            mainSubject: cleanSubject,
            mainFrom: rootFrom,
            mainDate: firstDate,
            mainSnippet: rootSnippet,
            latestSubject: lastSubject,
            latestFrom: lastFrom,
            latestDate: lastDate,
            latestSnippet: lastSnippet,
            isVerifiedSirim: sirimCheck.isRelated,
            relevanceScore: sirimCheck.confidence,
          });
        } catch (e) {
          console.warn(`Could not get metadata for thread ${thread.id}`, e);
        }
      }

      res.json({
        success: true,
        query: effectiveQuery,
        rawQuery,
        daysBack,
        dateThreshold: cutoffDate,
        scope,
        threads: threadSummaries,
        totalFound: threads.length,
      });
    } catch (err: any) {
      console.error("Error in gmail/search:", err);
      res.status(500).json({
        error: "Failed to search Gmail threads",
        details: err?.message || String(err),
      });
    }
  });

  // ----------------------------------------------------
  // 6. Gmail: Retrieve Full Thread Content for Ingest
  // ----------------------------------------------------
  app.post("/api/gmail/thread-details", async (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Missing or invalid Google OAuth Authorization header" });
      }

      const accessToken = authHeader.split(" ")[1];
      const { threadId } = req.body;

      if (!threadId) {
        return res.status(400).json({ error: "threadId is required" });
      }

      const oauth2Client = new google.auth.OAuth2();
      oauth2Client.setCredentials({ access_token: accessToken });

      const gmail = google.gmail({ version: "v1", auth: oauth2Client });

      const threadRes = await gmail.users.threads.get({
        userId: "me",
        id: threadId,
        format: "full",
      });

      const messages = threadRes.data.messages || [];
      const parsedMessages: any[] = [];

      for (const msg of messages) {
        const headers = msg.payload?.headers || [];
        const subject = headers.find((h) => h.name?.toLowerCase() === "subject")?.value || "";
        const from = headers.find((h) => h.name?.toLowerCase() === "from")?.value || "";
        const to = headers.find((h) => h.name?.toLowerCase() === "to")?.value || "";
        const date = headers.find((h) => h.name?.toLowerCase() === "date")?.value || "";

        // Extract body plain text or clean HTML text using recursive MIME traversal
        const extractedBody = extractEmailBodyText(msg.payload);
        const bodyText = extractedBody.trim().length > 0 ? extractedBody : (msg.snippet || "");
        const attachmentData = extractAttachments(msg.payload);

        parsedMessages.push({
          id: msg.id,
          messageId: msg.id,
          from,
          to,
          date,
          subject,
          snippet: msg.snippet || bodyText.slice(0, 120),
          bodyText,
          hasAttachments: attachmentData.hasAttachments,
          attachmentNames: attachmentData.attachmentNames,
        });
      }

      res.json({
        success: true,
        threadId,
        messages: parsedMessages,
      });
    } catch (err: any) {
      console.error("Error in gmail/thread-details:", err);
      res.status(500).json({
        error: "Failed to fetch thread details",
        details: err?.message || String(err),
      });
    }
  });

  // Helper: Create RFC 2822 compliant base64url encoded email
  function makeRawEmail(to: string, subject: string, bodyText: string, threadId?: string, inReplyTo?: string): string {
    const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString("base64")}?=`;
    const messageParts = [
      `To: ${to}`,
      `Subject: ${utf8Subject}`,
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: 7bit",
    ];
    if (inReplyTo) {
      messageParts.push(`In-Reply-To: ${inReplyTo}`);
      messageParts.push(`References: ${inReplyTo}`);
    }
    messageParts.push("");
    messageParts.push(bodyText);

    const message = messageParts.join("\r\n");
    return Buffer.from(message)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  }

  // ----------------------------------------------------
  // 6B. Gmail: Create Draft Directly in User's Inbox
  // ----------------------------------------------------
  app.post("/api/gmail/create-draft", async (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Missing or invalid Google OAuth Authorization header" });
      }

      const accessToken = authHeader.split(" ")[1];
      const { to, subject, body, threadId } = req.body;

      if (!to || !subject || !body) {
        return res.status(400).json({ error: "Recipient 'to', 'subject', and 'body' are required to create a Gmail draft." });
      }

      const oauth2Client = new google.auth.OAuth2();
      oauth2Client.setCredentials({ access_token: accessToken });
      const gmail = google.gmail({ version: "v1", auth: oauth2Client });

      const raw = makeRawEmail(to, subject, body, threadId);
      const draftRes = await gmail.users.drafts.create({
        userId: "me",
        requestBody: {
          message: {
            raw,
            threadId: threadId || undefined,
          },
        },
      });

      const draftId = draftRes.data.id;
      const gmailUrl = threadId
        ? `https://mail.google.com/mail/u/0/#all/${threadId}`
        : `https://mail.google.com/mail/u/0/#drafts`;

      res.json({
        success: true,
        draftId,
        threadId,
        gmailUrl,
        message: "Draft created in your Gmail inbox successfully!",
      });
    } catch (err: any) {
      console.error("Error creating Gmail draft:", err);
      res.status(500).json({
        error: "Failed to create draft in Gmail",
        details: err?.message || String(err),
      });
    }
  });

  // ----------------------------------------------------
  // 6C. Gmail: Send Official Email Directly
  // ----------------------------------------------------
  app.post("/api/gmail/send-email", async (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Missing or invalid Google OAuth Authorization header" });
      }

      const accessToken = authHeader.split(" ")[1];
      const { to, subject, body, threadId } = req.body;

      if (!to || !subject || !body) {
        return res.status(400).json({ error: "Recipient 'to', 'subject', and 'body' are required to send an email." });
      }

      const oauth2Client = new google.auth.OAuth2();
      oauth2Client.setCredentials({ access_token: accessToken });
      const gmail = google.gmail({ version: "v1", auth: oauth2Client });

      const raw = makeRawEmail(to, subject, body, threadId);
      const sendRes = await gmail.users.messages.send({
        userId: "me",
        requestBody: {
          raw,
          threadId: threadId || undefined,
        },
      });

      res.json({
        success: true,
        messageId: sendRes.data.id,
        threadId: sendRes.data.threadId,
        message: `Email successfully sent to ${to}!`,
      });
    } catch (err: any) {
      console.error("Error sending Gmail message:", err);
      res.status(500).json({
        error: "Failed to send email via Gmail",
        details: err?.message || String(err),
      });
    }
  });

  // ----------------------------------------------------
  // HTML escaping helper for Telegram Bot API
  // ----------------------------------------------------
  function escapeHtml(str: any): string {
    if (str === null || str === undefined) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  // ----------------------------------------------------
  // 7. Telegram Bot: Raw Message Sender Helper
  // ----------------------------------------------------
  async function sendTelegramRawMessage(
    botToken: string,
    chatId: string,
    text: string,
    options?: { topicId?: string; parseMode?: "HTML" | "Markdown" }
  ) {
    const token = (botToken || process.env.TELEGRAM_BOT_TOKEN || "").trim();
    let rawChat = (chatId || process.env.TELEGRAM_CHAT_ID || "").trim();
    let resolvedTopicId = (options?.topicId || process.env.TELEGRAM_TOPIC_ID || "").trim();

    // Support combined Chat ID and Topic ID formats like "-1001234567890:42" or "-1001234567890/42"
    if (rawChat.includes(":") || rawChat.includes("/")) {
      const delimiter = rawChat.includes(":") ? ":" : "/";
      const parts = rawChat.split(delimiter);
      rawChat = parts[0].trim();
      if (!resolvedTopicId && parts[1]) {
        resolvedTopicId = parts[1].trim();
      }
    }

    if (!token) {
      throw new Error("Telegram Bot Token is required. Please configure it in the Automation & Telegram Bot settings.");
    }
    if (!rawChat) {
      throw new Error("Telegram Chat ID is required. Please specify your Chat/Group ID in the Automation settings.");
    }

    const payload: any = {
      chat_id: rawChat,
      text,
      parse_mode: options?.parseMode || "HTML",
      disable_web_page_preview: false,
    };

    if (resolvedTopicId) {
      const parsedTopic = parseInt(resolvedTopicId, 10);
      if (!isNaN(parsedTopic)) {
        payload.message_thread_id = parsedTopic;
      }
    }

    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const resJson: any = await response.json();
    if (!response.ok || !resJson.ok) {
      // Fallback: If failed due to HTML parse error, strip HTML tags and retry as plain text
      const desc = resJson.description || "";
      if (payload.parse_mode && (desc.toLowerCase().includes("parse") || desc.toLowerCase().includes("entity"))) {
        console.warn("Telegram HTML parse error, retrying with plain text fallback:", desc);
        const plainText = text.replace(/<[^>]*>/g, "");
        const fallbackPayload = {
          ...payload,
          parse_mode: undefined,
          text: plainText,
        };
        const fallbackResponse = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(fallbackPayload),
        });
        const fallbackJson: any = await fallbackResponse.json();
        if (fallbackResponse.ok && fallbackJson.ok) {
          return fallbackJson;
        }
      }
      throw new Error(resJson.description || `Telegram API error (${response.status})`);
    }

    return resJson;
  }

  // ----------------------------------------------------
  // 8. Telegram Bot: Formatter for Daily Morning Briefing
  // ----------------------------------------------------
  function formatTelegramBriefing(
    applications: any[],
    options: {
      title?: string;
      sheetUrl?: string;
      newScannedCount?: number;
      isUrgentAlert?: boolean;
    }
  ) {
    const now = new Date();
    const dateStr = now.toLocaleDateString("en-GB", { timeZone: "Asia/Kuala_Lumpur", day: "2-digit", month: "short", year: "numeric" });
    const timeStr = now.toLocaleTimeString("en-GB", { timeZone: "Asia/Kuala_Lumpur", hour: "2-digit", minute: "2-digit" });

    const totalApps = applications.length;
    const rfiApps = applications.filter((a) => a.status === "RFI_ACTION_REQUIRED");
    const sampleApps = applications.filter((a) => a.status === "SAMPLE_REQUESTED");
    const pendingPaymentApps = applications.filter((a) => a.status === "PAYMENT_PENDING");
    const approvedApps = applications.filter((a) => a.status === "APPROVED");

    const headerEmoji = options.isUrgentAlert ? "🚨" : "🌅";
    const rawHeaderTitle = options.title || (options.isUrgentAlert ? "SIRIM CoC Urgent Action Alert" : "SIRIM CoC Daily Morning Briefing");
    const headerTitle = escapeHtml(rawHeaderTitle);

    let msg = `${headerEmoji} <b>${headerTitle}</b>\n`;
    msg += `🏢 <i>Cytron Technologies • Regulatory Compliance Register</i>\n`;
    msg += `📅 <b>Generated:</b> ${dateStr} at ${timeStr} (MYT)\n\n`;

    msg += `📊 <b>Status Snapshot:</b>\n`;
    msg += `• Total Monitored Applications: <b>${totalApps}</b>\n`;
    msg += `• ⚠️ RFI Action Required: <b>${rfiApps.length}</b>\n`;
    msg += `• 📦 Test Samples Due: <b>${sampleApps.length}</b>\n`;
    msg += `• 💳 Payment Pending: <b>${pendingPaymentApps.length}</b>\n`;
    msg += `• ✅ Approved / CoC Issued: <b>${approvedApps.length}</b>\n`;
    if (options.newScannedCount !== undefined && options.newScannedCount > 0) {
      msg += `• 📥 Newly Detected Inbound Updates: <b>${options.newScannedCount}</b>\n`;
    }
    msg += `\n`;

    // Urgent Action Items & RFIs
    const urgentQueue = applications.filter((a) =>
      a.status === "RFI_ACTION_REQUIRED" ||
      a.status === "SAMPLE_REQUESTED" ||
      a.status === "PAYMENT_PENDING" ||
      (a.actionItems && a.actionItems.some((act: any) => !act.isCompleted && (act.priority === "CRITICAL" || act.priority === "HIGH")))
    ).slice(0, 6);

    if (urgentQueue.length > 0) {
      msg += `🚨 <b>Action Items & Target Deadlines:</b>\n`;
      urgentQueue.forEach((app, idx) => {
        const pending = (app.actionItems || []).find((act: any) => !act.isCompleted);
        const rawActionText = pending ? pending.title : (app.notes || app.status);
        const actionText = escapeHtml(rawActionText);
        const officer = app.officerName ? ` (Officer: ${escapeHtml(app.officerName)})` : "";

        let statusBadge = "⚠️ RFI Required";
        if (app.status === "SAMPLE_REQUESTED") statusBadge = "📦 Sample Requested";
        else if (app.status === "PAYMENT_PENDING") statusBadge = "💳 Payment Due";
        else if (app.status === "TESTING_IN_PROGRESS") statusBadge = "🔬 Testing in Progress";

        const query = app.applicationRef || app.modelNumber || "SIRIM";
        const gmailLink = app.gmailThreadLink || `https://mail.google.com/mail/u/0/#search/${encodeURIComponent(query)}`;

        const refText = escapeHtml(app.applicationRef || "Ref N/A");
        const prodText = escapeHtml(app.productName || "Equipment");
        const modelText = escapeHtml(app.modelNumber || "Model N/A");

        msg += `<b>${idx + 1}. [${refText}]</b> ${prodText} (<code>${modelText}</code>)\n`;
        msg += `   • Status: <b>${statusBadge}</b>${officer}\n`;
        if (app.targetDeadline) {
          msg += `   • SLA Deadline: <b>${escapeHtml(app.targetDeadline)}</b>\n`;
        }
        msg += `   • Action: ${actionText}\n`;
        msg += `   • <a href="${gmailLink}">✉️ Open Gmail Thread</a>\n\n`;
      });
    } else {
      msg += `✨ <b>All Applications On Track!</b> No outstanding RFIs or immediate bottlenecks detected.\n\n`;
    }

    // AI Autonomous Progress Updates section if any items were auto-resolved by AI
    const autoResolvedItems = applications.flatMap((a) =>
      (a.actionItems || [])
        .filter((act: any) => act.isCompleted && act.autoResolvedByAi)
        .map((act: any) => ({ app: a, action: act }))
    ).slice(0, 5);

    if (autoResolvedItems.length > 0) {
      msg += `🤖 <b>AI Progress Tracker (Auto-Resolved from Emails):</b>\n`;
      autoResolvedItems.forEach((item, idx) => {
        const refName = escapeHtml(item.app.applicationRef || item.app.productName || "Application");
        const actTitle = escapeHtml(item.action.title || "Checklist Requirement");
        msg += `   ${idx + 1}. ✓ [${refName}] <b>${actTitle}</b>\n`;
        if (item.action.autoResolvedReason) {
          msg += `      ↳ <i>${escapeHtml(item.action.autoResolvedReason)}</i>\n`;
        }
      });
      msg += `\n`;
    }

    // Google Sheet link
    if (options.sheetUrl) {
      msg += `📈 <a href="${options.sheetUrl}"><b>📊 Open Master Google Sheet Register ↗</b></a>\n\n`;
    }
    msg += `🤖 <i>Automated by SIRIM CoC Intelligence Tracker Engine</i>`;

    return msg;
  }

  // ----------------------------------------------------
  // Automation Config Endpoints (Persistent Server Storage)
  // ----------------------------------------------------
  app.get("/api/automation/config", (req: Request, res: Response) => {
    res.json(redactConfig(getStoredAutomationConfig()));
  });

  app.post("/api/automation/config", (req: Request, res: Response) => {
    try {
      // The Gmail session can only be set through /api/automation/session; logs are server-owned.
      const { activeSession: _ignoredSession, logs: _ignoredLogs, ...incoming } = req.body || {};
      const current = getStoredAutomationConfig();
      const incomingTelegram = { ...(incoming.telegram || {}) };
      if (isMaskedOrEmpty(incomingTelegram.botToken)) delete incomingTelegram.botToken; // keep the saved token
      const updated = {
        ...current,
        ...incoming,
        telegram: {
          ...(current.telegram || {}),
          ...incomingTelegram,
        },
      };
      saveStoredAutomationConfig(updated);
      res.json({ success: true, config: redactConfig(updated) });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to save configuration", details: err?.message });
    }
  });

  // ----------------------------------------------------
  // Autonomous Agent: Session and Sheet Registration
  // ----------------------------------------------------
  app.post("/api/automation/session", async (req: Request, res: Response) => {
    try {
      const { accessToken, name, picture, expiresAt } = req.body;
      if (!accessToken) {
        return res.status(400).json({ error: "accessToken is required" });
      }
      // Only accept a Gmail token that belongs to the person who is signed in.
      const tokenEmail = await getAccessTokenEmail(accessToken);
      if (!tokenEmail || tokenEmail !== req.user?.email) {
        return res.status(403).json({ error: "This Google token does not belong to your signed-in account." });
      }
      const email = tokenEmail;

      const config = getStoredAutomationConfig();
      config.activeSession = {
        accessToken,
        email,
        name: name || "",
        picture: picture || "",
        expiresAt: expiresAt || Date.now() + 3600 * 1000,
        updatedAt: new Date().toISOString(),
      };
      config.enabled = true;
      config.autoScanGmail = true;
      config.autoProgressEvaluation = true;
      saveStoredAutomationConfig(config);

      // If Google Sheet is already configured, autonomously trigger a pipeline run immediately
      let triggeredAutonomousRun = false;
      if (config.sheetConfig?.spreadsheetId) {
        triggeredAutonomousRun = true;
        triggerAutonomousRunSafely("CREDENTIALS_LINKED", email);
      }

      res.json({
        success: true,
        message: "Google account authorized for autonomous agent.",
        triggeredAutonomousRun,
        config: redactConfig(config),
      });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to register session", details: err?.message });
    }
  });

  app.post("/api/automation/sheet-config", async (req: Request, res: Response) => {
    try {
      const { spreadsheetId, sheetName, spreadsheetUrl, autoSync = true } = req.body;
      if (!spreadsheetId) {
        return res.status(400).json({ error: "spreadsheetId is required" });
      }

      const config = getStoredAutomationConfig();
      config.sheetConfig = {
        spreadsheetId,
        sheetName: sheetName || "Active CoC Applications",
        spreadsheetUrl: spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
        autoSync: Boolean(autoSync),
        lastSynced: new Date().toISOString(),
      };
      config.enabled = true;
      config.autoSyncGoogleSheet = true;
      config.autoProgressEvaluation = true;
      saveStoredAutomationConfig(config);

      // If active session token is present, autonomously trigger an immediate pipeline run
      let triggeredAutonomousRun = false;
      if (config.activeSession?.accessToken) {
        triggeredAutonomousRun = true;
        triggerAutonomousRunSafely("SHEET_LINKED", config.activeSession.email);
      }

      res.json({
        success: true,
        message: "Google Sheet linked for autonomous agent.",
        triggeredAutonomousRun,
        config: redactConfig(config),
      });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to register sheet config", details: err?.message });
    }
  });

  app.post("/api/automation/sync-apps", (req: Request, res: Response) => {
    try {
      const { applications, userEmail } = req.body;
      if (Array.isArray(applications)) {
        const current = getStoredApplications();
        const merged = mergeApplicationsList(current, applications, userEmail);
        saveStoredApplications(merged);
        res.json({ success: true, count: merged.length, applications: merged });
      } else {
        res.status(400).json({ error: "Invalid applications array" });
      }
    } catch (err: any) {
      res.status(500).json({ error: "Failed to save applications", details: err?.message });
    }
  });

  // ----------------------------------------------------
  // Central Shared Multi-User Applications Store Endpoints
  // ----------------------------------------------------
  app.get("/api/applications", (req: Request, res: Response) => {
    try {
      const apps = getStoredApplications();
      res.json({
        success: true,
        applications: apps,
        count: apps.length,
        // Lets browsers drop apps a teammate deleted instead of re-uploading them.
        deleted: getDeletedApplications().map((d) => ({ id: d.id, applicationRef: d.applicationRef, threadId: d.threadId })),
        lastUpdated: fs.existsSync(APPS_FILE) ? fs.statSync(APPS_FILE).mtime.toISOString() : null,
      });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to retrieve applications", details: err?.message });
    }
  });

  app.post("/api/applications/save", (req: Request, res: Response) => {
    try {
      const { applications, merge = true, activitySummary, confirmClearAll } = req.body;
      const userEmail = req.user?.email || req.body.userEmail;
      if (!Array.isArray(applications)) {
        return res.status(400).json({ error: "Invalid applications array" });
      }

      let finalApps: any[] = [];
      if (merge === false) {
        // Full replacement is only used by "clear all"; require an explicit flag and keep a backup.
        if (confirmClearAll !== true) {
          return res.status(400).json({ error: "Replacing the whole store requires confirmClearAll: true" });
        }
        const current = getStoredApplications();
        backupApplicationsStore("clear-all");
        const keptIds = new Set(applications.map((a: any) => a?.id).filter(Boolean));
        recordDeletedApplications(current.filter((a: any) => !keptIds.has(a.id)), userEmail);
        finalApps = applications;
        recordTeamActivity({
          userEmail,
          actionType: "APP_DELETED",
          description: `${userEmail || "A team member"} cleared all applications from the shared database (backup saved in data/backups).`,
        });
      } else {
        const current = getStoredApplications();
        finalApps = mergeApplicationsList(current, applications, userEmail);
        if (activitySummary) {
          recordTeamActivity({
            userEmail,
            actionType: activitySummary.actionType || "APP_EDITED",
            applicationRef: activitySummary.applicationRef,
            productName: activitySummary.productName,
            description: activitySummary.description || `Updated application ${activitySummary.applicationRef || ""}`,
          });
        }
      }

      saveStoredApplications(finalApps);
      res.json({
        success: true,
        count: finalApps.length,
        applications: finalApps,
        deleted: getDeletedApplications().map((d) => ({ id: d.id, applicationRef: d.applicationRef, threadId: d.threadId })),
        savedAt: new Date().toISOString(),
      });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to save applications", details: err?.message });
    }
  });

  app.delete("/api/applications/:id", (req: Request, res: Response) => {
    try {
      const targetId = req.params.id;
      const userEmail = req.user?.email || "team-member";
      const current = getStoredApplications();
      const targets = current.filter((a: any) => a.id === targetId || a.applicationRef === targetId);
      if (targets.length === 0) {
        return res.json({ success: true, count: current.length });
      }
      backupApplicationsStore("delete");
      recordDeletedApplications(targets, userEmail);
      const filtered = current.filter((a: any) => !targets.includes(a));
      saveStoredApplications(filtered);

      for (const targetApp of targets) {
        recordTeamActivity({
          userEmail,
          actionType: "APP_DELETED",
          applicationRef: targetApp.applicationRef,
          productName: targetApp.productName,
          description: `${userEmail.split("@")[0]} removed application [${targetApp.applicationRef || targetApp.productName}] from the tracker.`,
        });
      }

      res.json({ success: true, count: filtered.length });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to delete application", details: err?.message });
    }
  });

  // ----------------------------------------------------
  // Autonomous AI Progress Evaluator for Application Checklist
  // Reads email threads to determine if pending actions are fulfilled,
  // automatically ticking checkmarks with source citations so humans don't have to.
  // ----------------------------------------------------
  app.post("/api/applications/:id/evaluate-progress", async (req: Request, res: Response) => {
    try {
      const appId = req.params.id;
      const { userEmail, application: clientApp } = req.body;

      const current = getStoredApplications();
      let targetIdx = current.findIndex((a: any) => a.id === appId || a.applicationRef === appId);
      let targetApp = targetIdx >= 0 ? current[targetIdx] : clientApp;

      if (!targetApp) {
        return res.status(404).json({ error: "Application not found" });
      }

      // Check for incomplete items
      const existingActions = targetApp.actionItems || [];
      const incompleteActions = existingActions.filter((a: any) => !a.isCompleted);

      if (incompleteActions.length === 0) {
        return res.json({
          success: true,
          message: "All checklist items are already marked completed.",
          resolvedCount: 0,
          updatedApplication: targetApp,
        });
      }

      // Gather email thread context
      const emailThreads = targetApp.emailThreads || [];
      const threadTranscript = emailThreads
        .map((m: any, idx: number) => {
          return `--- Email Message ${idx + 1} ---
Date: ${m.date || "N/A"}
From: ${m.from || "N/A"} (Role: ${m.senderRole || "UNKNOWN"})
To: ${m.to || "N/A"}
Subject: ${m.subject || "N/A"}
Snippet/Body:
${m.body || m.snippet || "(No body)"}
`;
        })
        .join("\n\n");

      const notesContext = targetApp.notes ? `\nApplication Notes / Latest Summary:\n${targetApp.notes}` : "";

      const ai = getGeminiClient();
      const prompt = `You are an autonomous AI Regulatory Compliance Officer for Cytron Technologies Sdn Bhd.
Your job is to read recent email communications regarding SIRIM QAS / e-ComM Type Approval certification and autonomously evaluate whether any pending requirements, RFIs, or checklist action items have been fulfilled, answered, or resolved in the emails.

APPLICATION CONTEXT:
- Reference: ${targetApp.applicationRef || "N/A"}
- Product: ${targetApp.productName || "N/A"} (${targetApp.modelNumber || "N/A"})
- Current Status: ${targetApp.status || "N/A"}
- Officer: ${targetApp.officerName || "N/A"} (${targetApp.officerEmail || "N/A"})
- Supplier: ${targetApp.supplierName || "N/A"}
- Courier Tracking: ${targetApp.courierTracking || "N/A"}
${notesContext}

PENDING CHECKLIST / ACTION ITEMS TO EVALUATE:
${JSON.stringify(
  incompleteActions.map((a: any) => ({
    id: a.id,
    title: a.title,
    description: a.description,
    assignedTo: a.assignedTo,
    requiredActionType: a.requiredActionType,
    itemCategory: a.itemCategory,
  })),
  null,
  2
)}

EMAIL THREAD TRANSCRIPTS:
${threadTranscript || "No email transcript provided. Evaluate based on current status and application notes."}

EVALUATION RULES:
1. Examine if recent emails provide evidence that an action item is fulfilled:
   - For document requests (e.g. schematics, test reports, Declaration of Conformity): Did supplier send them or did applicant submit them to SIRIM?
   - For sample delivery: Did applicant provide courier tracking (PosLaju, GDEX, DHL) or did SIRIM acknowledge receiving the test sample?
   - For fee payment: Was payment receipt sent or acknowledged?
   - For waiting on supplier: Did supplier deliver the requested technical data/lab reports?
   - For waiting on SIRIM / agent (incl. a question Cytron asked, e.g. "can we apply under one model?"): Did the officer or agent actually answer? A message sent BY Cytron never resolves a waiting item.
   - If the application status is 'APPROVED', all submission and testing actions are considered resolved.
2. If an action item is resolved, provide:
   - "actionId": the exact id of the action item
   - "isResolved": true
   - "reason": A crisp explanation explaining how the email proved fulfillment (e.g. "Auto-resolved: Supplier provided EMC test report and Declaration of Conformity; submitted to SIRIM officer.")
3. Only mark as resolved if there is plausible proof or status progression. If still pending response, do not mark resolved.

Return a JSON object with:
- "evaluations": Array of { "actionId": string, "isResolved": boolean, "reason": string }
- "overallProgressSummary": string`;

      let evaluations: Array<{ actionId: string; isResolved: boolean; reason: string }> = [];
      let progressSummary = "";

      try {
        const response = await generateContentWithRetryAndFallback(
          ai,
          "gemini-3.8-flash",
          prompt,
          {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                evaluations: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      actionId: { type: Type.STRING },
                      isResolved: { type: Type.BOOLEAN },
                      reason: { type: Type.STRING },
                    },
                    required: ["actionId", "isResolved", "reason"],
                  },
                },
                overallProgressSummary: { type: Type.STRING },
              },
              required: ["evaluations", "overallProgressSummary"],
            },
          },
          "gemini-3.1-flash-lite"
        );

        const parsed = JSON.parse(response.text?.trim() || "{}");
        evaluations = parsed.evaluations || [];
        progressSummary = parsed.overallProgressSummary || "";
      } catch (geminiErr: any) {
        console.warn("AI progress evaluation fallback:", geminiErr?.message || geminiErr);
        // Heuristic fallback evaluation
        evaluations = incompleteActions.map((act: any) => {
          let resolved = false;
          let reason = "";

          if (targetApp.status === "APPROVED") {
            resolved = true;
            reason = "Auto-resolved: Certification granted (Certificate of Conformity issued).";
          } else if (
            (act.requiredActionType === "SEND_SAMPLE" || act.title.toLowerCase().includes("sample")) &&
            (targetApp.status === "SAMPLE_SUBMITTED" || targetApp.status === "TESTING_IN_PROGRESS" || targetApp.courierTracking)
          ) {
            resolved = true;
            reason = `Auto-resolved: Test sample dispatched${targetApp.courierTracking ? ` (Tracking: ${targetApp.courierTracking})` : ""}.`;
          } else if (
            (act.requiredActionType === "PAY_FEE" || act.title.toLowerCase().includes("payment")) &&
            (targetApp.paymentStatus === "PAID" || POST_PAYMENT_STATUSES.has(targetApp.status))
          ) {
            resolved = true;
            reason = "Auto-resolved: Payment settled or acknowledged by SIRIM finance.";
          } else if (
            (act.requiredActionType === "WAITING_SUPPLIER" || act.assignedTo === "SUPPLIER") &&
            (targetApp.supplierStatus === "DOCUMENTS_RECEIVED_FROM_SUPPLIER" || targetApp.supplierStatus === "DOCUMENTS_SUBMITTED_TO_SIRIM")
          ) {
            resolved = true;
            reason = "Auto-resolved: Supplier delivered requested technical documents.";
          }

          return {
            actionId: act.id,
            isResolved: resolved,
            reason: reason || "Awaiting further confirmation.",
          };
        });
      }

      // Apply resolution to target application
      let resolvedCount = 0;
      const updatedActionItems = existingActions.map((item: any) => {
        if (item.isCompleted) return item;
        const evalItem = evaluations.find((e) => e.actionId === item.id && e.isResolved);
        if (evalItem) {
          resolvedCount++;
          return {
            ...item,
            isCompleted: true,
            completedAt: new Date().toISOString(),
            completedBy: "AI Autonomous Engine",
            autoResolvedByAi: true,
            autoResolvedAt: new Date().toISOString(),
            autoResolvedReason: evalItem.reason || "Auto-resolved by AI based on email progress verification.",
            updatedAt: new Date().toISOString(),
          };
        }
        return item;
      });

      targetApp = {
        ...targetApp,
        actionItems: updatedActionItems,
        ...(resolvedCount > 0 ? { lastModifiedAt: new Date().toISOString(), lastModifiedBy: "AI Autonomous Engine" } : {}),
      };

      if (targetIdx >= 0) {
        current[targetIdx] = targetApp;
        saveStoredApplications(current);
      } else {
        current.unshift(targetApp);
        saveStoredApplications(current);
      }

      if (resolvedCount > 0) {
        recordTeamActivity({
          userEmail: userEmail || "AI Engine",
          actionType: "ACTION_TOGGLE",
          applicationRef: targetApp.applicationRef,
          productName: targetApp.productName,
          description: `🤖 AI Progress Engine auto-resolved ${resolvedCount} checklist item(s) for [${targetApp.applicationRef || targetApp.productName}].`,
        });
      }

      res.json({
        success: true,
        resolvedCount,
        progressSummary,
        evaluations,
        updatedApplication: targetApp,
        message:
          resolvedCount > 0
            ? `AI verified progress from emails and auto-completed ${resolvedCount} checklist item(s)!`
            : "AI scanned the emails: No newly fulfilled items detected yet. Remaining items are still awaiting response.",
      });
    } catch (err: any) {
      console.error("Error evaluating progress:", err);
      res.status(500).json({ error: "Failed to evaluate application progress", details: err?.message || err });
    }
  });

  // ----------------------------------------------------
  // Team Presence & Active Collaborators Endpoints
  // ----------------------------------------------------
  app.get("/api/presence", (req: Request, res: Response) => {
    try {
      const activeUsers = getStoredPresence();
      res.json({ success: true, activeUsers });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to retrieve presence", details: err?.message });
    }
  });

  app.post("/api/presence/heartbeat", (req: Request, res: Response) => {
    try {
      const { email, name, picture, activeAction } = req.body;
      if (!email) {
        return res.status(400).json({ error: "Email is required for heartbeat" });
      }
      const activeUsers = recordUserPresence({ email, name, picture, activeAction });
      res.json({ success: true, activeUsers });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to update heartbeat", details: err?.message });
    }
  });

  app.post("/api/presence/reset", (req: Request, res: Response) => {
    try {
      const { email } = req.body || {};
      let current = getStoredPresence();
      if (email) {
        current = current.filter((u: any) => u.email.toLowerCase() !== email.toLowerCase());
      } else {
        current = [];
      }
      fs.writeFileSync(PRESENCE_FILE, JSON.stringify(current, null, 2), "utf8");
      res.json({ success: true, activeUsers: current });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to reset presence", details: err?.message });
    }
  });

  app.delete("/api/presence", (req: Request, res: Response) => {
    try {
      fs.writeFileSync(PRESENCE_FILE, "[]\n", "utf8");
      res.json({ success: true, activeUsers: [] });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to clear presence", details: err?.message });
    }
  });

  // ----------------------------------------------------
  // Team Activity / Audit Trail Endpoints
  // ----------------------------------------------------
  app.get("/api/team-activity", (req: Request, res: Response) => {
    try {
      const activities = getStoredTeamActivity();
      res.json({ success: true, activities });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to retrieve activity log", details: err?.message });
    }
  });

  app.post("/api/team-activity", (req: Request, res: Response) => {
    try {
      const entry = req.body;
      if (!entry || !entry.description) {
        return res.status(400).json({ error: "Activity description is required" });
      }
      const recorded = recordTeamActivity(entry);
      res.json({ success: true, activity: recorded });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to record activity", details: err?.message });
    }
  });

  // ----------------------------------------------------
  // 9. Telegram API: Test Connection Endpoint
  // ----------------------------------------------------
  app.post("/api/telegram/test", async (req: Request, res: Response) => {
    try {
      const { botToken, chatId, topicId } = req.body;
      const token = resolveBotToken(botToken);
      const chat = (chatId || process.env.TELEGRAM_CHAT_ID || "").trim();

      const testMessage = `✅ <b>SIRIM CoC Tracker — Telegram Connection Verified!</b>\n\n` +
        `Your Telegram bot is successfully connected and configured to receive:\n` +
        `• 🌅 Daily Morning Status Digests & Summaries\n` +
        `• 🚨 Instant alerts for SIRIM RFIs & Clarification requests\n` +
        `• 📦 Sample Call Notices & Lab Delivery Deadlines\n` +
        `• 📊 Auto-updated Google Sheet direct links\n\n` +
        `<i>Time: ${new Date().toLocaleTimeString("en-GB", { timeZone: "Asia/Kuala_Lumpur" })} MYT</i>`;

      const tgResult = await sendTelegramRawMessage(token, chat, testMessage, { topicId });
      res.json({ success: true, result: tgResult });
    } catch (err: any) {
      console.error("Error in telegram/test:", err);
      res.status(400).json({
        error: "Failed to send Telegram test message",
        details: err?.message || String(err),
      });
    }
  });

  // ----------------------------------------------------
  // 10. Telegram API: Send Custom or Digest Message
  // ----------------------------------------------------
  app.post("/api/telegram/send", async (req: Request, res: Response) => {
    try {
      const { botToken, chatId, topicId, message, applications, sheetUrl, title, isUrgentAlert } = req.body;
      const token = resolveBotToken(botToken);
      const chat = (chatId || process.env.TELEGRAM_CHAT_ID || "").trim();

      let textToSend = message;
      if (!textToSend && Array.isArray(applications)) {
        textToSend = formatTelegramBriefing(applications, {
          title,
          sheetUrl,
          isUrgentAlert,
        });
      }

      if (!textToSend) {
        return res.status(400).json({ error: "Either message text or applications array is required" });
      }

      const tgResult = await sendTelegramRawMessage(token, chat, textToSend, { topicId });
      res.json({ success: true, result: tgResult });
    } catch (err: any) {
      console.error("Error in telegram/send:", err);
      res.status(400).json({
        error: "Failed to send Telegram message",
        details: err?.message || String(err),
      });
    }
  });

  // ----------------------------------------------------
  // 11. Telegram API: Instant Critical Alert Endpoint
  // ----------------------------------------------------
  app.post("/api/telegram/alert", async (req: Request, res: Response) => {
    try {
      const { botToken, chatId, topicId, application, message } = req.body;
      const tgBotToken = resolveBotToken(botToken);
      const tgChatId = (chatId || process.env.TELEGRAM_CHAT_ID || "").trim();

      if (!tgBotToken || !tgChatId) {
        return res.status(400).json({ error: "Telegram Bot Token and Chat ID are required." });
      }

      let text = message;
      if (!text && application) {
        const query = application.applicationRef || application.modelNumber || "SIRIM";
        const gmailLink = application.gmailThreadLink || `https://mail.google.com/mail/u/0/#search/${encodeURIComponent(query)}`;
        const pending = (application.actionItems || []).find((act: any) => !act.isCompleted);
        const rawActionText = pending ? pending.title : (application.notes || "Immediate review required");

        let statusBadge = "⚠️ RFI Required";
        if (application.status === "SAMPLE_REQUESTED") statusBadge = "📦 Sample Requested";
        else if (application.status === "PAYMENT_PENDING") statusBadge = "💳 Payment Due";
        else if (application.status === "TESTING_IN_PROGRESS") statusBadge = "🔬 Testing in Progress";

        text = `🚨 <b>SIRIM CoC URGENT ACTION ALERT</b>\n` +
          `🏢 <i>Cytron Technologies • Regulatory Compliance Register</i>\n\n` +
          `📁 <b>Application Ref:</b> <code>${escapeHtml(application.applicationRef || "Ref Pending")}</code>\n` +
          `📦 <b>Product:</b> <b>${escapeHtml(application.productName || "Equipment")}</b> (<code>${escapeHtml(application.modelNumber || "Model N/A")}</code>)\n` +
          `⚠️ <b>Current Status:</b> <b>${statusBadge}</b>\n` +
          (application.targetDeadline ? `⏰ <b>Target SLA Deadline:</b> <b>${escapeHtml(application.targetDeadline)}</b>\n` : "") +
          (application.officerName ? `👤 <b>Assigned Officer:</b> ${escapeHtml(application.officerName)}\n` : "") +
          `\n⚡ <b>Required Next Action:</b>\n${escapeHtml(rawActionText)}\n\n` +
          `✉️ <a href="${gmailLink}">Open Inbound Gmail Correspondence ↗</a>`;
      }

      if (!text) {
        return res.status(400).json({ error: "Either message or application is required" });
      }

      const tgResult = await sendTelegramRawMessage(tgBotToken, tgChatId, text, { topicId });
      res.json({ success: true, result: tgResult });
    } catch (err: any) {
      console.error("Error in telegram/alert:", err);
      res.status(400).json({ error: "Failed to send Telegram alert", details: err?.message || String(err) });
    }
  });

  // ----------------------------------------------------
  // 11. Autonomous Compliance Engine: Core End-to-End Pipeline
  // ----------------------------------------------------
  interface AutonomousPipelineParams {
    applications?: any[];
    sheetConfig?: any;
    spreadsheetId?: string;
    sheetName?: string;
    spreadsheetUrl?: string;
    telegramConfig?: any;
    autoScanGmail?: boolean;
    autoSyncSheet?: boolean;
    autoSendTelegram?: boolean;
    options?: any;
    userEmail?: string;
    accessToken?: string | null;
    triggerSource?: string;
  }

  async function runAutonomousPipelineCore(params: AutonomousPipelineParams = {}) {
    const logs: Array<{ timestamp: string; type: string; status: string; message: string; details?: string }> = [];
    const addLog = (type: string, status: string, message: string, details?: string) => {
      logs.push({
        timestamp: new Date().toISOString(),
        type,
        status,
        message,
        details,
      });
    };

    const storedConfig = getStoredAutomationConfig();
    const triggerSource = params.triggerSource || "AUTONOMOUS_DAEMON";

    try {
      const {
        applications = [],
        sheetConfig: directSheetConfig,
        spreadsheetId,
        sheetName,
        spreadsheetUrl,
        telegramConfig: directTelegramConfig,
        autoScanGmail: directAutoScan,
        autoSyncSheet: directAutoSync,
        autoSendTelegram: directAutoTelegram,
        options = {},
      } = params;

      // The stored Google token lasts ~1 hour (no refresh token). Don't use it once expired.
      const storedSession = storedConfig.activeSession;
      const storedTokenValid = Boolean(storedSession?.accessToken && (!storedSession.expiresAt || Date.now() < storedSession.expiresAt));
      const accessToken = params.accessToken || (storedTokenValid ? storedSession.accessToken : null);
      const userEmail = params.userEmail || storedConfig.activeSession?.email || "autonomous-agent@cytron.io";

      const sheetConfig = directSheetConfig || (spreadsheetId ? {
        spreadsheetId,
        sheetName: sheetName || "Active CoC Applications",
        spreadsheetUrl: spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
      } : null) || storedConfig.sheetConfig || null;

      const telegramConfig = directTelegramConfig || storedConfig.telegram || null;

      const autoScanGmail = options.autoScanGmail !== undefined ? options.autoScanGmail : (directAutoScan !== undefined ? directAutoScan : (storedConfig.autoScanGmail ?? true));
      const autoSyncSheet = options.autoSyncSheet !== undefined ? options.autoSyncSheet : (directAutoSync !== undefined ? directAutoSync : (storedConfig.autoSyncGoogleSheet ?? true));
      const autoSendTelegram = options.autoSendTelegram !== undefined ? options.autoSendTelegram : (directAutoTelegram !== undefined ? directAutoTelegram : (storedConfig.autoSendTelegram ?? true));

      // Load stored automation config to check first-time vs routine policy
      const isFirstScan = options.isFirstScan !== undefined
        ? Boolean(options.isFirstScan)
        : !storedConfig.hasCompletedFirstScan;

      // Scan duration in days: 365 days (1 whole year) for first-time scan, 30 days (1 month) for routine scan
      const scanDays = options.scanDays
        ? Number(options.scanDays)
        : isFirstScan
        ? (storedConfig.firstScanDurationDays || 365)
        : (storedConfig.routineScanDurationDays || 30);

      // Multi-User Central Store: Merge client payload with server-stored applications
      const serverApps = getStoredApplications();
      let currentApplications = mergeApplicationsList(serverApps, applications, userEmail);
      let newEmailsDetected = 0;

      addLog("SYSTEM", "INFO", `Started automated SIRIM synchronization cycle (${triggerSource}: ${isFirstScan ? "First-Time Historical Mode" : "Routine Scan Mode"}).`);

      // STEP 1: Scan Gmail if access token provided & autoScan enabled
      if (autoScanGmail && accessToken) {
        if (isFirstScan) {
          addLog("SCAN", "INFO", `[First-Time Scan] Scanning 1 whole year (${scanDays} days) of SIRIM QAS & e-ComM email archives (newer_than:${scanDays}d)...`);
        } else {
          addLog("SCAN", "INFO", `[Routine Scan] Scanning past 1 month (${scanDays} days) of active SIRIM updates & RFIs (newer_than:${scanDays}d)...`);
        }

        try {
          const oauth2Client = new google.auth.OAuth2();
          oauth2Client.setCredentials({ access_token: accessToken });
          const gmail = google.gmail({ version: "v1", auth: oauth2Client });

          // Construct query respecting first-time (365d) vs routine (30d) duration, strictly excluding Out of Office
          const queryBase = `(from:sirim.my OR subject:sirim OR subject:ecomm OR subject:sqas OR subject:"Type Approval" OR subject:"Certificate of Conformity" OR "Certificate of Conformity") ${GMAIL_OOO_EXCLUSION_QUERY}`;
          const scanQuery = options.scanQuery
            ? (options.scanQuery.includes("out of office") ? options.scanQuery : `(${options.scanQuery}) ${GMAIL_OOO_EXCLUSION_QUERY}`)
            : `(${queryBase}) newer_than:${scanDays}d`;
          const maxThreadSearch = isFirstScan ? 35 : 15;

          const searchRes = await gmail.users.threads.list({
            userId: "me",
            q: scanQuery,
            maxResults: maxThreadSearch,
          });

          const foundThreads = searchRes.data.threads || [];
          addLog("SCAN", "SUCCESS", `Found ${foundThreads.length} email threads in Gmail within past ${scanDays} days.`);

          // Process threads (capped to ensure rapid completion without hitting proxy timeouts)
          const processLimit = isFirstScan ? Math.min(foundThreads.length, 6) : Math.min(foundThreads.length, 5);
          const scanStartTime = Date.now();
          const MAX_SCAN_DURATION_MS = 25000; // Never run for more than 25s so HTTP response returns safely

          for (const thread of foundThreads.slice(0, processLimit)) {
            if (!thread.id) continue;
            if (Date.now() - scanStartTime > MAX_SCAN_DURATION_MS) {
              addLog("SCAN", "INFO", "Scan batch time limit reached; continuing with current results.");
              break;
            }

            try {
              const threadRes = await gmail.users.threads.get({
                userId: "me",
                id: thread.id,
                format: "full",
              });

              const messages = threadRes.data.messages || [];
              if (messages.length === 0) continue;

              const lastMsg = messages[messages.length - 1];
              const firstMsg = messages[0];
              if (!lastMsg) continue;

              const lastHeaders = lastMsg.payload?.headers || [];
              const firstHeaders = firstMsg.payload?.headers || [];
              const rootSubject = firstHeaders.find((h) => h.name?.toLowerCase() === "subject")?.value || "";
              const lastSubject = lastHeaders.find((h) => h.name?.toLowerCase() === "subject")?.value || rootSubject;
              const subject = rootSubject.replace(/^(?:re|fwd|fw):\s*/gi, "").trim() || rootSubject || lastSubject || "(No Subject)";
              const from = firstHeaders.find((h) => h.name?.toLowerCase() === "from")?.value || lastHeaders.find((h) => h.name?.toLowerCase() === "from")?.value || "";
              const lastDate = lastHeaders.find((h) => h.name?.toLowerCase() === "date")?.value || "";
              const firstDate = firstHeaders.find((h) => h.name?.toLowerCase() === "date")?.value || lastDate;

              // Check if entire thread or subject indicates Out-of-Office auto-reply
              if (
                isOutOfOfficeSubject(subject) ||
                isOutOfOfficeSubject(rootSubject) ||
                isOutOfOfficeSubject(lastSubject) ||
                isOutOfOfficeMessage({ subject, snippet: threadRes.data.snippet || lastMsg.snippet, headers: lastHeaders })
              ) {
                addLog("SCAN", "INFO", `[Excluded] Skipped Out-of-Office auto-reply thread: "${subject}"`);
                continue;
              }

              // Check regulatory relevance & filter unrelated marketing/noise
              const sirimCheck = isSirimRegulatoryThread({
                subject,
                from,
                snippet: threadRes.data.snippet || lastMsg.snippet,
              });
              if (!sirimCheck.isRelated) {
                addLog("SCAN", "INFO", `[Excluded] Skipped unrelated non-regulatory thread: "${subject}"`);
                continue;
              }

              // Filter out trailing/individual Out-of-Office auto-reply messages from this thread
              const substantiveMessages = messages.filter((m: any) => {
                const mHeaders = m.payload?.headers || [];
                const mSub = mHeaders.find((h: any) => h.name?.toLowerCase() === "subject")?.value || "";
                return !isOutOfOfficeMessage({ subject: mSub, snippet: m.snippet, headers: mHeaders });
              });

              if (substantiveMessages.length === 0) {
                addLog("SCAN", "INFO", `[Excluded] Skipped thread containing only Out-of-Office auto-replies: "${subject}"`);
                continue;
              }

              const activeMessages = substantiveMessages;
              const effectiveLastMsg = activeMessages[activeMessages.length - 1] || lastMsg;
              const effectiveLastHeaders = effectiveLastMsg.payload?.headers || lastHeaders;
              const effectiveLastDate = effectiveLastHeaders.find((h: any) => h.name?.toLowerCase() === "date")?.value || lastDate;

              // Determine if this thread matches an existing application
              const existingIdx = currentApplications.findIndex(
                (a) => a.threadId === thread.id || (a.applicationRef && subject.toLowerCase().includes(a.applicationRef.toLowerCase()))
              );
              const existingApp = existingIdx >= 0 ? currentApplications[existingIdx] : null;

              // Don't re-create an application the team deleted.
              if (!existingApp && isDeletedApplication({ threadId: thread.id })) {
                continue;
              }

              // If existing application already has all messages from this thread, skip heavy AI re-parsing
              const existingMsgCount = existingApp?.emailThreads?.length || 0;
              const hasNewMessages = !existingApp || activeMessages.length > existingMsgCount || !existingApp.lastActivityDate;
              if (existingApp && !hasNewMessages && !options.forceRefresh) {
                continue;
              }

              // Extract text across substantive messages in chronological sequence
              const threadTranscript = activeMessages.map((m: any, mIdx: number) => {
                const mHeaders = m.payload?.headers || [];
                const mFrom = mHeaders.find((h: any) => h.name?.toLowerCase() === "from")?.value || "Unknown";
                const mTo = mHeaders.find((h: any) => h.name?.toLowerCase() === "to")?.value || "";
                const mDate = mHeaders.find((h: any) => h.name?.toLowerCase() === "date")?.value || "";
                const mSub = mHeaders.find((h: any) => h.name?.toLowerCase() === "subject")?.value || "";
                const extracted = extractEmailBodyText(m.payload);
                const text = extracted.trim().length > 0 ? extracted : (m.snippet || "");
                const isFirst = mIdx === 0;
                const isLatest = mIdx === activeMessages.length - 1;
                const tag = isFirst
                  ? " [ORIGINAL / MAIN APPLICATION MESSAGE - CONTAINS APPLICATION REF, PRODUCT & MODEL]"
                  : isLatest
                  ? " [LATEST MESSAGE IN THREAD - DETERMINES CURRENT STATUS]"
                  : "";
                return `=== MESSAGE ${mIdx + 1} OF ${activeMessages.length}${tag} ===
FROM: ${mFrom}
TO: ${mTo}
DATE: ${mDate}
SUBJECT: ${mSub}

BODY:
${text}`;
              }).join("\n\n------------------------------------------------------------\n\n");

              // Parse with AI parser (with 9s strict timeout) / fallback heuristic parser
              let parsed: any = null;
              try {
                const ai = getGeminiClient();
                const prompt = `You are an expert Malaysian regulatory compliance specialist in SIRIM QAS International, e-ComM (MCMC), CIDB, and Certificate of Conformity (CoC) certification procedures.
Analyze this multi-stage Malaysian SIRIM certification email thread (${messages.length} messages, dating from ${firstDate} to ${lastDate}):
Main Thread Subject: ${subject}
Existing Status: ${existingApp?.status || "None"}

CRITICAL INSTRUCTION - MAIN THREAD (MESSAGE 1) vs REPLIES (MESSAGE 2+):
1. THE MAIN THREAD (MESSAGE 1) contains the core product identity:
   - Extract 'applicationRef', 'productName', 'modelNumber', 'brand', and 'scheme' from MESSAGE 1.
   - Clean product name so it represents the physical equipment.
2. THE LATEST MESSAGE (MESSAGE N) determines current 'status', 'statusExplanation', and pending 'actionItems'.

${ACTION_DIRECTION_RULES}

EXISTING OPEN ITEMS (use exact titles in resolvedRequirements when the thread shows they are done / answered):
${JSON.stringify((existingApp?.actionItems || []).filter((a: any) => !a.isCompleted).map((a: any) => ({ title: a.title, category: a.itemCategory, assignedTo: a.assignedTo, type: a.requiredActionType })))}

CRITICAL STATUS CLASSIFICATION RULES (BASED ON THE LATEST STATE):
- 'RFI_ACTION_REQUIRED':
  CHOOSE THIS whenever the SIRIM officer, e-ComM officer, or testing lab is requesting technical documents, reports, or clarifications. This includes:
  * RF test reports, EMC test reports, Safety test reports (MS IEC 62368-1), SAR reports.
  * Product schematics, PCB layout, block diagram, technical specifications, user manual, datasheet.
  * Declaration of Conformity (DoC), Letter of Authorization, brand authorization.
  * Exterior/interior product photos, marking/label artwork, rating plate drawings.
  * Any written clarifications, answers to officer queries, or amendments.
  IMPORTANT: Even if an invoice number, quotation, or processing fee is mentioned in the thread or in a quotation table, IF SIRIM IS REQUESTING TECHNICAL DOCUMENTS OR TEST REPORTS, THE STATUS MUST BE 'RFI_ACTION_REQUIRED' (NOT 'PAYMENT_PENDING')!

- 'PAYMENT_PENDING':
  ONLY choose this if paying an outstanding invoice/fee or uploading payment receipt is the EXCLUSIVE or PRIMARY pending action, and SIRIM is NOT waiting for technical documents or test reports.

- 'UNDER_REVIEW':
  Choose this if the application is undergoing initial technical review, OR if the applicant (Cytron) already responded to the previous RFI by sending the requested documents and is waiting for officer review.

- 'SAMPLE_REQUESTED':
  SIRIM has issued a call notice requesting physical hardware test samples to be delivered/couriered to SIRIM QAS Lab (Building 25, Shah Alam).

- 'SAMPLE_SUBMITTED':
  The applicant has dispatched the physical samples and provided courier tracking consignment info.

- 'TESTING_IN_PROGRESS':
  SIRIM QAS lab is actively conducting laboratory tests.

- 'FINAL_EVALUATION':
  Testing and document evaluation completed; queued for final approval review.

- 'APPROVED':
  SIRIM QAS has approved the application or issued the Certificate of Conformity (CoC) / Type Approval.

Thread Transcript (${messages.length} messages):
${threadTranscript.slice(0, 30000)}

Return a JSON object with:
isSirimRelated (boolean), applicationRef (string), productName (string), modelNumber (string), brand (string), applicant (string), scheme (string), status (string: 'SUBMITTED'|'UNDER_REVIEW'|'SAMPLE_REQUESTED'|'SAMPLE_SUBMITTED'|'TESTING_IN_PROGRESS'|'RFI_ACTION_REQUIRED'|'PAYMENT_PENDING'|'FINAL_EVALUATION'|'APPROVED'|'REJECTED'|'EXPIRED'), statusExplanation (string), officerName (string), officerEmail (string), processingFeeRm (number), detectedStandards (array of strings), courierTracking (string), quotationOrInvoiceNo (string), paymentStatus (string: 'PAID'|'UNPAID'|'NOT_APPLICABLE'), supplierStatus (string), summary (string), timelineEvents (array of {date, title, description, sender, type: 'status_change'|'rfi'|'document'|'payment'|'approval'|'sample'}), actionItems (array of {itemCategory: 'ACTION_REQUIRED'|'PENDING_STATEMENT', title, description, assignedTo: 'APPLICANT'|'SIRIM'|'SUPPLIER'|'LAB', priority: 'CRITICAL'|'HIGH'|'MEDIUM'|'LOW', requiredActionType: 'SUBMIT_DOC'|'PAY_FEE'|'SEND_SAMPLE'|'PROVIDE_CLARIFICATION'|'AWAIT_SIRIM'|'WAITING_SUPPLIER'|'WAITING_LAB'|'WAITING_REPLY'|'RENEW_CERTIFICATE', dueDate, emailSourceSnippet}), resolvedRequirements (array of {title, reason})`;

                const aiPromise = generateContentWithRetryAndFallback(
                  ai,
                  "gemini-3.8-flash",
                  prompt,
                  {
                    responseMimeType: "application/json",
                  },
                  "gemini-3.1-flash-lite"
                );

                const timeoutPromise = new Promise((_, reject) =>
                  setTimeout(() => reject(new Error("Gemini thread parse timeout")), 9000)
                );

                const aiRes: any = await Promise.race([aiPromise, timeoutPromise]);
                parsed = JSON.parse(aiRes.text?.trim() || "{}");
              } catch (parseErr) {
                parsed = fallbackHeuristicSirimParser(subject, threadTranscript, from, lastDate);
              }

              if (
                parsed &&
                parsed.isSirimRelated !== false &&
                !parsed.isOutOfOffice &&
                !isOutOfOfficeSubject(parsed.productName) &&
                !isOutOfOfficeSubject(subject)
              ) {
                newEmailsDetected++;

                // Map email messages for thread storage
                const newEmailMessages = messages.map((m: any) => {
                  const mHeaders = m.payload?.headers || [];
                  const mSub = mHeaders.find((h: any) => h.name?.toLowerCase() === "subject")?.value || subject;
                  const mFrom = mHeaders.find((h: any) => h.name?.toLowerCase() === "from")?.value || from;
                  const mTo = mHeaders.find((h: any) => h.name?.toLowerCase() === "to")?.value || "";
                  const mDate = mHeaders.find((h: any) => h.name?.toLowerCase() === "date")?.value || lastDate;
                  const extracted = extractEmailBodyText(m.payload);
                  const bodyText = extracted.trim().length > 0 ? extracted : (m.snippet || "");
                  const att = extractAttachments(m.payload);
                  return {
                    id: m.id || `msg-${Date.now()}-${Math.random()}`,
                    messageId: m.id || "",
                    from: mFrom,
                    to: mTo || "applicant@cytron.io",
                    date: mDate,
                    subject: mSub,
                    snippet: m.snippet || bodyText.slice(0, 120),
                    bodyText,
                    hasAttachments: att.hasAttachments,
                    attachmentNames: att.attachmentNames,
                  };
                });

                // Prepare timeline events
                const extractedTimeline = (parsed.timelineEvents && parsed.timelineEvents.length > 0)
                  ? parsed.timelineEvents.map((t: any, idx: number) => ({
                      id: `tl-ext-${thread.id}-${idx}`,
                      date: t.date || lastDate?.split("T")[0] || new Date().toISOString().split("T")[0],
                      title: t.title || "SIRIM Communication Update",
                      description: t.description || "",
                      sender: t.sender || from,
                      emailSubject: subject,
                      type: t.type || "status_change",
                    }))
                  : [
                      {
                        id: `tl-auto-${Date.now()}-${thread.id}`,
                        date: lastDate ? lastDate.split("T")[0] : new Date().toISOString().split("T")[0],
                        title: `SIRIM Update: ${subject.slice(0, 45)}`,
                        description: parsed.summary || `Parsed ${messages.length} message(s) in thread.`,
                        sender: from,
                        emailSubject: subject,
                        type: parsed.status === "RFI_ACTION_REQUIRED" ? "rfi" : parsed.status === "APPROVED" ? "approval" : "status_change",
                      },
                    ];

                if (existingIdx >= 0) {
                  const existing = currentApplications[existingIdx];
                  const existingThreads = existing.emailThreads || [];
                  const mergedThreads = [...existingThreads];
                  for (const nMsg of newEmailMessages) {
                    if (!mergedThreads.some((m) => m.id === nMsg.id || m.messageId === nMsg.messageId)) {
                      mergedThreads.push(nMsg);
                    }
                  }

                  // Merge timeline events without duplicates
                  const existingTimeline = existing.timeline || [];
                  const mergedTimeline = [...existingTimeline];
                  for (const extEvt of extractedTimeline) {
                    if (!mergedTimeline.some((t) => t.title === extEvt.title && t.date === extEvt.date)) {
                      mergedTimeline.push(extEvt);
                    }
                  }
                  mergedTimeline.sort((a, b) => (a.date < b.date ? -1 : 1));

                  // Merge action items without duplicates & evaluate AI progress auto-resolution
                  const existingActions = (existing.actionItems || []).map((a: any) => normalizeActionItem(a));
                  const newStatus = parsed.status || existing.status;
                  // Status-based auto-resolution must only fire on an actual status CHANGE; otherwise an item
                  // created while the app was already in that status is wrongly closed on the very next scan.
                  const statusChanged = newStatus !== existing.status;
                  const mergedActions = existingActions.map((item: any) => {
                    if (item.isCompleted) return item;

                    // 1. If status reached APPROVED, all pre-approval actions are auto-resolved
                    if (newStatus === "APPROVED") {
                      return {
                        ...item,
                        isCompleted: true,
                        completedAt: new Date().toISOString(),
                        completedBy: "AI Autonomous Engine",
                        autoResolvedByAi: true,
                        autoResolvedAt: new Date().toISOString(),
                        autoResolvedReason: "Auto-resolved: Application granted Certificate of Conformity / Approval by SIRIM QAS.",
                      };
                    }

                    // 2. If Gemini identified this action as resolved in resolvedRequirements
                    const resolvedMatch = (parsed.resolvedRequirements || []).find((r: any) =>
                      r.title && (
                        item.title.toLowerCase().includes(r.title.toLowerCase()) ||
                        r.title.toLowerCase().includes(item.title.toLowerCase())
                      )
                    );
                    if (resolvedMatch) {
                      return {
                        ...item,
                        isCompleted: true,
                        completedAt: new Date().toISOString(),
                        completedBy: "AI Autonomous Engine",
                        autoResolvedByAi: true,
                        autoResolvedAt: new Date().toISOString(),
                        autoResolvedReason: resolvedMatch.reason || "Auto-resolved: Verified fulfillment in recent email thread.",
                      };
                    }

                    // 3. Autonomous progress resolution heuristic based on status progression
                    const titleLower = (item.title || "").toLowerCase();
                    const type = item.requiredActionType;

                    // If samples requested was pending, but status is now SAMPLE_SUBMITTED or TESTING_IN_PROGRESS
                    if ((type === "SEND_SAMPLE" || titleLower.includes("sample")) &&
                        (newStatus === "SAMPLE_SUBMITTED" || newStatus === "TESTING_IN_PROGRESS" || parsed.courierTracking)) {
                      return {
                        ...item,
                        isCompleted: true,
                        completedAt: new Date().toISOString(),
                        completedBy: "AI Autonomous Engine",
                        autoResolvedByAi: true,
                        autoResolvedAt: new Date().toISOString(),
                        autoResolvedReason: `Auto-resolved: Sample submission verified${parsed.courierTracking ? ` (Courier Tracking: ${parsed.courierTracking})` : ""}.`,
                      };
                    }

                    // If payment was pending, but payment is now settled or status progressed
                    // (Previously ANY status other than PAYMENT_PENDING closed it, so a new RFI silently "paid" the invoice.)
                    if ((type === "PAY_FEE" || titleLower.includes("invoice") || titleLower.includes("payment")) &&
                        (parsed.paymentStatus === "PAID" || (statusChanged && POST_PAYMENT_STATUSES.has(newStatus)))) {
                      return {
                        ...item,
                        isCompleted: true,
                        completedAt: new Date().toISOString(),
                        completedBy: "AI Autonomous Engine",
                        autoResolvedByAi: true,
                        autoResolvedAt: new Date().toISOString(),
                        autoResolvedReason: "Auto-resolved: Payment acknowledged or invoice settled.",
                      };
                    }

                    // If waiting for supplier documents, but supplier documents were received or submitted to SIRIM
                    if ((type === "WAITING_SUPPLIER" || item.assignedTo === "SUPPLIER") &&
                        (parsed.supplierStatus === "DOCUMENTS_RECEIVED_FROM_SUPPLIER" || parsed.supplierStatus === "DOCUMENTS_SUBMITTED_TO_SIRIM" || (statusChanged && newStatus === "UNDER_REVIEW"))) {
                      return {
                        ...item,
                        isCompleted: true,
                        completedAt: new Date().toISOString(),
                        completedBy: "AI Autonomous Engine",
                        autoResolvedByAi: true,
                        autoResolvedAt: new Date().toISOString(),
                        autoResolvedReason: "Auto-resolved: Supplier provided requested CoC technical documentation.",
                      };
                    }

                    // If waiting for SIRIM / agent reply (incl. general WAITING_REPLY), and an officer update / next phase has arrived
                    if ((type === "AWAIT_SIRIM" || type === "WAITING_REPLY" || item.assignedTo === "SIRIM") &&
                        statusChanged && (newStatus === "RFI_ACTION_REQUIRED" || newStatus === "SAMPLE_REQUESTED" || newStatus === "PAYMENT_PENDING" || newStatus === "FINAL_EVALUATION")) {
                      return {
                        ...item,
                        isCompleted: true,
                        completedAt: new Date().toISOString(),
                        completedBy: "AI Autonomous Engine",
                        autoResolvedByAi: true,
                        autoResolvedAt: new Date().toISOString(),
                        autoResolvedReason: "Auto-resolved: SIRIM officer provided update / evaluation feedback.",
                      };
                    }

                    // If waiting on an external lab, and testing has finished
                    if ((type === "WAITING_LAB" || item.assignedTo === "LAB") && statusChanged && newStatus === "FINAL_EVALUATION") {
                      return {
                        ...item,
                        isCompleted: true,
                        completedAt: new Date().toISOString(),
                        completedBy: "AI Autonomous Engine",
                        autoResolvedByAi: true,
                        autoResolvedAt: new Date().toISOString(),
                        autoResolvedReason: "Auto-resolved: Lab testing completed; application moved to final evaluation.",
                      };
                    }

                    // If document submission to SIRIM was pending, but application is now UNDER_REVIEW
                    if ((type === "SUBMIT_DOC" || type === "PROVIDE_CLARIFICATION") && statusChanged && newStatus === "UNDER_REVIEW") {
                      return {
                        ...item,
                        isCompleted: true,
                        completedAt: new Date().toISOString(),
                        completedBy: "AI Autonomous Engine",
                        autoResolvedByAi: true,
                        autoResolvedAt: new Date().toISOString(),
                        autoResolvedReason: "Auto-resolved: Documents/clarifications submitted to SIRIM; application is now under officer review.",
                      };
                    }

                    return item;
                  });
                  // Stamp anything the scanner changed so browsers don't overwrite it with an older copy.
                  const scanTime = new Date().toISOString();
                  mergedActions.forEach((m: any, i: number) => {
                    if (m !== existingActions[i]) m.updatedAt = scanTime;
                  });

                  if (Array.isArray(parsed.actionItems)) {
                    parsed.actionItems.forEach((act: any, actIdx: number) => {
                      if (!mergedActions.some((a) => a.title.toLowerCase() === act.title.toLowerCase())) {
                        mergedActions.push(normalizeActionItem({
                          id: `act-auto-${Date.now()}-${actIdx}`,
                          title: act.title,
                          description: act.description || "",
                          itemCategory: act.itemCategory,
                          assignedTo: act.assignedTo || "APPLICANT",
                          dueDate: act.dueDate || new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0],
                          isCompleted: false,
                          priority: act.priority || "HIGH",
                          requiredActionType: act.requiredActionType || "PROVIDE_CLARIFICATION",
                          emailSourceSnippet: act.emailSourceSnippet || undefined,
                        }));
                      }
                    });
                  }

                  currentApplications[existingIdx] = {
                    ...existing,
                    lastModifiedAt: new Date().toISOString(),
                    lastModifiedBy: "AI Autonomous Engine",
                    status: parsed.status || existing.status,
                    officerName: parsed.officerName || existing.officerName,
                    officerEmail: parsed.officerEmail || existing.officerEmail,
                    emailSubject: subject,
                    lastActivityDate: lastDate ? lastDate.split("T")[0] : new Date().toISOString().split("T")[0],
                    certificateNo: parsed.certificateNo || existing.certificateNo,
                    certificateExpiryDate: parsed.certificateExpiryDate || existing.certificateExpiryDate,
                    processingFeeRm: parsed.processingFeeRm || existing.processingFeeRm,
                    paymentStatus: parsed.paymentStatus || existing.paymentStatus,
                    standards: parsed.detectedStandards?.length ? parsed.detectedStandards : existing.standards,
                    courierTracking: parsed.courierTracking || existing.courierTracking,
                    timeline: mergedTimeline,
                    actionItems: mergedActions,
                    emailThreads: mergedThreads,
                  };
                } else {
                  currentApplications.unshift({
                    id: `sirim-${thread.id}`,
                    threadId: thread.id,
                    applicationRef: parsed.applicationRef || `SQAS/GEN/${Date.now().toString().slice(-4)}`,
                    productName: parsed.productName || subject,
                    modelNumber: parsed.modelNumber || "CYT-NEW-01",
                    brand: parsed.brand || "Cytron",
                    applicant: "Cytron Technologies Sdn Bhd",
                    scheme: parsed.scheme || "Type Approval (MCMC/SIRIM)",
                    status: parsed.status || "UNDER_REVIEW",
                    officerName: parsed.officerName || "SIRIM Evaluator",
                    officerEmail: parsed.officerEmail || from,
                    submissionDate: parsed.submissionDate || firstDate?.split("T")[0] || new Date().toISOString().split("T")[0],
                    lastActivityDate: lastDate ? lastDate.split("T")[0] : new Date().toISOString().split("T")[0],
                    targetDeadline: parsed.targetDeadline || new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0],
                    emailSubject: subject,
                    gmailThreadLink: `https://mail.google.com/mail/u/0/#all/${thread.id}`,
                    certificateNo: parsed.certificateNo || undefined,
                    certificateExpiryDate: parsed.certificateExpiryDate || undefined,
                    processingFeeRm: parsed.processingFeeRm || undefined,
                    paymentStatus: parsed.paymentStatus || "NOT_APPLICABLE",
                    standards: parsed.detectedStandards || [],
                    courierTracking: parsed.courierTracking || undefined,
                    notes: parsed.summary || undefined,
                    actionItems: (parsed.actionItems || []).map((act: any, i: number) => normalizeActionItem({
                      id: `act-auto-${Date.now()}-${i}`,
                      title: act.title,
                      description: act.description || "",
                      itemCategory: act.itemCategory,
                      assignedTo: act.assignedTo || "APPLICANT",
                      dueDate: act.dueDate || new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0],
                      isCompleted: false,
                      priority: act.priority || "HIGH",
                      requiredActionType: act.requiredActionType || "PROVIDE_CLARIFICATION",
                    })),
                    timeline: extractedTimeline,
                    emailThreads: newEmailMessages,
                    syncedToSheet: false,
                  });
                }
              }
            } catch (threadProcErr: any) {
              console.warn("Could not process thread during auto-scan", threadProcErr);
            }
          }

          // Mark first scan as completed in stored config
          storedConfig.hasCompletedFirstScan = true;
          storedConfig.firstScanCompletedAt = new Date().toISOString();
          saveStoredAutomationConfig(storedConfig);
          addLog("SCAN", "SUCCESS", `Email scan completed (${isFirstScan ? "1-Year Historical Ingestion" : "1-Month Routine Update"}). Registered first scan completion.`);
        } catch (scanErr: any) {
          addLog("SCAN", "WARNING", `Gmail auto-scan skipped or failed: ${scanErr?.message || scanErr}`);
        }
      } else {
        addLog(
          "SCAN",
          autoScanGmail && !accessToken ? "WARNING" : "INFO",
          autoScanGmail && !accessToken
            ? "Gmail scan skipped: the saved Google sign-in has expired (Google tokens last about 1 hour). Open the tracker and sign in to refresh it."
            : "Gmail scan disabled in automation settings."
        );
      }

      // STEP 2: Auto-Sync Google Sheet
      let sheetSyncSuccess = false;
      if (autoSyncSheet && sheetConfig?.spreadsheetId && accessToken) {
        addLog("SHEET_SYNC", "INFO", `Syncing ${currentApplications.length} applications to Google Sheet (${sheetConfig.spreadsheetId})...`);
        try {
          const oauth2Client = new google.auth.OAuth2();
          oauth2Client.setCredentials({ access_token: accessToken });
          const sheets = google.sheets({ version: "v4", auth: oauth2Client });

          const headers = [
            "Application Ref No",
            "Product Name",
            "Model Number",
            "Brand",
            "Certification Scheme",
            "Status",
            "Assigned SIRIM Officer",
            "Officer Email",
            "Email Subject / Thread Name",
            "Gmail Thread Link",
            "Submission Date",
            "Last Activity",
            "Target SLA Deadline",
            "Pending Action Items",
            "Action Assignee",
            "Priority",
            "Certificate No",
            "Certificate Expiry",
            "Fee (RM)",
            "Payment Status",
            "Notes / Summary",
            "Last Synced (UTC)",
          ];

          const rowsData: any[][] = [headers];
          currentApplications.forEach((appItem: any) => {
            const pendingActions = (appItem.actionItems || [])
              .filter((a: any) => !a.isCompleted)
              .map((a: any) => `• [${a.priority}] ${a.title}`)
              .join("\n");

            const primaryAssignee = (appItem.actionItems || []).find((a: any) => !a.isCompleted)?.assignedTo || "None";
            const maxPriority = (appItem.actionItems || []).find((a: any) => !a.isCompleted)?.priority || "LOW";

            const emailSubject =
              appItem.emailSubject ||
              appItem.emailThreads?.[appItem.emailThreads.length - 1]?.subject ||
              `SIRIM e-ComM: ${appItem.applicationRef || appItem.productName || "Update"}`;

            let gmailLink = appItem.gmailThreadLink || "";
            if (!gmailLink) {
              const query = appItem.applicationRef || appItem.emailSubject || appItem.modelNumber || "SIRIM";
              gmailLink = `https://mail.google.com/mail/u/0/#search/${encodeURIComponent(query)}`;
            }

            rowsData.push([
              appItem.applicationRef || "",
              appItem.productName || "",
              appItem.modelNumber || "",
              appItem.brand || "",
              appItem.scheme || "",
              appItem.status || "",
              appItem.officerName || "",
              appItem.officerEmail || "",
              emailSubject,
              gmailLink,
              appItem.submissionDate || "",
              appItem.lastActivityDate || "",
              appItem.targetDeadline || "",
              pendingActions || "None (On Track)",
              primaryAssignee,
              maxPriority,
              appItem.certificateNo || "Pending Approval",
              appItem.certificateExpiryDate || "-",
              appItem.processingFeeRm ? Number(appItem.processingFeeRm) : "",
              appItem.paymentStatus || "NOT_APPLICABLE",
              appItem.notes || "",
              new Date().toISOString(),
            ]);
          });

          await sheets.spreadsheets.values.update({
            spreadsheetId: sheetConfig.spreadsheetId,
            range: `'${sheetConfig.sheetName || "Active CoC Applications"}'!A1`,
            valueInputOption: "USER_ENTERED",
            requestBody: { values: rowsData },
          });

          sheetSyncSuccess = true;
          addLog("SHEET_SYNC", "SUCCESS", `Master Google Sheet successfully updated with ${currentApplications.length} applications.`);
        } catch (sheetErr: any) {
          addLog("SHEET_SYNC", "ERROR", `Failed to sync Google Sheet: ${sheetErr?.message || sheetErr}`);
        }
      } else {
        addLog("SHEET_SYNC", "INFO", "Google Sheet sync skipped (no configured sheet ID or disabled).");
      }

      // STEP 3: Dispatch Telegram Digest / Notification (STRICT SPAM PREVENTION)
      let telegramSent = false;
      const tgBotToken = resolveBotToken(telegramConfig?.botToken) || undefined;
      const tgChatId = telegramConfig?.chatId || process.env.TELEGRAM_CHAT_ID;

      // Rate limit check: Strict cooldown enforcement
      // - 5 minutes cooldown EVEN FOR MANUAL CLICKS (prevents UI button double-clicking from spamming)
      // - 30 minutes cooldown for any automated alert
      const nowMs = Date.now();
      const lastTelegramSentMs = storedConfig.lastTelegramSentAt ? new Date(storedConfig.lastTelegramSentAt).getTime() : 0;
      const minCooldownMs = triggerSource === "MANUAL_CLICK" ? 5 * 60 * 1000 : 30 * 60 * 1000;
      const isCooldownActive = (nowMs - lastTelegramSentMs < minCooldownMs);

      // Telegram should ONLY ever be sent if:
      // A) It is a scheduled morning digest (triggerSource === "SCHEDULED_MORNING") AND daily digest hasn't been sent today, OR
      // B) A user explicitly clicked "Run Automation Now" / "Send Telegram" in UI (triggerSource === "MANUAL_CLICK"), OR
      // C) A brand new critical RFI was detected in THIS specific cycle that has NEVER been alerted before
      const isMorningDigestTrigger = (triggerSource === "SCHEDULED_MORNING");
      const isManualTrigger = (triggerSource === "MANUAL_CLICK");

      if (!Array.isArray(storedConfig.alertedCriticalItemIds)) {
        storedConfig.alertedCriticalItemIds = [];
      }

      // Only consider critical items that have not yet been alerted
      const unalertedCriticalActions = (newEmailsDetected > 0)
        ? currentApplications.flatMap((a) =>
            (a.actionItems || [])
              .filter((act: any) => !act.isCompleted && act.priority === 'CRITICAL' && !storedConfig.alertedCriticalItemIds.includes(act.id))
              .map((act: any) => ({ app: a, action: act }))
          )
        : [];
      const hasBrandNewCriticalRfi = unalertedCriticalActions.length > 0;

      // Only allow Telegram if configured, not in cooldown, and is one of the 3 approved triggers
      const shouldSendTelegram = Boolean(autoSendTelegram || (hasBrandNewCriticalRfi && telegramConfig?.instantAlertOnCritical)) &&
        Boolean(tgBotToken) &&
        Boolean(tgChatId) &&
        !isCooldownActive &&
        (isMorningDigestTrigger || isManualTrigger || (hasBrandNewCriticalRfi && telegramConfig?.instantAlertOnCritical));

      if (shouldSendTelegram) {
        addLog("TELEGRAM", "INFO", `Sending notification to Telegram Chat (${tgChatId})...`);
        try {
          const briefingText = formatTelegramBriefing(currentApplications, {
            sheetUrl: sheetConfig?.spreadsheetUrl,
            newScannedCount: newEmailsDetected,
          });

          await sendTelegramRawMessage(tgBotToken, tgChatId, briefingText, {
            topicId: telegramConfig?.topicId,
          });

          telegramSent = true;
          storedConfig.lastTelegramSentAt = new Date().toISOString();

          // Mark brand new critical items as alerted so they never trigger another alert
          if (hasBrandNewCriticalRfi) {
            storedConfig.alertedCriticalItemIds = [
              ...storedConfig.alertedCriticalItemIds,
              ...unalertedCriticalActions.map((item) => item.action.id),
            ].slice(-200);
          }

          addLog("TELEGRAM", "SUCCESS", "Telegram notification delivered successfully.");
        } catch (tgErr: any) {
          addLog("TELEGRAM", "ERROR", `Telegram delivery failed: ${tgErr?.message || tgErr}`);
        }
      } else {
        if (isCooldownActive) {
          const minutesLeft = Math.ceil((minCooldownMs - (nowMs - lastTelegramSentMs)) / 60000);
          addLog("TELEGRAM", "INFO", `Telegram notification suppressed: Cooldown active (${minutesLeft}m remaining to prevent spam).`);
        } else if (!autoSendTelegram && !hasBrandNewCriticalRfi && !isManualTrigger && !isMorningDigestTrigger) {
          addLog("TELEGRAM", "INFO", "Telegram briefing skipped: Routine autonomous cycle (runs silently without Telegram spam).");
        } else if (!tgBotToken || !tgChatId) {
          addLog("TELEGRAM", "INFO", "Telegram dispatch skipped (not configured).");
        } else {
          addLog("TELEGRAM", "INFO", "Telegram briefing skipped (conditions not met).");
        }
      }

      // Persist the combined, updated applications to central server storage
      saveStoredApplications(currentApplications);

      recordTeamActivity({
        userEmail,
        actionType: "GMAIL_SCAN",
        description: `${userEmail ? userEmail.split("@")[0] : "Team member"} executed pipeline cycle (${newEmailsDetected} new emails detected, ${currentApplications.length} active apps).`,
        details: { newEmailsDetected, sheetSyncSuccess, telegramSent },
      });

      addLog("SYSTEM", "SUCCESS", `Automated synchronization pipeline completed successfully (${triggerSource}).`);

      // Update central automation config with run results
      storedConfig.lastRunAt = new Date().toISOString();
      storedConfig.lastRunStatus = "SUCCESS";
      storedConfig.lastRunSummary = `Autonomous cycle completed (${triggerSource}, ${isFirstScan ? "1-Year Ingestion" : "1-Month Routine"}): ${newEmailsDetected} new emails, ${sheetSyncSuccess ? "Sheet updated" : "Sheet skipped"}, ${telegramSent ? "Telegram delivered" : "Telegram skipped"}.`;
      if (!Array.isArray(storedConfig.logs)) storedConfig.logs = [];
      storedConfig.logs = [...logs, ...storedConfig.logs].slice(0, 100);
      saveStoredAutomationConfig(storedConfig);

      return {
        success: true,
        summary: `Cycle finished (${triggerSource}, ${isFirstScan ? "1-Year Historical Ingestion" : "1-Month Routine Scan"}): ${newEmailsDetected} new emails detected, ${sheetSyncSuccess ? "Sheet updated" : "Sheet skipped"}, ${telegramSent ? "Telegram sent" : "Telegram skipped"}.`,
        applications: currentApplications,
        updatedApplications: currentApplications,
        sheetSyncResult: { success: sheetSyncSuccess },
        scanResult: { threadsFound: newEmailsDetected },
        isFirstScan,
        scanDays,
        hasCompletedFirstScan: true,
        firstScanCompletedAt: storedConfig.firstScanCompletedAt,
        newEmailsDetected,
        sheetSyncSuccess,
        telegramSent,
        triggerSource,
        logs,
      };
    } catch (err: any) {
      console.error(`Error in autonomous pipeline (${triggerSource}):`, err);
      addLog("SYSTEM", "ERROR", `Automation pipeline encountered error: ${err?.message || err}`);
      const fallbackApps = getStoredApplications();
      return {
        success: false,
        error: "Automation execution encountered an error",
        details: err?.message || String(err),
        logs,
        applications: fallbackApps,
        updatedApplications: fallbackApps,
        sheetSyncResult: { success: false },
        scanResult: { threadsFound: 0 },
        newEmailsDetected: 0,
        sheetSyncSuccess: false,
        telegramSent: false,
        triggerSource,
      };
    }
  }

  // Bind triggerAutonomousRunSafely implementation
  triggerAutonomousRunSafely = (source: string, userEmail?: string) => {
    setTimeout(() => {
      runAutonomousPipelineCore({
        triggerSource: source,
        userEmail,
        autoSendTelegram: false, // Hands-free credentials/sheet setup runs completely silent without Telegram
      }).catch((err) => {
        console.error(`[triggerAutonomousRunSafely] Error running cycle (${source}):`, err);
      });
    }, 1200);
  };

  // ----------------------------------------------------
  // 11. Automated Engine: Run Full End-to-End Pipeline (HTTP Route)
  // ----------------------------------------------------
  app.post("/api/automation/run", async (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      const accessToken = authHeader && authHeader.startsWith("Bearer ") ? authHeader.split(" ")[1] : null;

      // Distinguish explicit manual button clicks from routine autonomous / quiet calls
      const isManualClick = req.body.isManualClick === true || req.body.triggerSource === "MANUAL_CLICK";
      const triggerSource = isManualClick ? "MANUAL_CLICK" : (req.body.triggerSource || "AUTONOMOUS_CYCLE");
      const autoSendTelegram = isManualClick ? Boolean(req.body.options?.autoSendTelegram ?? true) : false;

      const result = await runAutonomousPipelineCore({
        ...req.body,
        userEmail: req.user?.email || req.body.userEmail,
        accessToken: accessToken || req.body.accessToken,
        triggerSource,
        autoSendTelegram,
      });

      if (!result.success && result.error) {
        return res.status(500).json(result);
      }
      res.json(result);
    } catch (err: any) {
      console.error("Error in automation/run:", err);
      res.status(500).json({
        error: "Automation execution encountered an error",
        details: err?.message || String(err),
      });
    }
  });

  // ----------------------------------------------------
  // Reset First-Time Scan Flag (Re-run 1-Year Historical Scan)
  // ----------------------------------------------------
  app.post("/api/automation/reset-first-scan", (req: Request, res: Response) => {
    try {
      const config = getStoredAutomationConfig();
      config.hasCompletedFirstScan = false;
      delete config.firstScanCompletedAt;
      saveStoredAutomationConfig(config);
      res.json({
        success: true,
        message: "First-scan flag reset. Next automated or manual scan will scan 1 whole year (365 days) of email archives.",
        config: redactConfig(config),
      });
    } catch (e: any) {
      res.status(500).json({ error: "Failed to reset first scan flag", details: e?.message });
    }
  });


  // ----------------------------------------------------
  // Vite Middleware Setup (Development only)
  // ----------------------------------------------------
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // ----------------------------------------------------
  // Background Autonomous Scheduler Engine (Server-side)
  // Runs 24/7 on local Node server or Cloud Run, checking every 30s
  // ----------------------------------------------------
  let isAutonomousRunning = false;
  let lastAutonomousIntervalMs = Date.now();

  setInterval(async () => {
    try {
      const config = getStoredAutomationConfig();
      if (!config || !config.enabled) return;

      const now = new Date();
      const nowMs = now.getTime();
      const intervalMinutes = config.autonomousIntervalMinutes !== undefined ? config.autonomousIntervalMinutes : 0;
      const intervalMs = intervalMinutes * 60 * 1000;

      // Date in Asia/Kuala_Lumpur (YYYY-MM-DD)
      const mytDate = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kuala_Lumpur",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(now);

      // Time in Asia/Kuala_Lumpur (HH:MM)
      const mytTime = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Kuala_Lumpur",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(now);

      const targetTime = config.scheduleTime || "08:30";
      const isMorningScheduledTime = (mytTime >= targetTime && config.lastDailyDigestDate !== mytDate);
      const isPeriodicIntervalDue = intervalMinutes > 0 && (nowMs - lastAutonomousIntervalMs >= intervalMs);

      if ((isMorningScheduledTime || isPeriodicIntervalDue) && !isAutonomousRunning) {
        isAutonomousRunning = true;
        lastAutonomousIntervalMs = nowMs;

        const triggerSource = isMorningScheduledTime ? "SCHEDULED_MORNING" : "AUTONOMOUS_DAEMON";
        console.log(`[Autonomous Scheduler] Triggering autonomous compliance cycle (${triggerSource}) at ${mytTime} MYT...`);

        if (isMorningScheduledTime) {
          config.lastDailyDigestDate = mytDate;
          saveStoredAutomationConfig(config);
        }

        try {
          await runAutonomousPipelineCore({
            triggerSource,
            userEmail: config.activeSession?.email || "autonomous-agent@cytron.io",
            autoSendTelegram: isMorningScheduledTime === true, // ONLY send Telegram briefing for scheduled morning digest! Routine intervals run silently.
          });
        } catch (schedErr: any) {
          console.error(`[Autonomous Scheduler] Error during cycle (${triggerSource}):`, schedErr?.message || schedErr);
        } finally {
          isAutonomousRunning = false;
        }
      }
    } catch (schedErr: any) {
      console.error("[Autonomous Scheduler] Error during automation tick:", schedErr?.message || schedErr);
    }
  }, 30000);

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`SIRIM CoC Progress Tracker Server running on port ${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Fatal error during server startup:", err);
  process.exit(1);
});
