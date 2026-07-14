const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const TOKENS_FILE = path.join(DATA_DIR, 'tokens.json');

// Tokens are stored in plain JSON, not encrypted at rest. This app runs single-user
// on localhost; anyone with filesystem access to this machine already has the
// browser session and OS keychain, so encryption here would just relocate the
// secret-storage problem without a real security gain. Revisit this decision if
// this app is ever deployed to a shared host or given to other people.

// Storage layout:
//   { [clientId]: { [platform]: { access_token, refresh_token, expires_at, account } } }
// Each client has its own set of OAuth connections — different clients can be
// connected to different Meta ad accounts, Typeform workspaces, and Calendly users.

function ensureDataDir(){
  if(!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
}

function readAll(){
  ensureDataDir();
  if(!fs.existsSync(TOKENS_FILE)) return {};
  try{
    return JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8'));
  }catch(e){
    return {};
  }
}

function writeAll(data){
  ensureDataDir();
  fs.writeFileSync(TOKENS_FILE, JSON.stringify(data, null, 2), { mode: 0o600 });
}

function getToken(platform, clientId){
  if(!clientId) return null;
  const all = readAll();
  return (all[clientId] && all[clientId][platform]) || null;
}

function setToken(platform, clientId, tokenData){
  if(!clientId) return;
  const all = readAll();
  if(!all[clientId]) all[clientId] = {};
  all[clientId][platform] = tokenData;
  writeAll(all);
}

function deleteToken(platform, clientId){
  if(!clientId) return;
  const all = readAll();
  if(all[clientId]){
    delete all[clientId][platform];
    if(Object.keys(all[clientId]).length === 0) delete all[clientId];
  }
  writeAll(all);
}

// Returns all tokens for a client (used to build status responses).
function getClientTokens(clientId){
  if(!clientId) return {};
  return readAll()[clientId] || {};
}

module.exports = { getToken, setToken, deleteToken, getClientTokens };
