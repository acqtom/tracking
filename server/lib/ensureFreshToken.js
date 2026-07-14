const tokenStore = require('./tokenStore');

const REFRESH_SKEW_MS = 2 * 60 * 1000; // refresh a bit before actual expiry

// Returns a valid access token for `platform` and `clientId`, refreshing it
// first if it's stale and the provider supports refreshing. Throws with a
// `.code` of NOT_CONNECTED or RECONNECT_REQUIRED so route handlers can respond
// with the right HTTP status instead of a generic 500.
async function ensureFreshToken(platform, provider, clientId){
  const token = tokenStore.getToken(platform, clientId);
  if(!token){
    const err = new Error(`${platform} is not connected for this client`);
    err.code = 'NOT_CONNECTED';
    throw err;
  }
  const needsRefresh = token.expires_at && token.expires_at - REFRESH_SKEW_MS < Date.now();
  if(!needsRefresh) return token.access_token;
  if(!token.refresh_token || typeof provider.refreshAccessToken !== 'function'){
    const err = new Error(`${platform} token expired and cannot be refreshed — reconnect required`);
    err.code = 'RECONNECT_REQUIRED';
    throw err;
  }
  const refreshed = await provider.refreshAccessToken(token.refresh_token);
  const updated = { ...token, ...refreshed };
  tokenStore.setToken(platform, clientId, updated);
  return updated.access_token;
}

module.exports = { ensureFreshToken };
