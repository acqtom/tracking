const CLIENT_ID = process.env.CALENDLY_CLIENT_ID;
const CLIENT_SECRET = process.env.CALENDLY_CLIENT_SECRET;

function redirectUri(){
  return `${process.env.BASE_URL}/api/auth/calendly/callback`;
}

function getAuthorizeUrl(state){
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: redirectUri(),
    state,
  });
  return `https://auth.calendly.com/oauth/authorize?${params.toString()}`;
}

function normalizeToken(data){
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + (data.expires_in ? data.expires_in * 1000 : 2 * 60 * 60 * 1000),
  };
}

async function exchangeCodeForToken(code){
  const res = await fetch('https://auth.calendly.com/oauth/token', {
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
  if(!res.ok) throw new Error(`Calendly token exchange failed: ${res.status} ${await res.text()}`);
  return normalizeToken(await res.json());
}

// Calendly refresh tokens are single-use and rotate: every refresh call invalidates
// the old refresh_token and returns a brand new one. The caller must persist the
// new refresh_token immediately (ensureFreshToken does this) or lose the ability
// to refresh again.
async function refreshAccessToken(refresh_token){
  const res = await fetch('https://auth.calendly.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    }),
  });
  if(!res.ok) throw new Error(`Calendly token refresh failed: ${res.status} ${await res.text()}`);
  return normalizeToken(await res.json());
}

async function getIdentity(access_token){
  const res = await fetch('https://api.calendly.com/users/me', {
    headers: { Authorization: `Bearer ${access_token}` },
  });
  if(!res.ok) throw new Error(`Calendly identity failed: ${res.status}`);
  const data = await res.json();
  return { email: data.resource.email, name: data.resource.name, userUri: data.resource.uri };
}

async function listEventTypes(access_token, userUri){
  const params = new URLSearchParams({ user: userUri, active: 'true' });
  const res = await fetch(`https://api.calendly.com/event_types?${params.toString()}`, {
    headers: { Authorization: `Bearer ${access_token}` },
  });
  if(!res.ok) throw new Error(`Calendly event types failed: ${res.status}`);
  const data = await res.json();
  return (data.collection || []).map(et => ({ uri: et.uri, name: et.name }));
}

// Returns { 'YYYY-MM-DD': { booked, shown } } for scheduled events of the given
// event type, within [sinceISO, untilISO].
async function fetchDailyCallCounts(access_token, userUri, eventTypeUri, sinceISO, untilISO){
  const dayBuckets = {};
  const minStart = new Date(sinceISO + 'T00:00:00Z').toISOString();
  const maxStart = new Date(untilISO + 'T23:59:59Z').toISOString();
  let pageToken = null;
  let guard = 0;
  do{
    const params = new URLSearchParams({
      user: userUri,
      min_start_time: minStart,
      max_start_time: maxStart,
      status: 'active',
      count: '100',
    });
    if(pageToken) params.set('page_token', pageToken);
    const res = await fetch(`https://api.calendly.com/scheduled_events?${params.toString()}`, {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    if(!res.ok) throw new Error(`Calendly scheduled_events failed: ${res.status}`);
    const data = await res.json();
    const events = (data.collection || []).filter(ev => !eventTypeUri || ev.event_type === eventTypeUri);
    for(const ev of events){
      const day = ev.start_time.slice(0, 10);
      if(!dayBuckets[day]) dayBuckets[day] = { booked: 0, shown: 0 };
      dayBuckets[day].booked += 1;
      const invRes = await fetch(`${ev.uri}/invitees`, {
        headers: { Authorization: `Bearer ${access_token}` },
      });
      if(invRes.ok){
        const invData = await invRes.json();
        const shownCount = (invData.collection || []).filter(inv => !inv.no_show).length;
        dayBuckets[day].shown += shownCount;
      }
    }
    pageToken = data.pagination && data.pagination.next_page_token ? data.pagination.next_page_token : null;
    guard += 1;
  }while(pageToken && guard < 50);
  return dayBuckets;
}

module.exports = { getAuthorizeUrl, exchangeCodeForToken, refreshAccessToken, getIdentity, listEventTypes, fetchDailyCallCounts };
