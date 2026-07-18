/* Talks to the local Express backend (server/) for real OAuth connections to
   Typeform, Calendly, and Meta Ads. Shares the global scope with index.html's
   main inline script (CLIENTS, currentClient(), currentWeek(), queueSave(),
   renderAll(), renderKPIs(), renderStages(), renderCharts(), closeCtxMenu(),
   weekDates() are all plain globals it calls directly — no imports needed). */
(function(){
  const PLATFORMS = ['typeform', 'calendly', 'meta', 'whop'];
  const PLATFORM_LABEL = { typeform: 'Typeform', calendly: 'Calendly', meta: 'Meta Ads', whop: 'Whop' };
  const PLATFORM_RESOURCE_LABEL = { typeform: 'form', calendly: 'event type', meta: 'ad account', whop: 'product' };
  const RESOURCE_ENDPOINT = { typeform: '/api/typeform/forms', calendly: '/api/calendly/event-types', meta: '/api/meta/adaccounts', whop: '/api/whop/products' };
  const RESOURCE_KEY = { typeform: 'formId', calendly: 'eventTypeUri', meta: 'adAccountId', whop: 'productId' };
  const RESOURCE_ID_FIELD = { typeform: 'id', calendly: 'uri', meta: 'id', whop: 'id' };
  const RESOURCE_NAME_FIELD = { typeform: 'title', calendly: 'name', meta: 'name', whop: 'name' };

  let statusCache = {};

  function getClientId(){
    const c = typeof currentClient === 'function' ? currentClient() : null;
    return c ? c.id : null;
  }

  async function fetchStatus(){
    const clientId = getClientId();
    if(!clientId){ statusCache = {}; return statusCache; }
    try{
      const res = await fetch('/api/status?clientId=' + encodeURIComponent(clientId));
      statusCache = await res.json();
    }catch(e){
      statusCache = {};
    }
    return statusCache;
  }

  function renderChips(){
    const row = document.getElementById('sourcesRow');
    if(!row) return;
    row.innerHTML = '';
    const c = typeof currentClient === 'function' ? currentClient() : null;
    PLATFORMS.forEach(platform => {
      const entry = statusCache[platform] || { connected: false };
      const mapping = c && c.integrations && c.integrations[platform];
      const chip = document.createElement('div');
      chip.className = 'source-chip' + (entry.connected ? (entry.expired ? ' expired' : ' connected') : '');
      let label;
      if(!entry.connected){
        label = `<b>${PLATFORM_LABEL[platform]}</b> &middot; not connected`;
      }else if(entry.expired){
        label = `<b>${PLATFORM_LABEL[platform]}</b> &middot; expired, click to reconnect`;
      }else{
        const who = entry.account ? (entry.account.email || entry.account.name) : '';
        label = `<b>${PLATFORM_LABEL[platform]}</b> &middot; connected${who ? ' as ' + who : ''}${mapping ? '' : ' (no client mapped)'}`;
      }
      chip.innerHTML = `<span class="dot"></span>${label}`;
      chip.title = entry.connected ? (entry.expired ? 'Click to reconnect' : 'Click for options') : 'Click to connect';
      if(platform === 'meta' && !entry.connected){
        chip.title += ' — only ad accounts you personally administer will be usable (Meta Development Mode limitation)';
      }
      chip.addEventListener('click', (e) => {
        if(!entry.connected || entry.expired){
          const clientId = getClientId();
          if(!clientId){ alert('Please select a client first.'); return; }
          window.location.href = `/api/auth/${platform}/start?clientId=${encodeURIComponent(clientId)}`;
        }else{
          openIntegrationMenu(e, platform);
        }
      });
      row.appendChild(chip);
    });
  }

  function openIntegrationMenu(e, platform){
    closeCtxMenu();
    const menu = document.createElement('div');
    menu.id = 'ctxMenu'; menu.className = 'ctx-menu';
    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';
    menu.innerHTML = `
      <button data-action="map">Choose ${PLATFORM_RESOURCE_LABEL[platform]} for this client</button>
      <button data-action="sync">Sync now</button>
      <button data-action="disconnect" class="danger">Disconnect</button>
    `;
    document.body.appendChild(menu);
    menu.querySelector('[data-action="map"]').addEventListener('click', () => { closeCtxMenu(); openResourcePicker(platform); });
    menu.querySelector('[data-action="sync"]').addEventListener('click', () => { closeCtxMenu(); syncPlatformNow(platform); });
    menu.querySelector('[data-action="disconnect"]').addEventListener('click', async () => { closeCtxMenu(); await disconnectPlatform(platform); });
    setTimeout(() => document.addEventListener('click', closeCtxMenu), 0);
  }

  async function disconnectPlatform(platform){
    const clientId = getClientId();
    if(!clientId) return;
    await fetch(`/api/auth/${platform}/disconnect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId })
    });
    await fetchStatus();
    renderChips();
  }

  async function openResourcePicker(platform){
    const clientId = getClientId();
    if(!clientId){ alert('Please select a client first.'); return; }
    const backdrop = document.createElement('div');
    backdrop.className = 'resource-modal-backdrop';
    backdrop.innerHTML = `
      <div class="resource-modal">
        <h3>Choose ${PLATFORM_LABEL[platform]} ${PLATFORM_RESOURCE_LABEL[platform]}</h3>
        <p>Pick which ${PLATFORM_RESOURCE_LABEL[platform]} feeds metrics into this client.</p>
        <div class="resource-list" id="resourceList"><span style="color:var(--muted);font-size:12px;">Loading&hellip;</span></div>
        <button class="close-btn" id="resourceModalClose">Cancel</button>
      </div>`;
    document.body.appendChild(backdrop);
    document.getElementById('resourceModalClose').addEventListener('click', () => backdrop.remove());
    backdrop.addEventListener('click', (e) => { if(e.target === backdrop) backdrop.remove(); });
    try{
      const res = await fetch(RESOURCE_ENDPOINT[platform] + '?clientId=' + encodeURIComponent(clientId));
      if(!res.ok){
        const err = await res.json().catch(() => ({ error: 'Request failed' }));
        document.getElementById('resourceList').innerHTML = `<span style="color:var(--bad);font-size:12px;">${err.error || 'Failed to load list.'}</span>`;
        return;
      }
      const items = await res.json();
      const list = document.getElementById('resourceList');
      if(!Array.isArray(items) || !items.length){
        list.innerHTML = `<span style="color:var(--muted);font-size:12px;">No ${PLATFORM_RESOURCE_LABEL[platform]}s found on this account.</span>`;
        return;
      }
      list.innerHTML = items.map(item => `<button class="resource-item" data-id="${item[RESOURCE_ID_FIELD[platform]]}">${item[RESOURCE_NAME_FIELD[platform]]}</button>`).join('');
      list.querySelectorAll('.resource-item').forEach(btn => {
        btn.addEventListener('click', () => {
          const c = currentClient();
          if(!c.integrations) c.integrations = {};
          c.integrations[platform] = { [RESOURCE_KEY[platform]]: btn.dataset.id };
          queueSave();
          backdrop.remove();
          renderChips();
          syncPlatformNow(platform);
        });
      });
    }catch(err){
      document.getElementById('resourceList').innerHTML = `<span style="color:var(--bad);font-size:12px;">Failed to load: ${err.message}</span>`;
    }
  }

  async function syncPlatformNow(platform){
    const clientId = getClientId();
    if(!clientId) return;
    const c = currentClient();
    const mapping = c.integrations && c.integrations[platform];
    if(!mapping) return;
    const w = currentWeek();
    const dates = weekDates(w.start);
    const params = new URLSearchParams({ since: dates[0], until: dates[6], ...mapping, clientId });
    try{
      const res = await fetch(`/api/sync/${platform}?${params.toString()}`);
      if(!res.ok){
        const err = await res.json().catch(() => ({ error: 'Sync failed' }));
        alert(`${PLATFORM_LABEL[platform]} sync failed: ${err.error || res.status}`);
        return;
      }
      const data = await res.json();
      Object.entries(data.metrics || {}).forEach(([metricId, values]) => {
        values.forEach((v, i) => { if(v !== null && v !== undefined) w.metrics[metricId][i] = v; });
      });
      queueSave();
      renderKPIs(); renderStages(); renderCharts();
    }catch(err){
      alert(`${PLATFORM_LABEL[platform]} sync failed: ${err.message}`);
    }
  }

  function handleRedirectParams(){
    const params = new URLSearchParams(window.location.search);
    const connected = params.get('connected');
    const connectedClientId = params.get('clientId');
    const connectError = params.get('connect_error');
    if(connected || connectError) window.history.replaceState({}, '', window.location.pathname);
    if(connectError) alert(`Couldn't connect ${PLATFORM_LABEL[connectError] || connectError}. Please try again.`);
    // If the OAuth callback returned a clientId, switch to that client so the
    // status refresh shows the newly-connected token in the right context.
    if(connected && connectedClientId){
      const switcher = window.switchToClient || window.selectClient;
      if(typeof switcher === 'function') switcher(connectedClientId);
    }
  }

  async function initIntegrationsInternal(){
    handleRedirectParams();
    await fetchStatus();
    renderChips();
    const c = typeof currentClient === 'function' ? currentClient() : null;
    if(c && c.integrations){
      for(const platform of PLATFORMS){
        const entry = statusCache[platform];
        if(entry && entry.connected && !entry.expired && c.integrations[platform]){
          syncPlatformNow(platform);
        }
      }
    }
  }

  // Re-render chips (and refresh status for the current client) whenever the
  // rest of the app re-renders — this covers client/week switches automatically.
  if(typeof window.renderAll === 'function'){
    const originalRenderAll = window.renderAll;
    window.renderAll = async function(){
      originalRenderAll();
      await fetchStatus();
      renderChips();
    };
  }

  // Expose so index.html can call window.refreshIntegrationChips() directly
  // on a client switch if it has its own hook point.
  window.refreshIntegrationChips = async function(){
    await fetchStatus();
    renderChips();
  };

  // The app may already be unlocked (sessionStorage-persisted auth from a prior
  // page load in this tab), in which case startApp() already ran synchronously
  // before this deferred script executed — so check current state directly
  // instead of relying on a hook inside startApp() (which would race).
  const appWrap = document.getElementById('appWrap');
  if(appWrap && !appWrap.classList.contains('app-locked')){
    initIntegrationsInternal();
  }
  // Also cover the not-yet-authed path: wrap unlockApp so integrations init
  // right after the password gate succeeds.
  if(typeof window.unlockApp === 'function'){
    const originalUnlock = window.unlockApp;
    window.unlockApp = function(){
      originalUnlock();
      initIntegrationsInternal();
    };
  }
})();
