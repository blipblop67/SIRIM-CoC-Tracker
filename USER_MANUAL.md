# SIRIM CoC Regulatory Progress Tracker & AI Agent: Complete User Manual & Getting Started Guide

Welcome to the **SIRIM CoC Regulatory Progress Tracker & Team Workspace** user manual. This software is an enterprise-grade regulatory compliance workspace specifically tailored for Malaysian hardware businesses, electrical/electronic importers, OEMs, and compliance teams managing **SIRIM QAS International** and **MCMC e-ComM** type approvals, CIDB, and modular certifications.

---

## Table of Contents
1. [Core Features & Overview](#1-core-features--overview)
2. [Getting Started (Quick Setup)](#2-getting-started-quick-setup)
3. [Ingesting & Scanning SIRIM Emails](#3-ingesting--parsing-sirim-emails)
4. [Autonomous Parsing & Multi-User Collaboration](#4-autonomous-parsing--multi-user-collaboration)
5. [Managing Action Items, RFIs & Deadlines](#5-managing-action-items-rfis--deadlines)
6. [AI Technical Pre-Screening Engine](#6-ai-technical-pre-screening-engine)
7. [Automated Daily Briefings & Telegram Bot](#7-automated-daily-briefings--telegram-bot)
8. [Google Sheets Two-Way Live Sync](#8-google-sheets-two-way-live-sync)
9. [Team Collaboration, Presence & Audit Trail](#9-team-collaboration-presence--audit-trail)
10. [FAQ & Troubleshooting](#10-faq--troubleshooting)

---

## 1. Core Features & Overview

- **Zero-Manual-Entry Inbox Ingestion:** Connect your Google Workspace account or paste raw emails directly. The agent extracts Application References (e.g., `SQAS/CMCS/2026/...`, `eComM-...`), Officer details, test lab contacts, sample requirements, and payment demands.
- **Smart Chain & Multi-Member Deduplication:** When multiple team members are CC'd on the same SIRIM thread, the agent automatically correlates them into a single centralized record—no duplicated files or conflicting states.
- **Autonomous RFI & Action Resolution:** When an email confirms payment or approval, the engine automatically resolves preceding pending tasks and marks them completed with transparent AI audit notes.
- **AI Document Pre-Screening:** Upload or paste test reports and technical specs to verify Malaysian MCMC/SIRIM standard compliance (e.g., MCMC MTSFB TC T007, MS IEC 62368-1, CISPR 32) before submitting to SIRIM.
- **24/7 Raspberry Pi / Headless Deployment:** Runs 24/7 on local hardware (Raspberry Pi, office mini-PC, or cloud VPS) using SQLite/JSON persistent local file storage with zero cloud subscription lock-in.
- **Telegram Morning Digest:** Sends an automated executive summary every morning (configurable time, default 08:30 MYT) to your engineering Telegram group or direct chat.

---

## 2. Getting Started (Quick Setup)

### Step 2.1: Accessing the Application
Open your browser and navigate to:
- **Cloud/Preview URL:** Provided in your AI Studio deployment or custom domain.
- **Local Network / Raspberry Pi:** `http://<RPI_IP>:3000` (e.g. `http://192.168.1.150:3000` or `http://raspberrypi.local:3000`).

### Step 2.2: Signing in with Google Workspace
1. In the top-right corner of the header, click **Sign In**.
2. Select your Google Workspace account (e.g. `user@cytron.io`).
3. Approve the read-only Gmail and Google Sheets scopes.
4. Once authenticated, your user avatar appears in the top navigation, and active collaborator presence is broadcast to the team.

*Note: Even without signing in with Google, you can manually ingest emails, run pre-screen compliance tests, export CSVs, and configure Telegram notifications.*

---

## 3. Ingesting & Parsing SIRIM Emails

There are two primary methods to import regulatory communications:

### Method A: One-Click Gmail Inbox Scan
1. In the top navigation, click **Scan Inbox**.
2. Select your search query filter (default searches for `from:sirim.my OR subject:sirim OR subject:e-comm OR subject:"Type Approval"`).
3. Choose the lookback window: **Last 7 days**, **Last 30 days**, or **Last 90 days**.
4. Click **Start Inbox Scan**.
5. The agent scans your messages, extracts regulatory metadata, and displays preview cards of new or updated applications.
6. Click **Confirm & Import** to save them into the centralized database.

### Method B: Manual Ingestion (Paste Raw Email Text)
1. Click the black **+ Ingest Email** button in the header.
2. Paste the email subject, sender email, and email body (or forward email text).
3. The parser automatically detects:
   - Application reference numbers
   - Brand, model, and product name
   - SIRIM scheme (Type Approval, Modular Approval, Special Approval, CIDB, Safety & EMC)
   - Officer names, contact numbers, and emails
   - Outstanding Request for Information (RFI) items, document requests, and fees
4. Review the parsed fields and click **Save Application**.

---

## 4. Autonomous Parsing & Multi-User Collaboration

### What happens when multiple team members receive the same email?
In typical engineering and compliance workflows, multiple engineers (e.g., hardware engineer, purchasing officer, and regulatory lead) are copied on SIRIM QAS threads.

- **Unified Record Matching:** The system matches incoming messages by **Application Reference Number** (`SQAS/...` or `eComM-...`) and **Thread ID**.
- **No Duplicate Records:** Rather than creating multiple cards for the same product, the system merges the new email into the existing application's timeline.
- **Collaborative Conflict Resolution:** If Team Member A parses the email at 9:00 AM and Team Member B parses an updated follow-up at 10:15 AM, the latest email timestamp and action items win, keeping all team members synchronized.
- **Activity Feed:** Every update is logged in the **Team Activity Drawer** (`Activity icon` in the header) showing who parsed the email and what changes occurred.

---

## 5. Managing Action Items, RFIs & Deadlines

Every application contains a dedicated **Action Items & RFIs** tab:

1. **Active Tasks vs. Passive Waiting:**
   - **Action Required:** Immediate applicant deliverables (e.g., pay RM 1,200 evaluation fee, upload revised PCB schematic, courier physical test sample).
   - **Pending Statement / Passive Waiting:** Items where our team is awaiting SIRIM's test lab report or officer reply.
2. **Assigning Team Members:** Click on any action item to assign it to a team member (e.g. `rupa@cytron.io`). Team members can filter the entire board by **"My Tasks"** using the assignee filter.
3. **AI Autonomous Task Resolution:**
   - When a subsequent email arrives stating *"We acknowledge receipt of your sample test report"* or *"Payment received with official receipt"*, the AI automatically marks the respective task as **Completed**.
   - The task will be badged with `Auto-resolved by AI` along with the exact justification reason.
4. **Draft AI Replies:**
   - Click the **Draft AI Reply** button on any application or RFI item.
   - The engine generates a professional, formal response addressed to the specific SIRIM officer, referencing the application reference number and addressing each requested point concisely.
   - You can copy the reply or copy a supplier follow-up chaser email in one click.

---

## 6. AI Technical Pre-Screening Engine

Before submitting costly official applications or paying non-refundable SIRIM assessment fees, use the built-in **AI Pre-Screen Compliance** tool:

1. In the header dropdown menu (`···`), select **AI Pre-Screen Compliance** (or click the Pre-Screen tab in any application).
2. Choose your document type:
   - **RF / EMC Test Report** (FCC / CE / RED test report from lab)
   - **Safety Test Report** (IEC / EN 62368-1)
   - **User Manual & Product Specification**
   - **Draft Label / Marking Sample**
3. Paste the technical text, table of contents, frequency allocation tables, or summary extracts.
4. Click **Run AI Pre-Screen Evaluation**.
5. The engine verifies compliance against Malaysian regulatory standards:
   - **MCMC Class Assignment:** Frequencies (2.4 GHz, 5 GHz bands, Wi-Fi 6E/7, Sub-1GHz, LoRa 919-923 MHz, Bluetooth).
   - **Output Power / EIRP Limits:** Ensures conducted and radiated power adhere to Malaysian limits (e.g. 500mW EIRP for 919-923 MHz LoRa; 100mW EIRP for 2.4 GHz).
   - **Lab Accreditation:** Checks for ILAC-MRA or ISO/IEC 17025 accredited test laboratory endorsement.
6. **Verdict & Score:** You receive a compliance health score, identified risks of rejection, and recommended corrective steps prior to e-ComM submission.

---

## 7. Autonomous Compliance Agent (Zero Human Trigger Operation)

Once you grant access to your **Gmail** and connect your **Master Google Sheet**, the compliance agent runs **100% autonomously in the background without requiring any human triggers**:

### How Autonomous Mode Works:
1. **Continuous Inbox Monitoring:** The agent continuously polls your Gmail inbox on a 15-minute background loop for incoming SIRIM QAS / e-ComM messages.
2. **AI Semantic Parsing:** Gemini AI automatically identifies new applications, status updates, sample testing requests, and official payment receipts.
3. **Hands-Free Action Resolution:** When incoming emails contain requested documents, proof of payment, or test reports, the agent autonomously marks corresponding checklist action items as resolved.
4. **Automatic Master Google Sheet Synchronization:** Updated application rows, SLA deadlines, and direct Gmail thread links are immediately pushed to your connected Google Sheet hands-free.
5. **Instant Alerts & Morning Briefing:** Dispatches instant Telegram alerts for urgent RFIs and sends a comprehensive daily digest at 08:30 MYT.

### Setting Up Telegram Notifications (Optional):
1. In the header, click the **Zap (⚡)** icon or open the menu and choose **Automation & Telegram Bot**.
2. **Create a Bot via BotFather:**
   - Open Telegram and search for `@BotFather`.
   - Send `/newbot`, choose a name and username, and copy the **HTTP API Bot Token**.
   - Paste the token into the **Telegram Bot Token** field.
3. **Get Your Chat ID / Group Topic:**
   - Add your bot to your team Telegram group.
   - Send a message in the group.
   - Use `@userinfobot` or call `https://api.telegram.org/bot<TOKEN>/getUpdates` to find the negative Chat ID (e.g. `-1001234567890`).
   - Paste it into the **Chat ID** field. (If using Telegram Forum Topics, enter the **Topic / Thread ID**).
4. Click **Test Telegram Alert** to verify message delivery.
5. Select your desired **Autonomous Polling Cadence** (default: `Every 15 Minutes`).
6. Set your desired **Morning Schedule Time** (default: `08:30` Asia/Kuala_Lumpur).
7. Save settings.

*Every morning at the scheduled time, the system compiles:*
- Urgent deadlines and overdue RFIs
- Payments pending
- Applications awaiting SIRIM action
- New approvals granted in the last 24 hours

---

## 8. Google Sheets Two-Way Live Sync

Maintain an executive register spreadsheet for management and external auditors:

1. Click **More Actions (···)** > **Connect Google Sheet**.
2. Paste the **Google Sheet URL** or spreadsheet ID.
3. The engine creates/updates standard columns:
   - `Reference`, `Product Name`, `Model`, `Scheme`, `Status`, `Officer`, `Last Contact`, `Outstanding Tasks`, `Target Date`.
4. Click **Sync Now** to push all current records.
5. In **Automation Settings**, enable **Auto-sync to Google Sheet** so your spreadsheet is kept updated automatically during morning runs.

---

## 9. Team Collaboration, Presence & Audit Trail

- **Active Presence Avatars:** Look at the top bar to see which team members are currently online and reviewing applications.
- **Audit Log:** Open the **Activity Drawer** (pulse icon) to view:
  - Who added or edited an application
  - Who completed an action item
  - Automated AI resolutions and sync events
- **Data Export:** Click **Export Register to CSV** anytime for offline analysis, archiving, or import into internal ERP systems.

---

## 10. FAQ & Troubleshooting

#### Q: Does the agent require any human triggers once access is granted?
**A:** No. Once you sign in with your Google account (granting access to Gmail for reading SIRIM emails) and link your Master Google Sheet, the agent is 100% autonomous. It runs continuously in the background on your chosen cadence (every 15 minutes by default), auto-evaluating incoming communications, updating checklist action items, and syncing changes to your Google Sheet without any human intervention.

#### Q: Where is our application data stored?
**A:** All data is safely stored in the local server directory `./data/applications-store.json` on the hosting machine (such as your Raspberry Pi). Client web browsers cache records for instant loading and synchronize with the server every 30 seconds.

#### Q: Can other team members access the tracker from their laptops?
**A:** Yes! When running on your local network (e.g. Raspberry Pi), any computer or phone connected to the same Wi-Fi / office network can access `http://<RPI_IP>:3000`.

#### Q: How do I back up our data?
**A:** Simply copy the `./data/` folder on your server:
```bash
cp -r ./data ~/sirim_backup_$(date +%Y%m%d)
```

#### Q: Why is there no checkbox to tick on actions that are pending because of a third party?
**A:** Checkboxes are intentionally limited to **internal team actions** (tasks your team controls, such as paying processing fees or submitting test reports). When an item is pending due to an external third party (e.g. SIRIM officer evaluation, supplier declaration, accredited lab report), your team is waiting on them. Ticking a box would falsely mark an unresolved external dependency as complete. These items display a distinct pending clock indicator and resolve automatically when incoming emails or reports arrive, or you can use the **Draft Chaser / Follow-up** button to send an email follow-up.

#### Q: What if a SIRIM email format changes?
**A:** The parser utilizes multi-pattern regex combined with semantic extraction that adapts to different SIRIM QAS branches (Shah Alam, Bukit Jalil), e-ComM automated notifications, and officer direct replies.

---
*Developed for hardware engineering & regulatory compliance teams.*
