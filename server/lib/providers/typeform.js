const CLIENT_ID = process.env.TYPEFORM_CLIENT_ID;
const CLIENT_SECRET = process.env.TYPEFORM_CLIENT_SECRET;
const SCOPES = 'accounts:read forms:read responses:read offline';

function redirectUri(){
  return `${process.env.BASE_URL}/api/auth/typeform/callback`;
}

function getAuthorizeUrl(state){
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: redirectUri(),
    scope: SCOPES,
    state,
  });
  return `https://api.typeform.com/oauth/authorize?${params.toString()}`;
}

function normalizeToken(data, fallbackRefresh){
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token || fallbackRefresh || null,
    expires_at: Date.now() + (data.expires_in ? data.expires_in * 1000 : 7 * 24 * 60 * 60 * 1000),
  };
}

async function exchangeCodeForToken(code){
  const res = await fetch('https://api.typeform.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: redirectUri(),
    }),
  });
  if(!res.ok) throw new Error(`Typeform token exchange failed: ${res.status} ${await res.text()}`);
  return normalizeToken(await res.json());
}

async function refreshAccessToken(refresh_token){
  const res = await fetch('https://api.typeform.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    }),
  });
  if(!res.ok) throw new Error(`Typeform token refresh failed: ${res.status} ${await res.text()}`);
  return normalizeToken(await res.json(), refresh_token);
}

async function getIdentity(access_token){
  const res = await fetch('https://api.typeform.com/me', {
    headers: { Authorization: `Bearer ${access_token}` },
  });
  if(!res.ok) throw new Error(`Typeform identity failed: ${res.status}`);
  const data = await res.json();
  return { email: data.email, name: data.alias || data.email };
}

async function listForms(access_token){
  const res = await fetch('https://api.typeform.com/forms', {
    headers: { Authorization: `Bearer ${access_token}` },
  });
  if(!res.ok) throw new Error(`Typeform forms list failed: ${res.status}`);
  const data = await res.json();
  return (data.items || []).map(f => ({ id: f.id, title: f.title }));
}

// Returns { 'YYYY-MM-DD': { completed, started } } for the form, bucketed by day.
// Note: Typeform's since/until filter is based on submission time, so a response
// that was started but never completed within the queried window may not be
// counted toward `started` — treat app_complete as an approximation, not exact.
async function fetchDailyResponseCounts(access_token, formId, sinceISO, untilISO){
  const dayBuckets = {};
  const since = new Date(sinceISO + 'T00:00:00Z').toISOString();
  const until = new Date(untilISO + 'T23:59:59Z').toISOString();
  let before = null;
  let guard = 0;
  do{
    const params = new URLSearchParams({ page_size: '1000', since, until });
    if(before) params.set('before', before);
    const res = await fetch(`https://api.typeform.com/forms/${formId}/responses?${params.toString()}`, {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    if(!res.ok) throw new Error(`Typeform responses fetch failed: ${res.status}`);
    const data = await res.json();
    const items = data.items || [];
    for(const item of items){
      if(item.landed_at){
        const day = item.landed_at.slice(0, 10);
        if(!dayBuckets[day]) dayBuckets[day] = { completed: 0, started: 0 };
        dayBuckets[day].started += 1;
      }
      if(item.submitted_at){
        const day = item.submitted_at.slice(0, 10);
        if(!dayBuckets[day]) dayBuckets[day] = { completed: 0, started: 0 };
        dayBuckets[day].completed += 1;
      }
    }
    before = items.length === 1000 ? items[items.length - 1].token : null;
    guard += 1;
  }while(before && guard < 50); // hard cap so a runaway account can't loop forever
  return dayBuckets;
}

module.exports = { getAuthorizeUrl, exchangeCodeForToken, refreshAccessToken, getIdentity, listForms, fetchDailyResponseCounts };
