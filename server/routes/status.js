const express = require('express');
const router = express.Router();
const { getClientTokens } = require('../lib/tokenStore');

const PLATFORMS = ['typeform', 'calendly', 'meta'];

// GET /api/status?clientId=<id>
// Returns connection status for all three platforms for the given client.
// Each connected platform reports whether the token is expired (and cannot be
// silently refreshed), plus the account identity attached at connect time.
router.get('/status', (req, res) => {
  const clientId = req.query.clientId;
  if(!clientId) return res.status(400).json({ error: 'Missing clientId' });

  const tokens = getClientTokens(clientId);
  const result = {};
  for(const platform of PLATFORMS){
    const token = tokens[platform];
    if(!token){
      result[platform] = { connected: false };
      continue;
    }
    // Only report "expired" when there's no way to silently refresh (Meta, or a
    // Typeform/Calendly token that somehow lost its refresh_token) — otherwise
    // ensureFreshToken will refresh it transparently on next use.
    const expired = !!(token.expires_at && token.expires_at < Date.now() && !token.refresh_token);
    result[platform] = { connected: true, expired, account: token.account || null };
  }
  res.json(result);
});

module.exports = router;
