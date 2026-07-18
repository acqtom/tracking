const CLIENT_ID = process.env.WHOP_CLIENT_ID;
const CLIENT_SECRET = process.env.WHOP_CLIENT_SECRET;
const API_BASE = 'https://api.whop.com/v5';

function redirectUri(){
  return `${process.env.BASE_URL}/api/auth/whop/callback`;
}

function getAuthorizeUrl(state){
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: 'read',
    state,
  });
  return `https://whop.com/oauth?${params.toString()}`;
}

async function exchangeCodeForToken(code){
  const res = await fetch(`${API_BASE}/oauth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')}`,
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri(),
    }),
  });
  if(!res.ok) throw new Error(`Whop token exchange failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token || null,
    expires_at: Date.now() + (data.expires_in ? data.expires_in * 1000 : 7200 * 1000),
  };
}

async function refreshAccessToken(refresh_token){
  const res = await fetch(`${API_BASE}/oauth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')}`,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token,
    }),
  });
  if(!res.ok) throw new Error(`Whop token refresh failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token || refresh_token,
    expires_at: Date.now() + (data.expires_in ? data.expires_in * 1000 : 7200 * 1000),
  };
}

async function getIdentity(access_token){
  const res = await fetch(`${API_BASE}/me`, {
    headers: { Authorization: `Bearer ${access_token}` },
  });
  if(!res.ok) throw new Error(`Whop identity failed: ${res.status}`);
  const data = await res.json();
  return { name: data.name || data.username, email: data.email };
}

// Returns the user's Whop products — the resource the user picks to map to a client.
async function listProducts(access_token){
  const res = await fetch(`${API_BASE}/products?per=100`, {
    headers: { Authorization: `Bearer ${access_token}` },
  });
  if(!res.ok) throw new Error(`Whop products list failed: ${res.status}`);
  const data = await res.json();
  return (data.data || []).map(p => ({ id: p.id, name: p.name || p.slug || p.id }));
}

// Returns { 'YYYY-MM-DD': cashCollected } for the given product within [sinceISO, untilISO].
// Whop's final_amount is in the currency's major unit (USD, not cents).
async function fetchDailyPayments(access_token, productId, sinceISO, untilISO){
  const dayBuckets = {};
  let page = 1;
  let guard = 0;
  const since = new Date(sinceISO + 'T00:00:00Z').toISOString();
  const until = new Date(untilISO + 'T23:59:59Z').toISOString();
  do{
    const params = new URLSearchParams({ per: '100', page: String(page), status: 'paid' });
    if(productId) params.set('product_id', productId);
    const res = await fetch(`${API_BASE}/payments?${params.toString()}`, {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    if(!res.ok) throw new Error(`Whop payments fetch failed: ${res.status}`);
    const data = await res.json();
    const items = data.data || [];
    let hasMore = items.length === 100;
    for(const payment of items){
      const createdAt = payment.created_at; // ISO string
      if(!createdAt || createdAt < since || createdAt > until){ hasMore = false; continue; }
      const day = createdAt.slice(0, 10);
      dayBuckets[day] = (dayBuckets[day] || 0) + Number(payment.final_amount || 0);
    }
    if(!hasMore) break;
    page += 1;
    guard += 1;
  }while(guard < 50);
  return dayBuckets;
}

module.exports = { getAuthorizeUrl, exchangeCodeForToken, refreshAccessToken, getIdentity, listProducts, fetchDailyPayments };
