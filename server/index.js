require('dotenv').config();
const express = require('express');
const path = require('path');

const statusRoutes = require('./routes/status');
const authRoutes = require('./routes/auth');
const resourceRoutes = require('./routes/resources');
const syncRoutes = require('./routes/sync');

const app = express();
const PORT = process.env.PORT || 5175;
const PROJECT_ROOT = path.join(__dirname, '..');

app.use(express.json());

// Explicit, named static routes only — the project folder is NOT served as a
// whole directory. This means nothing else that lives alongside index.html
// (including this server's own token storage in server/data/) is ever
// web-reachable, by construction rather than by a blocklist that could later
// be forgotten or bypassed.
app.get('/', (req, res) => res.sendFile(path.join(PROJECT_ROOT, 'index.html')));
app.get('/integrations.js', (req, res) => res.sendFile(path.join(PROJECT_ROOT, 'integrations.js')));

app.use('/api', statusRoutes);
app.use('/api', authRoutes);
app.use('/api', resourceRoutes);
app.use('/api', syncRoutes);

app.listen(PORT, () => {
  console.log(`EDUCATR Growth Engine running at http://localhost:${PORT}`);
});
