# SIRIM CoC Regulatory Progress Tracker & Team Workspace

A modern, high-precision SaaS platform for tracking SIRIM QAS / e-ComM type approval applications, RF/EMC compliance, action items, SLA countdowns, and automated morning briefing notifications via Telegram.

---

## 🐙 Pushing to GitHub (Setup & Troubleshooting)

The repository is already initialized with Git and pre-committed (`main` branch) with strict `.gitignore` rules that protect secrets and runtime data.

### Quick Push via Helper Script

```bash
# Push with your GitHub repository URL:
./push-to-github.sh https://github.com/<YOUR_USERNAME>/<YOUR_REPO_NAME>.git
```

---

### Manual Push Step-by-Step

#### 1. Set Remote Origin
```bash
git remote add origin https://github.com/<YOUR_USERNAME>/<YOUR_REPO_NAME>.git
# (Or if already added: git remote set-url origin https://github.com/<YOUR_USERNAME>/<YOUR_REPO_NAME>.git)
```

#### 2. Push to GitHub
```bash
git branch -M main
git push -u origin main
```

---

### Common GitHub Push Errors & Solutions

#### Issue 1: `Support for password authentication was removed` / `Authentication failed`
GitHub requires a **Personal Access Token (PAT)** or SSH key instead of your account password:
1. On GitHub, go to **Settings** → **Developer Settings** → **Personal Access Tokens** → **Tokens (classic)**.
2. Click **Generate new token (classic)** and select the **`repo`** scope.
3. Copy your token (e.g., `ghp_xxxxxxxxxxxx`).
4. Push using your token in the URL:
   ```bash
   git remote set-url origin https://<YOUR_PAT_TOKEN>@github.com/<YOUR_USERNAME>/<YOUR_REPO_NAME>.git
   git push -u origin main
   ```
*(Alternatively, use SSH: `git remote set-url origin git@github.com:<YOUR_USERNAME>/<YOUR_REPO_NAME>.git`)*

#### Issue 2: `Updates were rejected because the remote contains work that you do not have locally`
This happens if you initialized the GitHub repository with a README or License on github.com:
```bash
# Rebase with remote and push:
git pull origin main --rebase --allow-unrelated-histories
git push -u origin main

# OR force push if you want this local repository to be the definitive root:
git push -u origin main --force
```

#### Issue 3: `GH007: Your push would contain a secret` (Push Protection)
This repository's `.gitignore` is pre-configured to exclude `.env*` and `data/*.json` (where local OAuth access tokens and live database files reside). Clean templates (`.env.example`, `data/applications-store.example.json`, `data/automation-config.example.json`) are safely tracked instead.

---

## 🍓 Running on Raspberry Pi (24/7 Home/Office Server)

Running this on a Raspberry Pi gives your team an always-on, centralized server with shared database storage, scheduled morning Telegram digests (08:30 MYT), and local LAN access for all team members.

### 1. Prerequisites on Raspberry Pi
- **Raspberry Pi OS** (32-bit or 64-bit Bullseye / Bookworm or Ubuntu)
- **Node.js 18.x, 20.x, or 22.x LTS**
- **Git**

To verify or install Node.js on Raspberry Pi:
```bash
# Update system
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git

# Install Node.js 20 LTS via NodeSource
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify versions
node -v   # Should be v18+ or v20+
npm -v
```

---

### 2. Clone Repository & Install Dependencies

```bash
# Clone your GitHub repository
git clone <YOUR_GITHUB_REPO_URL> sirim-coc-tracker
cd sirim-coc-tracker

# Install production and build dependencies
npm install
```

---

### 3. Configure Environment Variables (`.env`)

Copy the `.env.example` file to `.env`:
```bash
cp .env.example .env
nano .env
```

