# Mission Failed ($FAILED) — launch checklist

Follow in order. After each step marked **→ tell Claude**, send a message and Claude does the next bit.
Never paste a private key into the chat. It only ever goes into Railway.

---

## 1. Create the GitHub repo (1 minute)
1. Open https://github.com/new
2. **Repository name:** `mission-failed`
3. Choose **Public**
4. Leave everything else unticked (no README, no .gitignore, no licence)
5. Press **Create repository**
6. **→ tell Claude "repo done"**. Claude pushes all the code into it.

## 2. Make a NEW treasury wallet (must be separate from Vice Radio)
pump.fun puts all of one creator's fees into one pot, so $FAILED needs its own creator wallet.
1. Open **Phantom** → tap your account name at the top → **Add / Connect Wallet** → **Create new account**
2. Name it **Mission Failed**
3. Copy its address and send it to Claude (the address is fine to share)
4. Send it about **0.1 SOL** (covers the coin launch, your dev buy and payout fees). Add more if you want a bigger dev buy.
5. Get its private key (you'll paste it into Railway in step 4, never into chat):
   Phantom → **Settings** → **Manage Accounts** → **Mission Failed** → **Show Private Key** → enter password → copy

## 3. Supabase: add the Mission Failed tables (same project as Vice Radio)
1. Open https://supabase.com/dashboard → click your Vice Radio project
2. Left menu → **SQL Editor** → **New query**
3. Paste the SQL Claude sends in chat → press **Run**
4. You should see **Success. No rows returned**
5. **→ tell Claude "sql done"**

## 4. Railway: the server
1. Open https://railway.com/dashboard → open your Vice Radio project
2. Press **+ Create** (top right) → **GitHub Repo** → pick **mission-failed**
3. Click the new **mission-failed** box → **Variables** tab → **+ New Variable** for each:

| Name | Value |
|---|---|
| `RPC_URL` | copy it from the Vice Radio service's Variables (same Helius link) |
| `SUPABASE_URL` | copy from Vice Radio's Variables |
| `SUPABASE_SERVICE_KEY` | copy from Vice Radio's Variables |
| `TREASURY_PRIVATE_KEY` | the NEW Mission Failed wallet's private key (step 2.5) |
| `ADMIN_KEY` | the admin key Claude gave you in chat |
| `SITE_ORIGIN` | `*` |

4. Press **Deploy** (or **Apply changes**)
5. **Settings** tab → **Networking** → **Generate Domain** → copy the link it makes
6. **→ send Claude the Railway link**

## 5. Netlify: the website
1. Open https://app.netlify.com → **Add new project** → **Import an existing project** → **GitHub**
2. Pick **mission-failed**
3. Leave the settings as they are (the repo already tells Netlify to publish the `public` folder) → **Deploy**
4. If it says the site is private: **Project configuration** → **General** → **Visibility** → set to **Public**
5. **→ send Claude the netlify.app link**

## 6. Domain: missionfailed.app (or missionfailed.co, $5.98)
1. Buy it at https://www.namecheap.com/domains/registration/results/?domain=missionfailed.app (about $7.48; missionfailed.co is $5.98 if you'd rather)
2. Netlify → your mission-failed project → **Domain management** → **Add a domain** → type `missionfailed.app` → **Verify** → **Add domain**
3. Namecheap → **Domain List** → **Manage** next to missionfailed.app → **Advanced DNS** → delete any existing records → **Add New Record**:
   - **A Record** · Host `@` · Value `75.2.60.5`
   - **CNAME Record** · Host `www` · Value `your-site-name.netlify.app` (your Netlify link without https://)
4. Back in Netlify → **Domain management** → **HTTPS** → **Verify DNS configuration** → **Provision certificate** (can take 5–30 min)
5. **→ tell Claude "domain done"**

## 7. X account
1. Create **@missionfailedvi** · display name **Mission Failed**
2. Profile picture: `x-profile-picture.png` · header: `x-banner.png` (Claude sent both)
3. Bio:
   > Pick your driver. Outrun the cops in Leonida. Get paid every 10 min — more stars, bigger cut. Hold $FAILED.
4. Website: `missionfailed.app`

## 8. Test everything BEFORE the coin exists
1. Play on the live site, paste a wallet you own into the wallet box, clear at least ★
2. Tell Claude a coin that wallet holds at least 500K of (your $RADIO, or anything)
3. Claude sends you a test link. Open it: it shows your run, your points and that your wallet qualifies
4. Claude sends a second link that actually pays a tiny test prize (0.002 SOL) from the Mission Failed wallet to yours
5. Check Phantom: the SOL arrived → the whole payout system works. Screenshot both to Claude

## 9. Launch the coin (from the NEW wallet)
1. In Phantom switch to the **Mission Failed** account
2. https://pump.fun → **Create coin**
   - Name: **Mission Failed** · Ticker: **FAILED**
   - Image: `x-profile-picture.png`
   - Description: Escape the cops in Leonida. 6 stars, each harder. Every 10 min, 80% of creator fees go to the best getaway drivers holding $FAILED.
   - Website: `https://missionfailed.app` · X: `https://x.com/missionfailedvi`
3. Dev buy as you like → **Create**
4. Lock your dev tokens like you did for $RADIO
5. **→ send Claude the CA**. Claude puts it on the site and switches payouts live in the same push. Nothing else for you to do.

## Before you post
- [ ] missionfailed.app opens, the loading screen shows, the CA is on the page
- [ ] A run finishes and appears on the leaderboard
- [ ] Share on X opens X with the post text and screenshot
- [ ] Test payout landed in your wallet (step 8)
- [ ] Claude has confirmed payouts are live
