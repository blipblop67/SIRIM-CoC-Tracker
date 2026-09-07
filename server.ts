import express, { Request, Response } from "express";
import path from "path";
import fs from "fs";
import { GoogleGenAI, Type } from "@google/genai";
import { google } from "googleapis";
import dotenv from "dotenv";

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
  fallbackModel: string = "gemini-2.5-flash"
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

// Heuristic fallback parser for SIRIM emails when model experiences temporary high demand
function fallbackHeuristicSirimParser(emailSubject: string, emailBody: string, sender: string, date: string) {
  const fullText = `${emailSubject || ""}\n${emailBody || ""}`;
  
  // Extract Application Ref
  const refMatch = fullText.match(/(SQAS\/[A-Z0-9\/_-]+|e-?ComM\/[A-Z0-9\/_-]+|CIDB\/[A-Z0-9\/_-]+|COA\/[A-Z0-9\/_-]+|SIRIM\/[A-Z0-9\/_-]+|[A-Z]{3,4}\/[A-Z0-9\/_-]{4,})/i);
  const applicationRef = refMatch ? refMatch[0].trim() : `SQAS/GEN/${Date.now().toString().slice(-4)}`;

  // Extract Model Number
  const modelMatch = fullText.match(/(?:Model(?:\s*No\.?|\s*Number)?|M\/N)[:\s]+([A-Za-z0-9-_/]+)/i) ||
                     fullText.match(/\((CYT-[A-Za-z0-9-_]+|[A-Z0-9]{3,}-[A-Z0-9-_]+)\)/i);
  const modelNumber = modelMatch ? modelMatch[1].trim() : "CYT-GEN-01";

  // Product Name
  const cleanSubject = (emailSubject || "").replace(/^(re|fwd|urgent|update|fw):\s*/i, "").trim();
  const productName = cleanSubject.length > 5 ? cleanSubject : `SIRIM Product (${modelNumber})`;

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
  
  // Status detection based on whole history with priority to latest keywords
  let status = "UNDER_REVIEW";
  let scheme = "Type Approval (MCMC/SIRIM)";
  const lower = fullText.toLowerCase();

  if (lower.includes("approved") || lower.includes("certificate issued") || lower.includes("coa issued") || lower.includes("issuance of certificate")) {
    status = "APPROVED";
  } else if (lower.includes("rfi") || lower.includes("request for information") || lower.includes("clarification") || lower.includes("amendment")) {
    status = "RFI_ACTION_REQUIRED";
  } else if (lower.includes("sample") && (lower.includes("submit") || lower.includes("courier") || lower.includes("request") || lower.includes("call notice"))) {
    status = "SAMPLE_REQUESTED";
  } else if (lower.includes("invoice") || lower.includes("fee") || lower.includes("payment pending") || lower.includes("unpaid")) {
    status = "PAYMENT_PENDING";
  } else if (lower.includes("testing in progress") || lower.includes("lab test")) {
    status = "TESTING_IN_PROGRESS";
  }

  if (lower.includes("special approval")) scheme = "Special Approval";
  else if (lower.includes("modular approval")) scheme = "Modular Approval";
  else if (lower.includes("cidb")) scheme = "CIDB Certification";
  else if (lower.includes("safety") || lower.includes("emc") || lower.includes("ms standards")) scheme = "Safety & EMC (MS Standards)";

  // Action items
  const actionItems: any[] = [];
  if (status === "RFI_ACTION_REQUIRED") {
    actionItems.push({
      title: "Provide technical documentation or clarification requested by SIRIM",
      description: "Review SIRIM queries and reply with updated schematics, user manual, or RF test reports.",
      assignedTo: "APPLICANT",
      dueDate: new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0],
      priority: "HIGH",
      requiredActionType: "PROVIDE_CLARIFICATION",
      emailSourceSnippet: cleanSubject,
    });
  } else if (status === "SAMPLE_REQUESTED") {
    actionItems.push({
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
      title: "Settle outstanding SIRIM processing fee invoice via e-ComM",
      description: `Submit payment online${processingFeeRm ? ` (RM ${processingFeeRm})` : ""} and upload payment receipt.`,
      assignedTo: "APPLICANT",
      dueDate: new Date(Date.now() + 5 * 86400000).toISOString().split("T")[0],
      priority: "CRITICAL",
      requiredActionType: "PAY_FEE",
      emailSourceSnippet: cleanSubject,
    });
  }

  // Build timeline events (if multiple messages are embedded in the body, parse each one)
  const timelineEvents: any[] = [];
  const messageChunks = emailBody.split(/(?=\[[^\]]+ \([^\)]+\)\]:)/);
  if (messageChunks.length > 1) {
    messageChunks.forEach((chunk, i) => {
      const matchHeader = chunk.match(/\[([^\]]+) \(([^\)]+)\)\]:/);
      const chunkSender = matchHeader ? matchHeader[1] : sender || "SIRIM QAS";
      const chunkDate = matchHeader ? matchHeader[2] : date;
      const parsedDate = chunkDate ? new Date(chunkDate).toISOString().split("T")[0] : new Date().toISOString().split("T")[0];
      const chunkSnippet = chunk.replace(/\[[^\]]+ \([^\)]+\)\]:\s*/, "").slice(0, 150).trim();

      let evtType = "document";
      let evtTitle = `Email Update: ${cleanSubject.slice(0, 40)}`;
      const cLow = chunk.toLowerCase();
      if (cLow.includes("rfi") || cLow.includes("clarification")) {
        evtType = "rfi";
        evtTitle = "SIRIM Clarification Query (RFI)";
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
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  app.use(express.json({ limit: "15mb" }));

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
      const { emailSubject, emailBody, sender, date, existingApplication } = req.body;

      if (!emailSubject && !emailBody) {
        return res.status(400).json({ error: "emailSubject or emailBody is required" });
      }

      const ai = getGeminiClient();

      const prompt = `You are an expert Malaysian regulatory compliance specialist in SIRIM QAS International, e-ComM (MCMC), CIDB, and Certificate of Conformity (CoC) certification procedures.
Analyze the following email communication or full multi-stage email thread related to a SIRIM certification application. The thread may span several weeks, months, or up to 1 year of historical back-and-forth communication.

Extract comprehensive, accurate, structured regulatory data and reconstruct the complete chronological milestone progression of the application.

EMAIL DETAILS:
From: ${sender || "Unknown"}
Date: ${date || new Date().toISOString()}
Subject: ${emailSubject || ""}
Body:
${emailBody || ""}

${
  existingApplication
    ? `EXISTING APPLICATION CONTEXT:
Ref: ${existingApplication.applicationRef}
Product: ${existingApplication.productName}
Current Status: ${existingApplication.status}
`
    : ""
}

OUTPUT RULES:
1. Determine if this email/thread is related to SIRIM QAS / e-ComM / MCMC / CIDB / CoC / Type Approval / Safety approval.
2. Extract the Application Reference No / Job No (e.g. SQAS/CMCS/2026/..., eComM Ref, etc.). If none found, generate a plausible reference based on the subject.
3. Extract Product Name, Model Number, Brand, Applicant company name (e.g. Cytron Technologies Sdn Bhd).
4. Identify Certification Scheme ('Type Approval (MCMC/SIRIM)', 'Special Approval', 'Modular Approval', 'CIDB Certification', 'Safety & EMC (MS Standards)').
5. Identify current status based on the LATEST message in the thread: 'SUBMITTED', 'UNDER_REVIEW', 'SAMPLE_REQUESTED', 'SAMPLE_SUBMITTED', 'TESTING_IN_PROGRESS', 'RFI_ACTION_REQUIRED', 'PAYMENT_PENDING', 'FINAL_EVALUATION', 'APPROVED', 'REJECTED', 'EXPIRED'.
6. Extract officer name and direct email if mentioned.
7. Extract Malaysian standards tested against (e.g., MS IEC 62368-1, MCMC MTSFB TC T007, CISPR 32, etc.).
8. Extract any courier tracking consignment numbers for test sample deliveries to SIRIM QAS (e.g. GDEX, PosLaju, DHL).
9. Extract Quotation/Invoice number and processing fee in RM (Ringgit Malaysia).
10. Extract Certificate Number and Expiry Date if approved.
11. Extract critical active action items required by SIRIM or Lab.
12. IMPORTANT: Extract ALL chronological timeline milestones across the entire thread history into 'timelineEvents' (e.g., initial submission, quotation issued, sample requested, RFI clarification sent, lab evaluation, approval). Also provide a single 'timelineEvent' for the latest update.

Return ONLY a valid JSON object matching this schema.`;

      const response = await generateContentWithRetryAndFallback(
        ai,
        "gemini-3.7-flash",
        prompt,
        {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              isSirimRelated: { type: Type.BOOLEAN },
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
              officerName: { type: Type.STRING },
              officerEmail: { type: Type.STRING },
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
                    title: { type: Type.STRING },
                    description: { type: Type.STRING },
                    assignedTo: {
                      type: Type.STRING,
                      enum: ["APPLICANT", "SIRIM", "LAB"],
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
        "gemini-2.5-flash"
      );

      const jsonText = response.text?.trim();
      if (!jsonText) {
        throw new Error("No response returned by Gemini model");
      }

      const parsedData = JSON.parse(jsonText);
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
        res.json({ success: true, data: heuristicData, isFallback: true });
      } catch (fallbackErr) {
        res.status(500).json({
          error: "Failed to parse email with Gemini AI",
          details: err?.message || String(err),
        });
      }
    }
  });

  // ----------------------------------------------------
  // 2. Gemini AI: Draft Official Response to SIRIM
  // ----------------------------------------------------
  app.post("/api/gemini/generate-reply", async (req: Request, res: Response) => {
    const {
      applicationRef,
      productName,
      modelNumber,
      officerName,
      responseIntent, // 'SUBMIT_DOCS' | 'REQUEST_EXTENSION' | 'STATUS_FOLLOWUP' | 'SAMPLE_TRACKING' | 'CUSTOM'
      customNotes,
      actionItemDetails,
    } = req.body;

    try {
      const ai = getGeminiClient();

      const prompt = `You are a professional regulatory compliance manager at a high-tech Malaysian electronics & IoT manufacturer.
Draft an official, polite, and compliant email reply to SIRIM QAS International regarding a Certificate of Conformity (CoC) / Type Approval application.

APPLICATION DETAILS:
- Application Ref: ${applicationRef || "N/A"}
- Product Name: ${productName || "N/A"}
- Model Number: ${modelNumber || "N/A"}
- Addressed Officer: ${officerName || "SIRIM QAS Certification Officer"}
- Purpose / Intent: ${responseIntent}
- Specific Action Item / Context: ${actionItemDetails || ""}
- Additional User Notes / Clarification: ${customNotes || "Standard submission of requested documentation/information"}

DRAFTING GUIDELINES:
- Include a clear formal subject line with Reference Number and Model Name (e.g., "RE: SQAS/CMCS/... - Submission of Revised Technical Documents")
- Formal Malaysian business letter salutation and closing ("Dear Encik/Puan/Mr/Ms...", "Best regards, Regulatory Compliance Team")
- Clear itemized points answering the officer's queries or providing courier tracking / payment proof details.
- Professional, respectful, and compliant tone conforming to Malaysian Standards (MS) and MCMC regulatory conventions.

Return a JSON with "subject", "body", and "suggestedAttachments" (array of strings).`;

      const response = await generateContentWithRetryAndFallback(
        ai,
        "gemini-3.7-flash",
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
        "gemini-2.5-flash"
      );

      const jsonText = response.text?.trim();
      const parsedDraft = JSON.parse(jsonText || "{}");
      res.json({ success: true, draft: parsedDraft });
    } catch (err: any) {
      console.warn("Gemini AI draft reply error, generating fallback draft template:", err?.message || err);
      const fallbackDraft = {
        subject: `RE: ${applicationRef || "SIRIM CoC"} - ${responseIntent === "SUBMIT_DOCS" ? "Submission of Requested Documents" : responseIntent === "REQUEST_EXTENSION" ? "Request for Extension of Time" : responseIntent === "SAMPLE_TRACKING" ? "Submission of Test Samples Courier Details" : "Follow-up on Application Status"}`,
        body: `Dear ${officerName || "SIRIM QAS Certification Officer"},\n\nWe refer to our Certificate of Conformity / Type Approval application for reference ${applicationRef || "N/A"} (${productName || "Equipment"}, Model: ${modelNumber || "N/A"}).\n\n${customNotes || (actionItemDetails ? `Regarding the requested item: "${actionItemDetails}", we have reviewed the requirements and prepared the necessary updates.` : "We are pleased to provide the requested information and documentation as required by the technical evaluation team.")}\n\nPlease let us know if any further clarification or documentation is required for your evaluation.\n\nThank you for your assistance.\n\nBest regards,\nRegulatory Compliance Team\nCytron Technologies Sdn Bhd`,
        suggestedAttachments: responseIntent === "SUBMIT_DOCS" ? ["Technical_Datasheet_v2.pdf", "RF_Test_Report.pdf"] : responseIntent === "SAMPLE_TRACKING" ? ["Courier_Consignment_Note.pdf"] : ["Company_Cover_Letter.pdf"]
      };
      res.json({ success: true, draft: fallbackDraft, isFallback: true });
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
      const { spreadsheetId, applications = [], sheetName = "Active CoC Applications" } = req.body;

      if (!spreadsheetId) {
        return res.status(400).json({ error: "spreadsheetId is required" });
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

      applications.forEach((appItem: any) => {
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

      res.json({
        success: true,
        spreadsheetId,
        syncedRowsCount: applications.length,
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
        maxResults = 30,
        daysBack: customDaysBack,
        scope = "routine", // 'first_time' | 'routine' | 'custom'
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

      // Build effective query with newer_than if not already specified
      let effectiveQuery = String(rawQuery).trim();
      if (!effectiveQuery.includes("newer_than:") && !effectiveQuery.includes("after:")) {
        effectiveQuery = `(${effectiveQuery}) newer_than:${daysBack}d`;
      }

      const oauth2Client = new google.auth.OAuth2();
      oauth2Client.setCredentials({ access_token: accessToken });

      const gmail = google.gmail({ version: "v1", auth: oauth2Client });

      const searchRes = await gmail.users.threads.list({
        userId: "me",
        q: effectiveQuery,
        maxResults: Math.min(Math.max(Number(maxResults) || 20, 10), 50),
      });

      const threads = searchRes.data.threads || [];
      const threadSummaries = [];

      // Fetch preview for threads (up to 25 items for thorough review)
      const previewLimit = Math.min(threads.length, 25);
      for (const thread of threads.slice(0, previewLimit)) {
        if (!thread.id) continue;
        try {
          const detailRes = await gmail.users.threads.get({
            userId: "me",
            id: thread.id,
            format: "metadata",
            metadataHeaders: ["Subject", "From", "To", "Date"],
          });

          const messages = detailRes.data.messages || [];
          const firstMsg = messages[0] || {};
          const lastMsg = messages[messages.length - 1] || {};
          const lastHeaders = lastMsg.payload?.headers || [];
          const firstHeaders = firstMsg.payload?.headers || [];

          const subject = lastHeaders.find((h) => h.name?.toLowerCase() === "subject")?.value || "(No Subject)";
          const from = lastHeaders.find((h) => h.name?.toLowerCase() === "from")?.value || "Unknown";
          const lastDate = lastHeaders.find((h) => h.name?.toLowerCase() === "date")?.value || "";
          const firstDate = firstHeaders.find((h) => h.name?.toLowerCase() === "date")?.value || lastDate;

          threadSummaries.push({
            id: thread.id,
            snippet: thread.snippet || lastMsg.snippet || "",
            messageCount: messages.length,
            subject,
            from,
            date: lastDate,
            firstDate,
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

        // Extract body plain text if available
        let bodyText = msg.snippet || "";
        if (msg.payload?.parts) {
          for (const part of msg.payload.parts) {
            if (part.mimeType === "text/plain" && part.body?.data) {
              bodyText = Buffer.from(part.body.data, "base64").toString("utf-8");
              break;
            }
          }
        } else if (msg.payload?.body?.data) {
          bodyText = Buffer.from(msg.payload.body.data, "base64").toString("utf-8");
        }

        parsedMessages.push({
          id: msg.id,
          messageId: msg.id,
          from,
          to,
          date,
          subject,
          snippet: msg.snippet,
          bodyText,
          hasAttachments: (msg.payload?.parts || []).some((p) => Boolean(p.filename)),
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
  // Server-side Automation & Application Storage Helpers
  // ----------------------------------------------------
  const DATA_DIR = path.join(process.cwd(), "data");
  if (!fs.existsSync(DATA_DIR)) {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    } catch (e) {}
  }
  const CONFIG_FILE = path.join(DATA_DIR, "automation-config.json");
  const APPS_FILE = path.join(DATA_DIR, "applications-store.json");

  function getStoredAutomationConfig() {
    const defaults = {
      enabled: true,
      scheduleTime: "08:30",
      timezone: "Asia/Kuala_Lumpur",
      intervalHours: 24,
      autoScanGmail: true,
      autoSyncGoogleSheet: true,
      autoSendTelegram: true,
      alertOnCriticalOnly: false,
      hasCompletedFirstScan: false,
      firstScanDurationDays: 365,
      routineScanDurationDays: 30,
      scanScopeMode: "auto",
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
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), "utf8");
    } catch (err) {
      console.error("Could not write automation-config.json:", err);
    }
  }

  function getStoredApplications(): any[] {
    try {
      if (fs.existsSync(APPS_FILE)) {
        const raw = fs.readFileSync(APPS_FILE, "utf8");
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (err) {
      console.warn("Could not read applications-store.json:", err);
    }
    return [];
  }

  function saveStoredApplications(apps: any[]) {
    try {
      fs.writeFileSync(APPS_FILE, JSON.stringify(apps, null, 2), "utf8");
    } catch (err) {
      console.error("Could not write applications-store.json:", err);
    }
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
    const config = getStoredAutomationConfig();
    // Fill in environment variable fallbacks if config is missing values
    if (!config.telegram) {
      config.telegram = {};
    }
    if (!config.telegram.botToken && process.env.TELEGRAM_BOT_TOKEN) {
      config.telegram.botToken = process.env.TELEGRAM_BOT_TOKEN;
    }
    if (!config.telegram.chatId && process.env.TELEGRAM_CHAT_ID) {
      config.telegram.chatId = process.env.TELEGRAM_CHAT_ID;
    }
    if (!config.telegram.topicId && process.env.TELEGRAM_TOPIC_ID) {
      config.telegram.topicId = process.env.TELEGRAM_TOPIC_ID;
    }
    res.json(config);
  });

  app.post("/api/automation/config", (req: Request, res: Response) => {
    try {
      const incoming = req.body;
      const current = getStoredAutomationConfig();
      const updated = {
        ...current,
        ...incoming,
        telegram: {
          ...(current.telegram || {}),
          ...(incoming.telegram || {}),
        },
      };
      saveStoredAutomationConfig(updated);
      res.json({ success: true, config: updated });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to save configuration", details: err?.message });
    }
  });

  app.post("/api/automation/sync-apps", (req: Request, res: Response) => {
    try {
      const { applications } = req.body;
      if (Array.isArray(applications)) {
        saveStoredApplications(applications);
        res.json({ success: true, count: applications.length });
      } else {
        res.status(400).json({ error: "Invalid applications array" });
      }
    } catch (err: any) {
      res.status(500).json({ error: "Failed to save applications", details: err?.message });
    }
  });

  // ----------------------------------------------------
  // 9. Telegram API: Test Connection Endpoint
  // ----------------------------------------------------
  app.post("/api/telegram/test", async (req: Request, res: Response) => {
    try {
      const { botToken, chatId, topicId } = req.body;
      const token = (botToken || process.env.TELEGRAM_BOT_TOKEN || "").trim();
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
      const token = (botToken || process.env.TELEGRAM_BOT_TOKEN || "").trim();
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
      const tgBotToken = (botToken || process.env.TELEGRAM_BOT_TOKEN || "").trim();
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
  // 11. Automated Morning Engine: Run Full End-to-End Pipeline
  // ----------------------------------------------------
  app.post("/api/automation/run", async (req: Request, res: Response) => {
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

    try {
      const {
        applications = [],
        sheetConfig: directSheetConfig,
        spreadsheetId,
        sheetName,
        spreadsheetUrl,
        telegramConfig,
        autoScanGmail: directAutoScan,
        autoSyncSheet: directAutoSync,
        autoSendTelegram: directAutoTelegram,
        options = {},
      } = req.body;

      const sheetConfig = directSheetConfig || (spreadsheetId ? {
        spreadsheetId,
        sheetName: sheetName || "Active CoC Applications",
        spreadsheetUrl: spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
      } : null);

      const autoScanGmail = options.autoScanGmail !== undefined ? options.autoScanGmail : (directAutoScan !== undefined ? directAutoScan : true);
      const autoSyncSheet = options.autoSyncSheet !== undefined ? options.autoSyncSheet : (directAutoSync !== undefined ? directAutoSync : true);
      const autoSendTelegram = options.autoSendTelegram !== undefined ? options.autoSendTelegram : (directAutoTelegram !== undefined ? directAutoTelegram : true);

      // Load stored automation config to check first-time vs routine policy
      const storedConfig = getStoredAutomationConfig();
      const isFirstScan = options.isFirstScan !== undefined
        ? Boolean(options.isFirstScan)
        : !storedConfig.hasCompletedFirstScan;

      // Scan duration in days: 365 days (1 whole year) for first-time scan, 30 days (1 month) for routine scan
      const scanDays = options.scanDays
        ? Number(options.scanDays)
        : isFirstScan
        ? (storedConfig.firstScanDurationDays || 365)
        : (storedConfig.routineScanDurationDays || 30);

      let currentApplications = [...applications];
      let newEmailsDetected = 0;
      const authHeader = req.headers.authorization;
      const accessToken = authHeader && authHeader.startsWith("Bearer ") ? authHeader.split(" ")[1] : null;

      addLog("SYSTEM", "INFO", `Started automated SIRIM morning synchronization cycle (${isFirstScan ? "First-Time Historical Mode" : "Routine Scan Mode"}).`);

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

          // Construct query respecting first-time (365d) vs routine (30d) duration
          const queryBase = 'from:sirim.my OR subject:sirim OR subject:ecomm OR subject:sqas OR subject:"Type Approval" OR subject:"Certificate of Conformity" OR "Certificate of Conformity"';
          const scanQuery = options.scanQuery || `(${queryBase}) newer_than:${scanDays}d`;
          const maxThreadSearch = isFirstScan ? 35 : 15;

          const searchRes = await gmail.users.threads.list({
            userId: "me",
            q: scanQuery,
            maxResults: maxThreadSearch,
          });

          const foundThreads = searchRes.data.threads || [];
          addLog("SCAN", "SUCCESS", `Found ${foundThreads.length} email threads in Gmail within past ${scanDays} days.`);

          // Process threads (up to 15 for first-time scan to build deep history, up to 8 for routine)
          const processLimit = isFirstScan ? Math.min(foundThreads.length, 15) : Math.min(foundThreads.length, 8);
          for (const thread of foundThreads.slice(0, processLimit)) {
            if (!thread.id) continue;
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
              const subject = lastHeaders.find((h) => h.name?.toLowerCase() === "subject")?.value || "";
              const from = lastHeaders.find((h) => h.name?.toLowerCase() === "from")?.value || "";
              const lastDate = lastHeaders.find((h) => h.name?.toLowerCase() === "date")?.value || "";
              const firstHeaders = firstMsg.payload?.headers || [];
              const firstDate = firstHeaders.find((h) => h.name?.toLowerCase() === "date")?.value || lastDate;

              // Extract text across all messages in chronological sequence to understand full application progression
              const threadTranscript = messages.map((m: any, mIdx: number) => {
                const mHeaders = m.payload?.headers || [];
                const mFrom = mHeaders.find((h: any) => h.name?.toLowerCase() === "from")?.value || "Unknown";
                const mDate = mHeaders.find((h: any) => h.name?.toLowerCase() === "date")?.value || "";
                let text = m.snippet || "";
                if (m.payload?.parts) {
                  for (const part of m.payload.parts) {
                    if (part.mimeType === "text/plain" && part.body?.data) {
                      text = Buffer.from(part.body.data, "base64").toString("utf-8");
                      break;
                    }
                  }
                }
                return `[Message ${mIdx + 1} | From: ${mFrom} | Date: ${mDate}]\n${text.slice(0, 1500)}`;
              }).join("\n\n---\n\n");

              // Determine if this thread matches an existing application
              const existingIdx = currentApplications.findIndex(
                (a) => a.threadId === thread.id || (a.applicationRef && subject.toLowerCase().includes(a.applicationRef.toLowerCase()))
              );
              const existingApp = existingIdx >= 0 ? currentApplications[existingIdx] : null;

              // Parse with AI parser / fallback heuristic parser
              let parsed: any = null;
              try {
                const ai = getGeminiClient();
                const prompt = `Analyze this multi-stage Malaysian SIRIM certification email thread (${messages.length} messages, dating from ${firstDate} to ${lastDate}):
Subject: ${subject}
Existing Status: ${existingApp?.status || "None"}

Thread Transcript:
${threadTranscript.slice(0, 5000)}`;

                const aiRes = await generateContentWithRetryAndFallback(
                  ai,
                  "gemini-3.7-flash",
                  prompt,
                  {
                    responseMimeType: "application/json",
                  },
                  "gemini-2.5-flash"
                );
                parsed = JSON.parse(aiRes.text?.trim() || "{}");
              } catch (parseErr) {
                parsed = fallbackHeuristicSirimParser(subject, threadTranscript, from, lastDate);
              }

              if (parsed && parsed.isSirimRelated !== false) {
                newEmailsDetected++;

                // Map email messages for thread storage
                const newEmailMessages = messages.map((m: any) => {
                  const mHeaders = m.payload?.headers || [];
                  const mSub = mHeaders.find((h: any) => h.name?.toLowerCase() === "subject")?.value || subject;
                  const mFrom = mHeaders.find((h: any) => h.name?.toLowerCase() === "from")?.value || from;
                  const mDate = mHeaders.find((h: any) => h.name?.toLowerCase() === "date")?.value || lastDate;
                  let bodyText = m.snippet || "";
                  if (m.payload?.parts) {
                    for (const part of m.payload.parts) {
                      if (part.mimeType === "text/plain" && part.body?.data) {
                        bodyText = Buffer.from(part.body.data, "base64").toString("utf-8");
                        break;
                      }
                    }
                  }
                  return {
                    id: m.id || `msg-${Date.now()}-${Math.random()}`,
                    messageId: m.id || "",
                    from: mFrom,
                    to: "applicant@cytron.io",
                    date: mDate,
                    subject: mSub,
                    snippet: m.snippet || "",
                    bodyText,
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

                  // Merge action items without duplicates
                  const existingActions = existing.actionItems || [];
                  const mergedActions = [...existingActions];
                  if (Array.isArray(parsed.actionItems)) {
                    parsed.actionItems.forEach((act: any, actIdx: number) => {
                      if (!mergedActions.some((a) => a.title.toLowerCase() === act.title.toLowerCase())) {
                        mergedActions.push({
                          id: `act-auto-${Date.now()}-${actIdx}`,
                          title: act.title,
                          description: act.description || "",
                          assignedTo: act.assignedTo || "APPLICANT",
                          dueDate: act.dueDate || new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0],
                          isCompleted: false,
                          priority: act.priority || "HIGH",
                          requiredActionType: act.requiredActionType || "PROVIDE_CLARIFICATION",
                        });
                      }
                    });
                  }

                  currentApplications[existingIdx] = {
                    ...existing,
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
                    actionItems: (parsed.actionItems || []).map((act: any, i: number) => ({
                      id: `act-auto-${Date.now()}-${i}`,
                      title: act.title,
                      description: act.description || "",
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
        addLog("SCAN", "INFO", "Gmail scan bypassed (no active OAuth session or disabled).");
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

      // STEP 3: Dispatch Telegram Digest / Notification
      let telegramSent = false;
      const tgBotToken = telegramConfig?.botToken || process.env.TELEGRAM_BOT_TOKEN;
      const tgChatId = telegramConfig?.chatId || process.env.TELEGRAM_CHAT_ID;

      if (autoSendTelegram && tgBotToken && tgChatId) {
        addLog("TELEGRAM", "INFO", `Formatting and sending morning briefing to Telegram Chat (${tgChatId})...`);
        try {
          const briefingText = formatTelegramBriefing(currentApplications, {
            sheetUrl: sheetConfig?.spreadsheetUrl,
            newScannedCount: newEmailsDetected,
          });

          await sendTelegramRawMessage(tgBotToken, tgChatId, briefingText, {
            topicId: telegramConfig?.topicId,
          });

          telegramSent = true;
          addLog("TELEGRAM", "SUCCESS", "Telegram morning digest and urgent alerts successfully delivered.");
        } catch (tgErr: any) {
          addLog("TELEGRAM", "ERROR", `Telegram delivery failed: ${tgErr?.message || tgErr}`);
        }
      } else {
        addLog("TELEGRAM", "INFO", "Telegram dispatch skipped (bot token or chat ID not configured).");
      }

      addLog("SYSTEM", "SUCCESS", "Automated synchronization pipeline completed successfully.");

      res.json({
        success: true,
        summary: `Cycle finished (${isFirstScan ? "1-Year Historical Ingestion" : "1-Month Routine Scan"}): ${newEmailsDetected} new emails detected, ${sheetSyncSuccess ? "Sheet updated" : "Sheet skipped"}, ${telegramSent ? "Telegram sent" : "Telegram skipped"}.`,
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
        logs,
      });
    } catch (err: any) {
      console.error("Error in automation/run:", err);
      addLog("SYSTEM", "ERROR", `Automation pipeline encountered error: ${err?.message || err}`);
      res.status(500).json({
        error: "Automation execution encountered an error",
        details: err?.message || String(err),
        logs,
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
        config,
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
  // Runs 24/7 on local Node server or Cloud Run, checking every 60s
  // ----------------------------------------------------
  setInterval(async () => {
    try {
      const config = getStoredAutomationConfig();
      if (!config || !config.enabled) return;

      const tgBotToken = (config.telegram?.botToken || process.env.TELEGRAM_BOT_TOKEN || "").trim();
      const tgChatId = (config.telegram?.chatId || process.env.TELEGRAM_CHAT_ID || "").trim();

      if (!config.autoSendTelegram || !tgBotToken || !tgChatId) return;

      const now = new Date();
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

      // Check last run date
      let lastRunDate = null;
      if (config.lastRunAt) {
        try {
          lastRunDate = new Intl.DateTimeFormat("en-CA", {
            timeZone: "Asia/Kuala_Lumpur",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          }).format(new Date(config.lastRunAt));
        } catch (e) {}
      }

      // If already ran today in MYT, do not duplicate
      if (lastRunDate === mytDate) {
        return;
      }

      // If reached or passed target scheduled time today
      if (mytTime >= targetTime) {
        console.log(`[Autonomous Scheduler] Triggering morning Telegram briefing for ${mytDate} at ${mytTime} MYT (Scheduled: ${targetTime})`);
        
        const apps = getStoredApplications();
        const briefingText = formatTelegramBriefing(apps, {
          title: "SIRIM CoC Daily Morning Briefing",
        });

        await sendTelegramRawMessage(tgBotToken, tgChatId, briefingText, {
          topicId: config.telegram?.topicId,
        });

        config.lastRunAt = new Date().toISOString();
        config.lastRunStatus = "SUCCESS";
        config.lastRunSummary = `Autonomous morning digest delivered to Telegram (${apps.length} active apps, ${mytDate} at ${mytTime} MYT).`;
        
        if (!Array.isArray(config.logs)) config.logs = [];
        config.logs.unshift({
          id: `log-${Date.now()}`,
          timestamp: new Date().toISOString(),
          type: "TELEGRAM",
          status: "SUCCESS",
          message: `Autonomous morning briefing delivered to Telegram Chat (${tgChatId}).`,
        });
        if (config.logs.length > 50) config.logs = config.logs.slice(0, 50);

        saveStoredAutomationConfig(config);
        console.log(`[Autonomous Scheduler] Telegram morning briefing delivered successfully.`);
      }
    } catch (schedErr: any) {
      console.error("[Autonomous Scheduler] Error during automation tick:", schedErr?.message || schedErr);
    }
  }, 60000);

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`SIRIM CoC Progress Tracker Server running on port ${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Fatal error during server startup:", err);
  process.exit(1);
});
