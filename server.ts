import express, { Request, Response } from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import { google } from "googleapis";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Lazy initialization for Gemini API
function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is not configured");
  }
  return new GoogleGenAI({ apiKey });
}

async function startServer() {
  const app = express();
  const PORT = 3000;

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

      const response = await ai.models.generateContent({
        model: "gemini-3.7-flash",
        contents: prompt,
        config: {
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
      });

      const jsonText = response.text?.trim();
      if (!jsonText) {
        throw new Error("No response returned by Gemini model");
      }

      const parsedData = JSON.parse(jsonText);
      res.json({ success: true, data: parsedData });
    } catch (err: any) {
      console.error("Error in parse-email-thread:", err);
      res.status(500).json({
        error: "Failed to parse email with Gemini AI",
        details: err?.message || String(err),
      });
    }
  });

  // ----------------------------------------------------
  // 2. Gemini AI: Draft Official Response to SIRIM
  // ----------------------------------------------------
  app.post("/api/gemini/generate-reply", async (req: Request, res: Response) => {
    try {
      const {
        applicationRef,
        productName,
        modelNumber,
        officerName,
        responseIntent, // 'SUBMIT_DOCS' | 'REQUEST_EXTENSION' | 'STATUS_FOLLOWUP' | 'SAMPLE_TRACKING' | 'CUSTOM'
        customNotes,
        actionItemDetails,
      } = req.body;

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

      const response = await ai.models.generateContent({
        model: "gemini-3.7-flash",
        contents: prompt,
        config: {
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
      });

      const jsonText = response.text?.trim();
      const parsedDraft = JSON.parse(jsonText || "{}");
      res.json({ success: true, draft: parsedDraft });
    } catch (err: any) {
      console.error("Error in generate-reply:", err);
      res.status(500).json({
        error: "Failed to generate reply with Gemini AI",
        details: err?.message || String(err),
      });
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

          rowsData.push([
            appItem.applicationRef || "",
            appItem.productName || "",
            appItem.modelNumber || "",
            appItem.brand || "",
            appItem.scheme || "",
            appItem.status || "",
            appItem.officerName || "",
            appItem.officerEmail || "",
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
            // Auto resize or set reasonable column widths
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
            // Set text wrap on Action items & Product name columns
            {
              repeatCell: {
                range: {
                  sheetId: firstSheetId,
                  startRowIndex: 1,
                  startColumnIndex: 11, // Pending Action Items
                  endColumnIndex: 12,
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

        rowsData.push([
          appItem.applicationRef || "",
          appItem.productName || "",
          appItem.modelNumber || "",
          appItem.brand || "",
          appItem.scheme || "",
          appItem.status || "",
          appItem.officerName || "",
          appItem.officerEmail || "",
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
  // Vite Middleware Setup
  // ----------------------------------------------------
  if (process.env.NODE_ENV !== "production") {
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
