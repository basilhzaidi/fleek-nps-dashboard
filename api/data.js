// api/data.js
// Persistent data API — reads/writes data.json in the GitHub repo
// This makes data available to ALL users across all devices

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO = process.env.GITHUB_REPO || 'basilhzaidi/fleek-nps-dashboard';
const FILE_PATH = 'public/data.json';
const RAW_URL = `https://raw.githubusercontent.com/${REPO}/main/${FILE_PATH}`;

async function readData() {
  // Read from raw GitHub URL (fast CDN, no auth needed)
  const res = await fetch(RAW_URL + '?t=' + Date.now());
  if (!res.ok) return { responses: [] };
  return await res.json();
}

async function writeData(data) {
  if (!GITHUB_TOKEN) throw new Error('GITHUB_TOKEN not configured');
  // Get current SHA
  const shaRes = await fetch(`https://api.github.com/repos/${REPO}/contents/${FILE_PATH}`, {
    headers: { 'Authorization': `Bearer ${GITHUB_TOKEN}` }
  });
  const shaData = await shaRes.json();
  const sha = shaData.sha;

  // Write updated data
  const content = Buffer.from(JSON.stringify(data, null, 2)).toString('base64');
  const writeRes = await fetch(`https://api.github.com/repos/${REPO}/contents/${FILE_PATH}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${GITHUB_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      message: `NPS response added — ${new Date().toISOString()}`,
      content,
      sha,
      branch: 'main'
    })
  });
  if (!writeRes.ok) {
    const err = await writeRes.json();
    throw new Error(err.message || 'GitHub write failed');
  }
  return true;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // GET — return all data
  if (req.method === 'GET') {
    try {
      const data = await readData();
      const responses = data.responses || [];
      const total = responses.length;
      const promoters = responses.filter(r => r.score >= 9).length;
      const passives  = responses.filter(r => r.score >= 7 && r.score <= 8).length;
      const detractors= responses.filter(r => r.score <= 6).length;
      const nps = total === 0 ? 0 : Math.round((promoters - detractors) / total * 100);
      return res.status(200).json({ responses, summary: { total, promoters, passives, detractors, nps }, lastUpdated: data.lastUpdated });
    } catch(err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // POST — add a single response OR bulk import an array
  if (req.method === 'POST') {
    try {
      const body = req.body || {};
      const curPeriod = () => { const d = new Date(); return d.toLocaleString('en-US', { month: 'short' }) + ' ' + d.getFullYear(); };

      function buildEntry(b) {
        const score = parseInt(b.score);
        if (isNaN(score) || score < 0 || score > 10) return null;
        const entry = {
          seller: b.seller || b.storeHandle || 'Unknown',
          storeHandle: b.storeHandle || b.seller || '',
          email: b.email || '',
          score,
          department: b.department || b.aspects || 'Seller Support',
          geography: b.geography || 'PK Zone',
          city: b.city || '',
          comment: b.comment || '',
          mainIssue: b.mainIssue || '',
          aspects: b.aspects || '',
          satisfaction: b.satisfaction || {},
          biggestIssues: b.biggestIssues || '',
          period: b.period || curPeriod(),
          submittedAt: b.submittedAt || new Date().toISOString(),
          source: b.source || 'survey_form'
        };
        if (b.areaTag) entry.areaTag = b.areaTag;
        return entry;
      }

      // Bulk mode: body is an array
      const isBulk = Array.isArray(body);
      const entries = isBulk
        ? body.map(buildEntry).filter(Boolean)
        : [buildEntry(body)].filter(Boolean);

      if (!entries.length) return res.status(400).json({ error: 'No valid entries' });

      // Write to GitHub
      const data = await readData();
      data.responses = [...entries, ...(data.responses || [])];
      data.lastUpdated = new Date().toISOString();
      await writeData(data);

      // Slack notification (single entry only)
      if (!isBulk) {
        const entry = entries[0];
        const slackWebhook = process.env.SLACK_WEBHOOK_URL;
        if (slackWebhook) {
          const cat = entry.score >= 9 ? 'Promoter' : entry.score >= 7 ? 'Passive' : 'Detractor';
          const emoji = entry.score >= 9 ? '🟢' : entry.score >= 7 ? '🟡' : '🔴';
          try {
            await fetch(slackWebhook, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                text: `${emoji} New NPS — *${entry.seller}* scored *${entry.score}/10* (${cat}) · ${entry.period}`,
                blocks: [
                  { type: 'header', text: { type: 'plain_text', text: `${emoji} New NPS Response — ${entry.period}`, emoji: true }},
                  { type: 'section', fields: [
                    { type: 'mrkdwn', text: `*Seller*\n${entry.seller}` },
                    { type: 'mrkdwn', text: `*Score*\n${entry.score}/10 — ${cat}` },
                    { type: 'mrkdwn', text: `*Email*\n${entry.email || '—'}` },
                    { type: 'mrkdwn', text: `*Zone*\n${entry.geography}` }
                  ]},
                  ...(entry.comment ? [{ type: 'section', text: { type: 'mrkdwn', text: `*Comment*\n_"${entry.comment}"_` }}] : []),
                  { type: 'context', elements: [{ type: 'mrkdwn', text: `Source: ${entry.source} · <https://fleek-nps-dashboard.vercel.app/dashboard|View Dashboard>` }]}
                ]
              })
            });
          } catch(e) { console.error('[data.js] Slack error:', e.message); }
        }
        return res.status(201).json({ success: true, seller: entry.seller, score: entry.score, period: entry.period });
      }

      return res.status(201).json({ success: true, imported: entries.length });
    } catch(err) {
      console.error('[data.js] POST error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
