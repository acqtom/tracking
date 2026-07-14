# Setting up live Typeform / Calendly / Meta Ads connections

The dashboard now has three "Connect" chips near the top. For them to actually
pull real data, you need to create one small developer app on each platform
and paste the resulting keys into a config file. This is a one-time setup —
about 15-20 minutes total.

**Important limitation to know up front:** Meta's ad data connection can only
read ad accounts *you personally administer* (your own agency's ad accounts).
It cannot read a client's ad account unless that client adds you/your app as a
role-holder on their account, or you go through Meta's full App Review process
(which requires Business Verification). This is a Meta platform restriction,
not a bug — see step 3 below for the technical reason.

## 0. One-time setup

1. Install dependencies:
   ```
   cd "server"
   npm install
   ```
2. Copy the config template and open it in a text editor:
   ```
   cp .env.example .env
   ```
3. Leave `PORT=5175` and `BASE_URL=http://localhost:5175` as-is unless that
   port is already in use on your machine.
4. Generate a random string for `SESSION_SECRET` (any long random text works —
   it's only used to protect the OAuth handshake, not a login password).

You'll fill in the rest of `.env` as you complete each platform below.

## 1. Typeform

1. Go to **https://developer.typeform.com/** and log in with your normal
   Typeform account.
2. Find **My Apps → Create App** (or similar — Typeform's UI wording may vary
   slightly).
3. Name it "EDUCATR Growth Engine".
4. **Redirect URI:** `http://localhost:5175/api/auth/typeform/callback`
5. **Scopes:** check `accounts:read`, `forms:read`, `responses:read`, and
   `offline` (the `offline` scope is required — without it the connection
   silently stops working after about a week and can't refresh itself).
6. Save, then copy the **Client ID** and **Client Secret** into `server/.env`:
   ```
   TYPEFORM_CLIENT_ID=...
   TYPEFORM_CLIENT_SECRET=...
   ```

## 2. Calendly

1. Go to **https://developer.calendly.com** and sign up/log in (this can be a
   separate "developer" identity from your day-to-day Calendly login — when
   you later click Connect in the dashboard, log in with whichever Calendly
   account's calendar you actually want tracked).
2. Create a new OAuth application.
   - **Application type:** Web
   - **Environment: Sandbox** — this matters. Sandbox is what allows a
     `localhost` redirect URI at all; Production requires a real `https`
     domain, which this local setup doesn't have.
3. **Redirect URI:** `http://localhost:5175/api/auth/calendly/callback`
4. **Scopes:** check `scheduled_events:read`, `invitees:read`, `users:read`.
5. Save. Calendly will show you the **Client ID**, **Client Secret**, and a
   webhook signing key — the webhook key isn't needed here (no webhooks are
   used), but copy the Client ID/Secret into `server/.env`:
   ```
   CALENDLY_CLIENT_ID=...
   CALENDLY_CLIENT_SECRET=...
   ```

## 3. Meta (Facebook/Instagram Ads)

1. Go to **https://developers.facebook.com/** and log in with the Facebook
   account that is an **admin on your agency's ad account(s)**.
2. **My Apps → Create App.** Use case: "Other" → App type: "Business". Name it
   "EDUCATR Growth Engine". Attach it to your Business Manager if prompted.
3. **Add Product → Marketing API.** This is what grants your app "Limited
   Access" to the `ads_read` permission automatically, without needing Meta's
   full App Review process — but Limited Access only works for ad accounts
   that *your own app's Admins/Developers/Testers* have a role on. This is
   why the dashboard can only pull your own agency's ad accounts for now: to
   read a specific client's ad account instead, that client would need to add
   you (or this app) as a role-holder on their ad account in Business
   Manager, or you'd need to complete Meta's App Review + Business
   Verification for Advanced Access.
4. In **Facebook Login** product settings, add a Valid OAuth Redirect URI:
   `http://localhost:5175/api/auth/meta/callback`. (If your dashboard only
   offers "Facebook Login for Business" and it rejects a plain `http://`
   redirect, look for the classic "Facebook Login" product instead — Meta's
   console UI changes over time, so check what's actually available live.)
5. Under **App Roles → Roles**, confirm your Facebook user is listed as
   Administrator (it will be automatically, since you created the app).
6. **Leave the app in Development Mode** — do not submit for App Review for
   this v1 setup.
7. Copy the **App ID** and **App Secret** from Settings → Basic into
   `server/.env`:
   ```
   META_APP_ID=...
   META_APP_SECRET=...
   META_GRAPH_VERSION=v25.0
   ```

## 4. Run it

```
cd server
npm start
```

Then open **http://localhost:5175** in your browser (not by double-clicking
`index.html` anymore — the OAuth connections only work when served by this
local server). Log in with your dashboard password as usual, then click each
chip to connect.

After connecting a platform, click its chip again and choose **"Choose
[form/event type/ad account] for this client"** to tell the dashboard which
Typeform form, Calendly event type, or Meta ad account feeds the
currently-selected client. Metrics for the visible week will sync
automatically after that, and you can click **Sync now** any time to refresh.

## What auto-fills vs. stays manual

**Auto-filled once connected and mapped:**
- Meta Ads → Ad Spend, Cost Per Click, CTR (note: this is Meta's overall CTR,
  not specifically link-click CTR), and Hook Rate (marked beta — see below)
- Calendly → Total Calls On Calendar, Total Calls Show, Show Up Rate
- Typeform → Applications Submitted, Application Completion Rate (approximate
  — see below)

**Stays manual** (no clean source in these three APIs): Cost Per Lead, ROAS,
Cash Collected, Close Rate, Cash Per Qualified Call, AOV, Sales Units, Depos,
Closing DQ Rate, Dials, Landing Page Connect Rate, Landing Page → Application
Rate, VSL metrics, Email metrics, Quality of Applications, Cost Per Booked
Call, Application → Booking Rate.

**Two numbers to sanity-check before trusting them fully:**
- **Hook Rate (Meta):** computed from Meta's `video_play_actions` field. The
  exact definition of a "3-second play" inside that field wasn't independently
  confirmed — before trusting this number, pull one day's data manually in
  Meta's [Graph API Explorer](https://developers.facebook.com/tools/explorer)
  with `fields=impressions,video_play_actions` and compare against what Ads
  Manager shows for the same day.
- **Application Completion Rate (Typeform):** Typeform's response-listing API
  filters by submission time, so a response that was started but never
  completed within the queried date range may not be counted — treat this
  number as a close approximation, not an exact figure.
