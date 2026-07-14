const APP_ID = process.env.META_APP_ID;
const APP_SECRET = process.env.META_APP_SECRET;
const GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v25.0';
const SCOPE = 'ads_read';

function redirectUri(){
  return `${process.env.BASE_URL}/api/auth/meta/callback`;
}

function getAuthorizeUrl(state){
  const params = new URLSearchParams({
    client_id: APP_ID,
    redirect_uri: redirectUri(),
    scope: SCOPE,
    response_type: 'code',
    state,
  });
  return `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth?${params.toString()}`;
}

// Meta has no refresh_token concept. A long-lived (~60 day) token is obtained once
// at connect time; when it expires the only path is the user re-doing the full
// browser OAuth flow — there is nothing to refresh silently.
async function exchangeForLongLivedToken(shortLivedToken){
  const params = new URLSearchParams({
    grant_type: 'fb_exchange_token',
    client_id: APP_ID,
    client_secret: APP_SECRET,
    fb_exchange_token: shortLivedToken,
  });
  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token?${params.toString()}`);
  if(!res.ok) throw new Error(`Meta long-lived token exchange failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return {
    access_token: data.access_token,
    refresh_token: null,
    expires_at: Date.now() + (data.expires_in ? data.expires_in * 1000 : 60 * 24 * 60 * 60 * 1000),
  };
}

async function exchangeCodeForToken(code){
  const params = new URLSearchParams({
    client_id: APP_ID,
    redirect_uri: redirectUri(),
    client_secret: APP_SECRET,
    code,
  });
  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token?${params.toString()}`);
  if(!res.ok) throw new Error(`Meta token exchange failed: ${res.status} ${await res.text()}`);
  const shortLived = await res.json();
  return exchangeForLongLivedToken(shortLived.access_token);
}

async function getIdentity(access_token){
  const params = new URLSearchParams({ fields: 'id,name', access_token });
  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/me?${params.toString()}`);
  if(!res.ok) throw new Error(`Meta identity failed: ${res.status}`);
  const data = await res.json();
  return { name: data.name, id: data.id };
}

async function listAdAccounts(access_token){
  const params = new URLSearchParams({ fields: 'id,name,account_status,currency', access_token });
  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/me/adaccounts?${params.toString()}`);
  if(!res.ok) throw new Error(`Meta ad accounts failed: ${res.status}`);
  const data = await res.json();
  return (data.data || []).map(a => ({ id: a.id, name: a.name, currency: a.currency }));
}

// Returns { 'YYYY-MM-DD': { spend, cpc, ctr, impressions, videoPlays } } for the
// given ad account within [sinceISO, untilISO].
async function fetchDailyInsights(access_token, adAccountId, sinceISO, untilISO){
  const timeRange = JSON.stringify({ since: sinceISO, until: untilISO });
  const params = new URLSearchParams({
    fields: 'spend,clicks,cpc,ctr,impressions,video_play_actions',
    time_increment: '1',
    time_range: timeRange,
    level: 'account',
    access_token,
  });
  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${adAccountId}/insights?${params.toString()}`);
  if(!res.ok) throw new Error(`Meta insights failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const dayBuckets = {};
  for(const row of (data.data || [])){
    // BETA: the exact `action_type` for "3-second video plays" (hook rate) should
    // be confirmed live in Graph API Explorer before this number is trusted — see
    // SETUP.md. This sums every action_type in video_play_actions, which may be
    // broader than the specific 3-second-play definition.
    const videoPlays = (row.video_play_actions || []).reduce((sum, a) => sum + Number(a.value || 0), 0);
    dayBuckets[row.date_start] = {
      spend: Number(row.spend || 0),
      cpc: Number(row.cpc || 0),
      ctr: Number(row.ctr || 0),
      impressions: Number(row.impressions || 0),
      videoPlays,
    };
  }
  return dayBuckets;
}

module.exports = { getAuthorizeUrl, exchangeCodeForToken, getIdentity, listAdAccounts, fetchDailyInsights };
