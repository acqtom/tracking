const crypto = require('crypto');

// CSRF protection for the OAuth redirect round-trip. A random, unguessable,
// server-side-tracked token is sufficient here (no need for HMAC signing on
// top of it) since the token is never trusted on its own — it must also exist
// in this in-memory Map and match the platform it was issued for.
const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const states = new Map();

// clientId is stored alongside the platform so the callback can associate the
// incoming token with the correct client's token store entry.
function createState(platform, clientId){
  const token = crypto.randomUUID();
  states.set(token, { platform, clientId: clientId || null, createdAt: Date.now() });
  return token;
}

// Returns { clientId } on success, or false if invalid/expired/mismatched.
function consumeState(token, platform){
  const entry = states.get(token);
  states.delete(token);
  if(!entry) return false;
  if(entry.platform !== platform) return false;
  if(Date.now() - entry.createdAt > STATE_TTL_MS) return false;
  return { clientId: entry.clientId };
}

module.exports = { createState, consumeState };
