# SIRIM CoC Tracker – Getting Started & User Manual

The SIRIM CoC Tracker keeps track of every SIRIM / e-ComM certification application for the Cytron team. An AI agent reads the SIRIM emails in one Gmail inbox, works out the status of each application and what is still outstanding, keeps a Google Sheet up to date and sends a daily Telegram briefing.

This manual has two parts:

- **Part 1 – Getting started:** one-time setup, done by whoever looks after the tracker.
- **Part 2 – User manual:** everyday use, for everyone on the team.

---

# Part 1 – Getting started

## 1.1 What you need

| Item | What it is for |
|---|---|
| The Raspberry Pi running the tracker | Runs the tracker and the agent 24/7 |
| Tailscale on every device that opens the tracker | The tracker's address `https://raspberrypi.tail81be18.ts.net` only opens on devices signed in to Cytron's Tailscale network |
| A Cytron Google account (`@cytron.io`) | To sign in to the tracker |
| Access to the Google Cloud project `gen-lang-client-0455715267` | One-time Google settings |
| The Gmail inbox that receives the SIRIM emails | The agent reads this inbox |
| A Telegram bot and group (optional) | For the daily briefing |

## 1.2 Update and restart the tracker

Do this whenever there is a new version. On the Raspberry Pi:

```bash
cd SIRIM-CoC-Tracker
git pull
npm install
npm run build
sudo systemctl restart sirim-coc-tracker
```

To check it is running: `sudo systemctl status sirim-coc-tracker` should say **active (running)**.

## 1.3 Settings file (`.env`)

The settings live in the `.env` file in the `SIRIM-CoC-Tracker` folder on the Pi (`nano .env` to edit). After any change, restart the tracker (`sudo systemctl restart sirim-coc-tracker`).

| Setting | Example | What it does |
|---|---|---|
| `GEMINI_API_KEY` | `AIzaSy...` | The AI that reads the emails. Required. |
| `APP_URL` | `https://raspberrypi.tail81be18.ts.net` | The tracker's address. No `/` at the end. |
| `GOOGLE_OAUTH_CLIENT_SECRET` | `GOCSPX-...` | Lets the agent stay connected to Gmail every day (see 1.4). |
| `ALLOWED_EMAIL_DOMAINS` | `cytron.io` | Who may sign in. Everyone else is refused. |
| `ALLOWED_EMAILS` | `someone@gmail.com` | Optional extra people outside those domains. |
| `SIRIM_AGENT_EMAILS` | `lim@consultco.com.my` | Optional: SIRIM agent / consultant addresses (can also be set in the app). |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | | Optional: can also be set in the app. |

## 1.4 Google Cloud settings (one time)

These let the agent read Gmail every morning without anyone signed in.

1. Open **console.cloud.google.com/apis/credentials?project=gen-lang-client-0455715267**.
2. Click the OAuth client whose ID starts with **743132044777-ffticf9f**.
3. Under **Authorized redirect URIs**, add exactly:
   `https://raspberrypi.tail81be18.ts.net/api/automation/google/callback`
4. Under **Client secrets**, click **Add secret** and copy it straight away (it starts with `GOCSPX-`). Put it in `.env` as `GOOGLE_OAUTH_CLIENT_SECRET` and restart the tracker.
5. Click **Save**. Changes can take about 5 minutes to apply.
6. Go to **APIs & Services → OAuth consent screen**:
   - If you can choose **Internal**, choose it.
   - Otherwise add the inbox owner's email under **Test users**, then click **Publish app**. In "Testing" mode Google disconnects the agent every 7 days.

## 1.5 Connect the agent to the SIRIM inbox

