import express, { Request, Response } from "express";
import path from "path";
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
  
  // Status detection
  let status = "UNDER_REVIEW";
  let scheme = "Type Approval (MCMC/SIRIM)";
  const lower = fullText.toLowerCase();

  if (lower.includes("rfi") || lower.includes("request for information") || lower.includes("clarification") || lower.includes("amendment")) {
    status = "RFI_ACTION_REQUIRED";
  } else if (lower.includes("sample") && (lower.includes("submit") || lower.includes("courier") || lower.includes("request") || lower.includes("call notice"))) {
    status = "SAMPLE_REQUESTED";
  } else if (lower.includes("invoice") || lower.includes("fee") || lower.includes("payment pending") || lower.includes("unpaid")) {
    status = "PAYMENT_PENDING";
  } else if (lower.includes("approved") || lower.includes("certificate issued") || lower.includes("coa issued") || lower.includes("issuance of certificate")) {
    status = "APPROVED";
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
      description: "Review SIRIM queries and reply with updated schematics, manual, or test reports.",
      assignedTo: "APPLICANT",
      dueDate: new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0],
      priority: "HIGH",
      requiredActionType: "PROVIDE_CLARIFICATION",
      emailSourceSnippet: cleanSubject,
    });
  } else if (status === "SAMPLE_REQUESTED") {
    actionItems.push({
      title: "Deliver test samples to SIRIM QAS Lab (Shah Alam)",
      description: "Prepare and courier hardware test units along with power cables and RF test modes.",
      assignedTo: "APPLICANT",
      dueDate: new Date(Date.now() + 14 * 86400000).toISOString().split("T")[0],
      priority: "HIGH",
      requiredActionType: "SEND_SAMPLE",
      emailSourceSnippet: cleanSubject,
    });
  } else if (status === "PAYMENT_PENDING") {
    actionItems.push({
      title: "Settle outstanding SIRIM processing fee invoice via e-ComM",
      description: "Submit payment online and upload the payment receipt.",
      assignedTo: "APPLICANT",
      dueDate: new Date(Date.now() + 5 * 86400000).toISOString().split("T")[0],
      priority: "CRITICAL",
      requiredActionType: "PAY_FEE",
      emailSourceSnippet: cleanSubject,
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
    summary: `Communication ingested: ${cleanSubject}`,
    actionItems,
    timelineEvent: {
      date: date ? date.split("T")[0] : new Date().toISOString().split("T")[0],
      title: `SIRIM Communication: ${cleanSubject.slice(0, 50)}`,
      description: `Ingested email regarding ${applicationRef} (${status}).`,
      sender: sender || "SIRIM QAS",
      emailSubject,
      type: status === "RFI_ACTION_REQUIRED" ? "rfi" : status === "SAMPLE_REQUESTED" ? "sample" : status === "PAYMENT_PENDING" ? "payment" : "status_change",
    },
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
Analyze the following email communication related to a SIRIM certification application.

Extract accurate, structured regulatory data.

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
1. Determine if this email is related to SIRIM QAS / e-ComM / MCMC / CIDB / CoC / Type Approval / Safety approval.
2. Extract the Application Reference No / Job No (e.g. SQAS/CMCS/2026/..., eComM Ref, etc.). If none found, generate a plausible reference based on the subject.
3. Extract Product Name, Model Number, Brand, Applicant company name.
4. Identify Certification Scheme ('Type Approval (MCMC/SIRIM)', 'Special Approval', 'Modular Approval', 'CIDB Certification', 'Safety & EMC (MS Standards)').
5. Identify current status from: 'SUBMITTED', 'UNDER_REVIEW', 'SAMPLE_REQUESTED', 'SAMPLE_SUBMITTED', 'TESTING_IN_PROGRESS', 'RFI_ACTION_REQUIRED', 'PAYMENT_PENDING', 'FINAL_EVALUATION', 'APPROVED', 'REJECTED', 'EXPIRED'.
6. Extract officer name and email if mentioned.
7. Extract critical action items (what needs to be done, who is responsible: APPLICANT or SIRIM or LAB, due date if specified or SLA deadline, action type: SUBMIT_DOC, PAY_FEE, SEND_SAMPLE, PROVIDE_CLARIFICATION, AWAIT_SIRIM, RENEW_CERTIFICATE, priority: CRITICAL, HIGH, MEDIUM, LOW).
8. If certificate was issued, extract Certificate No and Expiry Date.
9. If fees mentioned in RM (Ringgit Malaysia), extract processing fee and payment status.
10. Formulate a clean timeline event title and concise description of what happened in this email.

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
  // 5. Gmail: Search Relevant Threads
  // ----------------------------------------------------
  app.post("/api/gmail/search", async (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Missing or invalid Google OAuth Authorization header" });
      }

      const accessToken = authHeader.split(" ")[1];
      const { query = 'SIRIM OR eComM OR "Certificate of Conformity" OR "Type Approval" OR "SIRIM QAS" OR "SQAS"', maxResults = 15 } = req.body;

      const oauth2Client = new google.auth.OAuth2();
      oauth2Client.setCredentials({ access_token: accessToken });

      const gmail = google.gmail({ version: "v1", auth: oauth2Client });

      const searchRes = await gmail.users.threads.list({
        userId: "me",
        q: query,
        maxResults: Math.min(maxResults, 30),
      });

      const threads = searchRes.data.threads || [];
      const threadSummaries = [];

      // Fetch preview for each thread
      for (const thread of threads.slice(0, 10)) {
        if (!thread.id) continue;
        try {
          const detailRes = await gmail.users.threads.get({
            userId: "me",
            id: thread.id,
            format: "metadata",
            metadataHeaders: ["Subject", "From", "To", "Date"],
          });

          const messages = detailRes.data.messages || [];
          const lastMsg = messages[messages.length - 1] || {};
          const headers = lastMsg.payload?.headers || [];

          const subject = headers.find((h) => h.name?.toLowerCase() === "subject")?.value || "(No Subject)";
          const from = headers.find((h) => h.name?.toLowerCase() === "from")?.value || "Unknown";
          const date = headers.find((h) => h.name?.toLowerCase() === "date")?.value || "";

          threadSummaries.push({
            id: thread.id,
            snippet: thread.snippet || lastMsg.snippet || "",
            messageCount: messages.length,
            subject,
            from,
            date,
          });
        } catch (e) {
          console.warn(`Could not get metadata for thread ${thread.id}`, e);
        }
      }

      res.json({
        success: true,
        query,
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
    const headerTitle = options.title || (options.isUrgentAlert ? "SIRIM CoC Urgent Action Alert" : "SIRIM CoC Daily Morning Briefing");

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
        const actionText = pending ? pending.title : (app.notes || app.status);
        const officer = app.officerName ? ` (Officer: ${app.officerName})` : "";

        let statusBadge = "⚠️ RFI Required";
        if (app.status === "SAMPLE_REQUESTED") statusBadge = "📦 Sample Requested";
        else if (app.status === "PAYMENT_PENDING") statusBadge = "💳 Payment Due";
        else if (app.status === "TESTING_IN_PROGRESS") statusBadge = "🔬 Testing in Progress";

        const query = app.applicationRef || app.modelNumber || "SIRIM";
        const gmailLink = app.gmailThreadLink || `https://mail.google.com/mail/u/0/#search/${encodeURIComponent(query)}`;

        msg += `<b>${idx + 1}. [${app.applicationRef || "Ref N/A"}]</b> ${app.productName || "Equipment"} (<code>${app.modelNumber || "Model N/A"}</code>)\n`;
        msg += `   • Status: <b>${statusBadge}</b>${officer}\n`;
        if (app.targetDeadline) {
          msg += `   • SLA Deadline: <b>${app.targetDeadline}</b>\n`;
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
  // 9. Telegram API: Test Connection Endpoint
  // ----------------------------------------------------
  app.post("/api/telegram/test", async (req: Request, res: Response) => {
    try {
      const { botToken, chatId, topicId } = req.body;
      const testMessage = `✅ <b>SIRIM CoC Tracker — Telegram Connection Verified!</b>\n\n` +
        `Your Telegram bot is successfully connected and configured to receive:\n` +
        `• 🌅 Daily Morning Status Digests & Summaries\n` +
        `• 🚨 Instant alerts for SIRIM RFIs & Clarification requests\n` +
        `• 📦 Sample Call Notices & Lab Delivery Deadlines\n` +
        `• 📊 Auto-updated Google Sheet direct links\n\n` +
        `<i>Time: ${new Date().toLocaleTimeString("en-GB", { timeZone: "Asia/Kuala_Lumpur" })} MYT</i>`;

      const tgResult = await sendTelegramRawMessage(botToken, chatId, testMessage, { topicId });
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

      const tgResult = await sendTelegramRawMessage(botToken, chatId, textToSend, { topicId });
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

      let currentApplications = [...applications];
      let newEmailsDetected = 0;
      const authHeader = req.headers.authorization;
      const accessToken = authHeader && authHeader.startsWith("Bearer ") ? authHeader.split(" ")[1] : null;

      addLog("SYSTEM", "INFO", "Started automated SIRIM morning synchronization cycle.");

      // STEP 1: Scan Gmail if access token provided & autoScan enabled
      if (autoScanGmail && accessToken) {
        addLog("SCAN", "INFO", "Scanning Gmail inbox for new SIRIM QAS and e-ComM correspondence...");
        try {
          const oauth2Client = new google.auth.OAuth2();
          oauth2Client.setCredentials({ access_token: accessToken });
          const gmail = google.gmail({ version: "v1", auth: oauth2Client });

          // Search recent SIRIM threads (last 2 days)
          const searchRes = await gmail.users.threads.list({
            userId: "me",
            q: 'from:sirim.my OR subject:sirim OR subject:ecomm OR subject:sqas OR subject:"Type Approval" OR subject:"Certificate of Conformity" newer_than:2d',
            maxResults: 10,
          });

          const foundThreads = searchRes.data.threads || [];
          addLog("SCAN", "SUCCESS", `Found ${foundThreads.length} recent matching email threads in Gmail.`);

          // Process and ingest any new threads
          for (const thread of foundThreads.slice(0, 5)) {
            if (!thread.id) continue;
            try {
              const threadRes = await gmail.users.threads.get({
                userId: "me",
                id: thread.id,
                format: "full",
              });

              const messages = threadRes.data.messages || [];
              const lastMsg = messages[messages.length - 1];
              if (!lastMsg) continue;

              const headers = lastMsg.payload?.headers || [];
              const subject = headers.find((h) => h.name?.toLowerCase() === "subject")?.value || "";
              const from = headers.find((h) => h.name?.toLowerCase() === "from")?.value || "";
              const date = headers.find((h) => h.name?.toLowerCase() === "date")?.value || "";

              let bodyText = lastMsg.snippet || "";
              if (lastMsg.payload?.parts) {
                for (const part of lastMsg.payload.parts) {
                  if (part.mimeType === "text/plain" && part.body?.data) {
                    bodyText = Buffer.from(part.body.data, "base64").toString("utf-8");
                    break;
                  }
                }
              }

              // Parse with AI parser / fallback
              let parsed: any = null;
              try {
                const ai = getGeminiClient();
                const prompt = `Extract SIRIM CoC regulatory information from this email:\nSubject: ${subject}\nFrom: ${from}\nBody: ${bodyText.slice(0, 2000)}`;
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
                parsed = fallbackHeuristicSirimParser(subject, bodyText, from, date);
              }

              if (parsed && parsed.isSirimRelated !== false) {
                newEmailsDetected++;
                const existingIdx = currentApplications.findIndex(
                  (a) => (a.applicationRef && parsed.applicationRef && a.applicationRef.toLowerCase() === parsed.applicationRef.toLowerCase()) || a.threadId === thread.id
                );

                const newEmailMsg = {
                  id: lastMsg.id || `msg-${Date.now()}`,
                  messageId: lastMsg.id || "",
                  from,
                  to: "applicant@cytron.io",
                  date: date || new Date().toISOString(),
                  subject,
                  snippet: lastMsg.snippet || "",
                  bodyText,
                };

                if (existingIdx >= 0) {
                  const existing = currentApplications[existingIdx];
                  const threadsList = [...(existing.emailThreads || [])];
                  if (!threadsList.some((m) => m.id === newEmailMsg.id)) {
                    threadsList.push(newEmailMsg);
                  }
                  currentApplications[existingIdx] = {
                    ...existing,
                    status: parsed.status || existing.status,
                    officerName: parsed.officerName || existing.officerName,
                    emailSubject: subject,
                    lastActivityDate: new Date().toISOString().split("T")[0],
                    emailThreads: threadsList,
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
                    submissionDate: parsed.submissionDate || new Date().toISOString().split("T")[0],
                    lastActivityDate: new Date().toISOString().split("T")[0],
                    targetDeadline: parsed.targetDeadline || new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0],
                    emailSubject: subject,
                    gmailThreadLink: `https://mail.google.com/mail/u/0/#all/${thread.id}`,
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
                    timeline: [
                      {
                        id: `tl-auto-${Date.now()}`,
                        date: new Date().toISOString().split("T")[0],
                        title: `Automated Morning Ingestion: ${subject.slice(0, 40)}`,
                        description: `Automatically ingested via daily background scanner.`,
                        sender: from,
                        type: "status_change",
                      },
                    ],
                    emailThreads: [newEmailMsg],
                    syncedToSheet: false,
                  });
                }
              }
            } catch (threadProcErr: any) {
              console.warn("Could not process thread during auto-scan", threadProcErr);
            }
          }
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
        summary: `Cycle finished: ${newEmailsDetected} new emails detected, ${sheetSyncSuccess ? "Sheet updated" : "Sheet skipped"}, ${telegramSent ? "Telegram sent" : "Telegram skipped"}.`,
        applications: currentApplications,
        updatedApplications: currentApplications,
        sheetSyncResult: { success: sheetSyncSuccess },
        scanResult: { threadsFound: newEmailsDetected },
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

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`SIRIM CoC Progress Tracker Server running on port ${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Fatal error during server startup:", err);
  process.exit(1);
});
