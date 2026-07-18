const express = require('express');
const router = express.Router();
const typeform = require('../lib/providers/typeform');
const calendly = require('../lib/providers/calendly');
const meta = require('../lib/providers/meta');
const whop = require('../lib/providers/whop');
const { getToken } = require('../lib/tokenStore');
const { ensureFreshToken } = require('../lib/ensureFreshToken');

function dateRangeDays(sinceISO, untilISO){
  const days = [];
  let d = new Date(sinceISO + 'T00:00:00Z');
  const end = new Date(untilISO + 'T00:00:00Z');
  while(d <= end){
    days.push(d.toISOString().slice(0, 10));
    d = new Date(d.getTime() + 24 * 60 * 60 * 1000);
  }
  return days;
}

function handleError(res, err){
  console.error(err);
  const status = err.code === 'NOT_CONNECTED' ? 400 : err.code === 'RECONNECT_REQUIRED' ? 401 : 500;
  res.status(status).json({ error: err.message, code: err.code || 'ERROR' });
}

// All sync endpoints require ?clientId=<id> so they look up the correct
// per-client OAuth token rather than a shared global one.

router.get('/sync/typeform', async (req, res) => {
  const { formId, since, until, clientId } = req.query;
  if(!formId || !since || !until) return res.status(400).json({ error: 'formId, since, until are required' });
  if(!clientId) return res.status(400).json({ error: 'Missing clientId' });
  try{
    const accessToken = await ensureFreshToken('typeform', typeform, clientId);
    const buckets = await typeform.fetchDailyResponseCounts(accessToken, formId, since, until);
    const days = dateRangeDays(since, until);
    const apps_submitted = days.map(d => buckets[d] ? buckets[d].completed : null);
    const app_complete = days.map(d => {
      const b = buckets[d];
      if(!b || !b.started) return null;
      return Math.round((b.completed / b.started) * 10000) / 100;
    });
    res.json({ metrics: { apps_submitted, app_complete } });
  }catch(err){ handleError(res, err); }
});

router.get('/sync/calendly', async (req, res) => {
  const { eventTypeUri, since, until, clientId } = req.query;
  if(!since || !until) return res.status(400).json({ error: 'since, until are required' });
  if(!clientId) return res.status(400).json({ error: 'Missing clientId' });
  try{
    const accessToken = await ensureFreshToken('calendly', calendly, clientId);
    const token = getToken('calendly', clientId);
    const userUri = token && token.account && token.account.userUri;
    const buckets = await calendly.fetchDailyCallCounts(accessToken, userUri, eventTypeUri, since, until);
    const days = dateRangeDays(since, until);
    const calls_cal = days.map(d => buckets[d] ? buckets[d].booked : null);
    const calls_show = days.map(d => buckets[d] ? buckets[d].shown : null);
    const show_rate = days.map((d, i) => {
      const booked = calls_cal[i];
      const shown = calls_show[i];
      if(!booked) return null;
      return Math.round((shown / booked) * 10000) / 100;
    });
    res.json({ metrics: { calls_cal, calls_show, show_rate } });
  }catch(err){ handleError(res, err); }
});

router.get('/sync/meta', async (req, res) => {
  const { adAccountId, since, until, clientId } = req.query;
  if(!adAccountId || !since || !until) return res.status(400).json({ error: 'adAccountId, since, until are required' });
  if(!clientId) return res.status(400).json({ error: 'Missing clientId' });
  try{
    const accessToken = await ensureFreshToken('meta', meta, clientId);
    const buckets = await meta.fetchDailyInsights(accessToken, adAccountId, since, until);
    const days = dateRangeDays(since, until);
    const ad_spend = days.map(d => buckets[d] ? buckets[d].spend : null);
    const cpc = days.map(d => buckets[d] ? buckets[d].cpc : null);
    const ctr = days.map(d => buckets[d] ? buckets[d].ctr : null);
    const hook = days.map(d => {
      const b = buckets[d];
      if(!b || !b.impressions) return null;
      return Math.round((b.videoPlays / b.impressions) * 10000) / 100;
    });
    res.json({ metrics: { ad_spend, cpc, ctr, hook }, beta: ['hook'] });
  }catch(err){ handleError(res, err); }
});

// Whop sync: fetches paid payments for the given product and week, fills cash metric.
router.get('/sync/whop', async (req, res) => {
  const { productId, since, until, clientId } = req.query;
  if(!since || !until) return res.status(400).json({ error: 'since, until are required' });
  if(!clientId) return res.status(400).json({ error: 'Missing clientId' });
  try{
    const accessToken = await ensureFreshToken('whop', whop, clientId);
    const buckets = await whop.fetchDailyPayments(accessToken, productId || null, since, until);
    const days = dateRangeDays(since, until);
    const cash = days.map(d => buckets[d] != null ? buckets[d] : null);
    res.json({ metrics: { cash } });
  }catch(err){ handleError(res, err); }
});

module.exports = router;
