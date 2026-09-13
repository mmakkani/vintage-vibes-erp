# Vintage Vibes ERP - WhatsApp Persistent Worker Bridge

## Why this Worker Bridge is Needed
Vercel serverless functions terminate immediately after an HTTP response is delivered. This serverless lifecycle breaks persistent WebSocket connections required by WhatsApp (Baileys), resulting in:
- Camera scanner exiting or saying **"Invalid QR Code"**
- WebSocket handshakes terminating after a few seconds

---

## Solutions Supported by Vintage Vibes ERP

### Option 1 (Recommended on Vercel): Official Meta Cloud API
- **Zero infrastructure needed**: Works 100% reliably on Vercel serverless.
- Go to **Tab 1: Meta Cloud API** in the WhatsApp Device Modal, enter your Meta Developer **Phone Number ID** and **Access Token**.

---

### Option 2: Deploy this Standalone Worker Bridge (Railway / Render / Fly.io)
This lightweight Node.js worker maintains the 24/7 persistent WebSocket connection to WhatsApp. Your Vercel frontend connects to it over standard HTTPS.

#### Quick Deployment to Railway (2 Minutes):
1. Create a new GitHub repo or push this `worker/` directory to Railway.
2. In Railway, click **New Project** > **Deploy from GitHub Repo**.
3. Set the Root Directory to `/worker` (or leave as root with start command `node worker/whatsapp-bridge.js`).
4. Generate a public domain (e.g. `https://vintage-whatsapp-bridge.up.railway.app`).
5. In your Vercel Project Settings > **Environment Variables**, add:
   ```env
   VITE_WHATSAPP_WORKER_URL=https://vintage-whatsapp-bridge.up.railway.app
   WHATSAPP_WORKER_BRIDGE_URL=https://vintage-whatsapp-bridge.up.railway.app
   ```
6. Open Vintage Vibes ERP > Marketing > Click **Link WhatsApp Phone** > **Tab 2: Worker Bridge**, paste the URL and click **Test Connection**!

#### Local Development:
```bash
# In the worker directory:
cd worker
npm install
npm start
```
By default, the bridge runs on `http://localhost:3001`.