Set your values:
```env
# Required for Gemini AI email parsing & SLA estimation
GEMINI_API_KEY="AIzaSy..."

# Port (defaults to 3000)
PORT=3000

# Optional: Telegram automated morning briefing
TELEGRAM_BOT_TOKEN="1234567890:ABCdef..."
TELEGRAM_CHAT_ID="-1001234567890"
TELEGRAM_TOPIC_ID=""

# Who may sign in (everyone else gets "not allowed"). Default: cytron.io
ALLOWED_EMAIL_DOMAINS="cytron.io"
# Optional extra individual accounts, comma-separated
ALLOWED_EMAILS=""
```
Every `/api` request now needs a signed-in Google account from an allowed domain, so the tracker is safe to expose beyond the office LAN.
*(Press `Ctrl + O` then `Enter` to save, and `Ctrl + X` to exit nano)*.

---

### 4. Build the Application

Build both the client SPA and bundled backend server:
```bash
npm run build
```
This generates the optimized frontend in `dist/` and the Node server in `dist/server.cjs`.

---

### 5. Running with PM2 (Recommended for 24/7 Autostart)

[PM2](https://pm2.keymetrics.io/) ensures the application restarts automatically if the Pi reboots or if a crash occurs:

```bash
# Install PM2 globally
sudo npm install -g pm2

# Start the application using the preconfigured ecosystem file
pm2 start ecosystem.config.cjs

# Check status
pm2 status

# Save the running process list
pm2 save

# Set PM2 to launch on Raspberry Pi boot
pm2 startup
# (Run the exact command that PM2 outputs to your terminal)
```

#### Handy PM2 Commands:
```bash
pm2 logs sirim-coc-tracker       # View real-time server & autonomous scheduler logs
pm2 restart sirim-coc-tracker    # Restart app after git pull
pm2 stop sirim-coc-tracker       # Stop app
```

---

### 6. Alternative: Running via `systemd`

If you prefer native Linux system services instead of PM2:

1. Create a service file:
```bash
sudo nano /etc/systemd/system/sirim-tracker.service
```

2. Paste the following configuration (replace `pi` with your RPi username if different):
```ini
[Unit]
Description=SIRIM CoC Tracker Server
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/sirim-coc-tracker
ExecStart=/usr/bin/npm start
Restart=on-failure
RestartSec=10
Environment=NODE_ENV=production
Environment=PORT=3000

[Install]
WantedBy=multi-user.target
```

3. Enable and start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable sirim-tracker
sudo systemctl start sirim-tracker

# Check status:
sudo systemctl status sirim-tracker
```

---

### 7. Accessing from Devices on your Local Network (Office LAN)

Find your Raspberry Pi's IP address:
```bash
hostname -I
```
*(Example: `192.168.1.150`)*

Any team member on the same Wi-Fi / network can open their browser and visit:
```text
http://192.168.1.150:3000
# or (if your router supports mDNS):
http://raspberrypi.local:3000
```

---

### 8. Pulling Updates from GitHub in the Future

Whenever you push new updates to GitHub:
```bash
cd ~/sirim-coc-tracker
git pull origin main
npm install
npm run build
pm2 restart sirim-coc-tracker
```

---

### 9. Data Storage & Backups
All records, active applications, team activity logs, and automation configs are stored in the local directory:
```text
./data/
  ├── applications-store.json   # All SIRIM applications and history
  ├── automation-config.json    # Morning digest schedule & Telegram settings
  ├── team-activity.json        # Live team audit trail
  ├── user-presence.json        # Active online team members
  ├── deleted-applications.json # Deleted apps, so open tabs / the scanner can't bring them back
  └── backups/                  # Automatic copy of applications-store.json before every delete or "clear all" (last 30 kept)
```
To restore after an accidental delete, stop the server, copy the wanted file from `data/backups/` over `data/applications-store.json`, remove the matching entries from `data/deleted-applications.json`, and start the server again.
To back up your data:
```bash
tar -czvf sirim-data-backup-$(date +%F).tar.gz data/
```
