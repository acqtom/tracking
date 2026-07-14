const express = require('express');
const router = express.Router();
const typeform = require('../lib/providers/typeform');
const calendly = require('../lib/providers/calendly');
const meta = require('../lib/providers/meta');
const { getToken } = require('../lib/tokenStore');
const { ensureFreshToken } = require('../lib/ensureFreshToken');

function handleError(res, err){
  console.error(err);
  const status = err.code === 'NOT_CONNECTED' ? 400 : err.code === 'RECONNECT_REQUIRED' ? 401 : 500;
  res.status(status).json({ error: err.message, code: err.code || 'ERROR' });
}

// All resource endpoints require ?clientId=<id> so they look up the correct
// per-client token rather than a shared global one.

router.get('/typeform/forms', async (req, res) => {
  const { clientId } = req.query;
  if(!clientId) return res.status(400).json({ error: 'Missing clientId' });
  try{
    const accessToken = await ensureFreshToken('typeform', typeform, clientId);
    res.json(await typeform.listForms(accessToken));
  }catch(err){ handleError(res, err); }
});

router.get('/calendly/event-types', async (req, res) => {
  const { clientId } = req.query;
  if(!clientId) return res.status(400).json({ error: 'Missing clientId' });
  try{
    const accessToken = await ensureFreshToken('calendly', calendly, clientId);
    const token = getToken('calendly', clientId);
    const userUri = token && token.account && token.account.userUri;
    res.json(await calendly.listEventTypes(accessToken, userUri));
  }catch(err){ handleError(res, err); }
});

router.get('/meta/adaccounts', async (req, res) => {
  const { clientId } = req.query;
  if(!clientId) return res.status(400).json({ error: 'Missing clientId' });
  try{
    const accessToken = await ensureFreshToken('meta', meta, clientId);
    res.json(await meta.listAdAccounts(accessToken));
  }catch(err){ handleError(res, err); }
});

module.exports = router;
