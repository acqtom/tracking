const express = require('express');
const router = express.Router();
const tokenStore = require('../lib/tokenStore');
const state = require('../lib/state');
const typeform = require('../lib/providers/typeform');
const calendly = require('../lib/providers/calendly');
const meta = require('../lib/providers/meta');

const PROVIDERS = { typeform, calendly, meta };

// The frontend passes ?clientId=<id> so the OAuth round-trip knows which client
// to attach the resulting token to. clientId is stored inside the CSRF state
// token (server-side only) and recovered on callback — it is never sent to the
// OAuth provider or returned as a URL parameter until the final redirect back
// to the dashboard.
router.get('/auth/:platform/start', (req, res) => {
  const provider = PROVIDERS[req.params.platform];
  if(!provider) return res.status(404).send('Unknown platform');
  const clientId = req.query.clientId || null;
  if(!clientId) return res.status(400).send('Missing clientId — cannot determine which client this connection belongs to.');
  const stateToken = state.createState(req.params.platform, clientId);
  res.redirect(provider.getAuthorizeUrl(stateToken));
});

router.get('/auth/:platform/callback', async (req, res) => {
  const { platform } = req.params;
  const provider = PROVIDERS[platform];
  if(!provider) return res.status(404).send('Unknown platform');
  const { code, state: stateParam, error } = req.query;
  if(error) return res.redirect(`/?connect_error=${encodeURIComponent(platform)}`);
  const stateResult = code && stateParam && state.consumeState(stateParam, platform);
  if(!stateResult){
    return res.status(400).send('Invalid or expired OAuth state. Please try connecting again from the dashboard.');
  }
  const { clientId } = stateResult;
  if(!clientId){
    return res.status(400).send('OAuth state is missing clientId. Please try connecting again from the dashboard.');
  }
  try{
    const tokenData = await provider.exchangeCodeForToken(code);
    const identity = await provider.getIdentity(tokenData.access_token);
    tokenStore.setToken(platform, clientId, { ...tokenData, account: identity });
    // Return clientId in the redirect so the frontend knows whose status to refresh.
    res.redirect(`/?connected=${platform}&clientId=${encodeURIComponent(clientId)}`);
  }catch(err){
    console.error(`[${platform}] OAuth callback failed:`, err);
    res.redirect(`/?connect_error=${encodeURIComponent(platform)}`);
  }
});

router.post('/auth/:platform/disconnect', (req, res) => {
  if(!PROVIDERS[req.params.platform]) return res.status(404).json({ error: 'Unknown platform' });
  const clientId = req.body && req.body.clientId;
  if(!clientId) return res.status(400).json({ error: 'Missing clientId' });
  tokenStore.deleteToken(req.params.platform, clientId);
  res.json({ ok: true });
});

module.exports = router;