The agent reads one inbox: the one that receives the SIRIM emails (normally the boss's).

1. The inbox owner signs in to the tracker.
2. Click **⋯ → Automation & Telegram Bot**.
3. In the card **Google account for daily scans**, click **Connect Google** (or **Reconnect / change account**) and choose the inbox's Google account. Allow the Gmail and Google Sheets permissions.
   - If Google shows "Google hasn't verified this app", click **Advanced → Continue**. This is expected for an internal tool.
4. The card now shows **Connected** and the email address it reads.
5. In the same card, enter the SIRIM agent's email or domain under **SIRIM agent / consultant email addresses** (e.g. `lim@consultco.com.my` or `consultco.com.my`). Emails with these people always count as SIRIM emails, and the agent is never treated as a supplier.

The first-time scan starts automatically. A progress bar shows how many email threads have been read. You can close the page; it carries on in the background.

> **Moving from test data to the real inbox:** after connecting the real inbox, click **Start fresh from Gmail** at the bottom of the card. This backs up the current list on the server and rebuilds every application from the connected inbox.

## 1.6 Link the Google Sheet

1. Click the green Google Sheet button in the top bar (**Connect Google Sheet**).
2. Create a new Sheet, or paste the link of an existing one.
3. Share that Sheet with the agent's Google account (the inbox you connected) as **Editor**, otherwise the agent cannot update it.

The agent rewrites the Sheet after every run.

## 1.7 Set up Telegram (optional)

1. In Telegram, create a bot with **@BotFather** and copy its token.
2. Add the bot to the group that should receive the briefing.
3. In the tracker: **⋯ → Automation & Telegram Bot → Telegram Bot Integration** tab. Enter the bot token and the group's chat ID, then click **Send Test Ping**.
4. On the **Daily Schedule & Pipeline** tab, set the briefing time (default 08:30 MYT).

## 1.8 Check everything works

| Check | What you should see |
|---|---|
| Open the tracker | A sign-in screen; after signing in, the dashboard |
| Automation card | **Connected** with the right email; the first scan progress bar finishes |
| Dashboard | Each application once; real SIRIM reference numbers, or "No SIRIM ref yet" |
| Google Sheet | Columns **Cytron To Do** and **Waiting On**; statuses in words |
| Click **Run Automation Now** (Telegram on) | A briefing arrives in Telegram within a minute |
| Next morning | The briefing arrives on its own at the scheduled time |

---

# Part 2 – User manual

## 2.1 Signing in

Open `https://raspberrypi.tail81be18.ts.net` (Tailscale must be on) and click **Sign in with Google** using your Cytron account. The first time, Google asks you to approve permissions. Only Cytron accounts (and anyone listed in `ALLOWED_EMAILS`) can get in.

You stay signed in to the tracker. Gmail features you use yourself (scanning, creating a Gmail draft) may ask you to sign in again after about an hour; that does not affect the agent.

## 2.2 How the agent works

**First run:** the agent finds every SIRIM-related email thread from the past year in the connected inbox and reads them all. It looks for:

- emails from, to or copied to `@sirim.my` or `@mcmc.gov.my`
- emails with the SIRIM agent addresses you entered
- subjects mentioning SIRIM, SQAS, e-ComM, CoC, Type Approval, Certificate of Conformity, Special or Modular Approval

Out-of-office replies and unrelated emails are skipped.

**Every day at the scheduled time (default 08:30 MYT):**

1. It reads every thread that has new emails since the last check.
2. It updates the applications on the dashboard.
3. It rewrites the Google Sheet.
4. It sends the Telegram briefing.

If the Pi was off at that time, it catches up when it comes back on, until 18:00 that day.

**In between:** if **Cadence** is set, it also checks Gmail quietly every so many minutes, without sending Telegram. If a new **critical** task for Cytron appears, it sends one instant alert (if instant alerts are on).

**Sorting emails into applications:** one application often has several threads (SIRIM, the agent, a supplier). The agent combines them into one application using the SIRIM reference number or the model number, and reads all of that application's emails together, so the status always reflects the latest email.

> **Important:** the agent only sees emails in the connected inbox. When you reply to SIRIM or the agent, **CC the inbox owner**, otherwise the agent cannot tell that Cytron has done its part.

## 2.3 The dashboard

**Top bar**

| Button | What it does |
|---|---|
| **Scan Inbox** | Scan your own Gmail by hand (see 2.8). The agent does this automatically for the connected inbox. |
| **Ingest Email** | Paste an email to add or update an application by hand. |
| Green Google Sheet button | Open, link or sync the Google Sheet. |
| Bell | Notifications: items that need attention. |
| Activity icon | Team activity: who changed what and when. |
| Book icon | This manual. |
| **⋯** | Automation & Telegram Bot, AI Pre-Screen Compliance, Export Register to CSV, Clear All Data. |

**Agent banner:** shows whether the agent is active, the schedule, when it last ran and when it runs next. **Sync Now** runs it immediately; **Cadence** sets the extra check interval.

**Summary tiles:** total applications, action required, in review and testing, and certificates granted. Click a tile to filter the list.

**Search and filters:** search by reference, product, model or officer. Filter by status, certification scheme and who it is waiting on. Switch between card and table view, or export the filtered list to CSV.

## 2.4 Reading an application card

Each card shows:

- **Reference number:** the SIRIM reference, or **No SIRIM ref yet** when no email contains one. It fills in automatically once one does.
- **Status:** see the table below.
- **Product, model, brand, scheme and officer / agent.**
- **Open items**, split into two kinds:

| Kind | Meaning | Example |
|---|---|---|
| **Action Required** (amber) | Cytron must do something | "Submit RF test report to SIRIM" |
| **Pending Statement** (purple) | Cytron is waiting on someone else: SIRIM / agent, supplier or lab | "Waiting for SIRIM agent to confirm single-model registration" |

A question we sent (e.g. "Can we apply under one model?") is a **Pending Statement**, not an action, because the ball is in the other party's court.

**Statuses**

| Status | Meaning |
|---|---|
| Submitted | Application lodged |
| Under Review | SIRIM is reviewing; nothing needed from Cytron |
| **Action Pending** | SIRIM / the agent asked Cytron for something (documents, answers, corrections) |
| Sample Requested / Sample Sent | Test samples asked for / delivered |
| Testing in Progress | Lab testing under way |
| Payment Pending | A fee must be paid |
| Final Evaluation | Testing done, awaiting approval |
| Approved | Certificate issued |
| Rejected / Expired | Closed |

The tracker says **Action Pending** rather than "RFI", so it is not confused with the "RFI" wording in SIRIM's own emails.

**Card buttons:** **Thread** opens the Gmail thread, **Draft** opens the AI reply drafter, **Details** opens the full record, and the bin deletes the application.

## 2.5 The application details window

Click **Details** (or the card) to open the full record. It has these tabs:

- **Actions & Statements:** all open and closed items for the application. See 2.6.
- **Scheme Checklist:** the documents usually needed for this certification scheme, and their status.
- **Audit Timeline:** every milestone (submitted, documents requested, sample sent, approved…) with dates.
- **Email Threads:** every email the agent has read for this application, with links to Gmail.
- **AI Reply Drafter:** drafts replies to SIRIM, the agent or a supplier. See 2.7.
- **Dossier & Certificate:** certificate number, expiry, fees and payment status.

## 2.6 Working with action items

- **Tick an Action Required item** when Cytron has done it. You can untick it again if needed.
- **Pending Statements cannot be ticked by hand.** They close automatically when the other party replies. If you received the reply some other way (phone, WhatsApp), click **Record offline receipt**.
- **Items closed by the AI** show **AI Verified from Email** and the reason, e.g. "Supplier provided EMC test report".
- **Wrong label?**
  - On an Action Required item, use **Actually waiting on… → SIRIM / agent, Supplier or Lab** to move it to Pending Statements.
  - On a Pending Statement, click **Mark as Cytron action** to move it back.
- **Ask the AI to re-check:** **AI Auto-Check Progress** reads the latest emails and closes items that have been done.
- **Add an item yourself:** click **Add Item / Statement**, choose **Action Required** or **Pending Statement (Waiting)**, fill in the details and save. You can assign it to a team member by email.

## 2.7 Drafting replies with AI

1. On a card, click **Draft**. Or, on an item, click **Draft Reply for this** (for Cytron actions) or **Draft Chaser / Follow-up** (for things we are waiting on).
2. Choose who it is to (SIRIM officer / agent, or hardware supplier) and the purpose (submit documents, ask for an extension, follow up, request supplier documents…). Add notes if you like.
3. Click **Generate Official Draft**.
4. Read and edit the draft, then click **Copy to Clipboard**, **Create Draft in Gmail** (saves it to your Gmail drafts) or **Send Official Email Now**.

Always check the draft before sending: names, model numbers, dates and attachments.

## 2.8 Adding emails by hand

The agent normally does this for you. Use these only for emails that are not in the connected inbox.

- **Ingest Email:** paste an email (or a whole thread), let the AI read it, check the preview and click **Confirm & Register Application**.
- **Scan Inbox:** scans your own Gmail for SIRIM emails over a period you choose, shows what it found and imports what you confirm.

## 2.9 The Google Sheet

The agent rewrites the Sheet after every run. Applications with something for Cytron to do come first. Columns include:

- Application Ref No, Product Name, Model Number, Brand, Certification Scheme
- **Status** (in words)
- **Cytron To Do** and **Waiting On** (who, and what)
- Priority, Latest Update, Last Activity, Days Since Activity
- Submission Date, Target Deadline
- SIRIM Officer / Agent and email, Gmail Thread link
- Certificate No and Expiry, Fee (RM), Payment Status

> Do not edit the Sheet by hand: the next run overwrites it. Make changes in the tracker instead.

## 2.10 The daily Telegram briefing

Sent every morning at the scheduled time. Sections:

1. **Overview:** how many applications are action pending (Cytron), waiting on SIRIM / agent, waiting on supplier / lab, sample requested, payment pending, approved.
2. **Updates since last briefing:** status changes first (e.g. "Under Review → **Action Pending**"), then new applications, then other new emails. Each has a one-line summary.
3. **Action pending (Cytron):** what Cytron must do, with due dates and an email link.
4. **Waiting on others:** who we are waiting on, longest wait first, so you know whom to chase.
5. **Closed automatically from emails:** items the agent closed since the last briefing.

**If the briefing starts with ⚠️**, the agent could not check Gmail that morning and the figures may be out of date. The message says why. Usually the Google connection needs reconnecting (see 2.12).

**Instant alerts** ("🚨 SIRIM CoC – Action Pending") are sent between briefings only for a **new critical** Cytron task, and only once per task.

## 2.11 Automation settings

**⋯ → Automation & Telegram Bot:**

- **Google account for daily scans:** connection status, first-scan progress, SIRIM agent addresses, **Start fresh from Gmail**.
- **Daily Schedule & Pipeline:** briefing time, extra check interval, which steps run (scan Gmail, update Sheet, send Telegram).
- **Telegram Bot Integration:** bot token, chat ID, daily briefing and instant alerts on/off, **Send Test Ping**.
- **Execution Logs:** what the agent did on each run, including emails it skipped and why.

**Run Automation Now** runs the agent immediately. If it is already running, you are asked to try again in a minute.

**Start fresh from Gmail** clears all applications and rebuilds them from the connected inbox. A backup is kept on the server. Notes and ticks added by hand on the old records are not kept, so use it only when needed (e.g. after switching inbox or a major update).

## 2.12 Troubleshooting

| Problem | What to do |
|---|---|
| Can't open the tracker | Turn on Tailscale on your device. |
| "… is not allowed to use this tracker" | Sign in with your Cytron account, or ask for your address to be added to `ALLOWED_EMAILS`. |
| Briefing starts with ⚠️ "Reconnect Google" | The inbox owner opens Automation and clicks **Reconnect / change account**. If it happens every week, publish the app (see 1.4 step 6). |
| Google says `redirect_uri_mismatch` | The redirect URI in Google Cloud (1.4 step 3) doesn't exactly match; check for typos and wait 5 minutes after saving. |
| "Could not connect the agent to Google: invalid_client" | The client secret is wrong. Create a new one (1.4 step 4) and restart. |
| An item says Cytron must act, but we're waiting | Use **Actually waiting on…** on that item. |
| An application stays "Action Pending" after we replied | The reply probably wasn't sent to the connected inbox. CC the inbox owner next time; for now, tick the item. |
| The same application appears twice | Neither email has a SIRIM reference or model number to match on. Delete one; it won't come back. |
| A SIRIM email was missed | Add the sender's address under **SIRIM agent / consultant email addresses**, then **Run Automation Now**. |
| Sheet not updating | Share the Sheet with the agent's Google account as Editor. |
| No Telegram briefing | Check the bot token and chat ID with the test button, and that the bot is in the group. |

## 2.13 Data and privacy

- Only SIRIM-related email threads are stored, on the Raspberry Pi. Their full text is visible to signed-in team members in the tracker.
- Before every deletion, **Clear All Data** or **Start fresh from Gmail**, the tracker saves a backup in `data/backups/` on the Pi (the last 30 are kept).
- Deleted applications stay deleted: an old browser tab or the agent will not bring them back.
- The agent's Google connection is stored only on the Pi and never shown in the browser. It can be removed at any time with **Disconnect** in the Automation card.
