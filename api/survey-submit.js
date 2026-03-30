// api/survey-submit.js
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO = process.env.GITHUB_REPO || 'basilhzaidi/fleek-nps-dashboard';
const FILE_PATH = 'public/data.json';

async function appendToGitHub(entry) {
  if (!GITHUB_TOKEN) return;
  try {
    const raw = await fetch(`https://raw.githubusercontent.com/${REPO}/main/${FILE_PATH}?t=${Date.now()}`);
    const data = raw.ok ? await raw.json() : { responses: [] };
    data.responses = [entry, ...(data.responses || [])];
    data.lastUpdated = new Date().toISOString();
    const shaRes = await fetch(`https://api.github.com/repos/${REPO}/contents/${FILE_PATH}`, {
      headers: { 'Authorization': `Bearer ${GITHUB_TOKEN}` }
    });
    const { sha } = await shaRes.json();
    await fetch(`https://api.github.com/repos/${REPO}/contents/${FILE_PATH}`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${GITHUB_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: `NPS: ${entry.seller} score ${entry.score} ${entry.period}`, content: Buffer.from(JSON.stringify(data, null, 2)).toString('base64'), sha, branch: 'main' })
    });
  } catch(e) { console.error('[survey-submit] GitHub write error:', e.message); }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = req.body || {};
    const score = parseInt(body.score);
    if (isNaN(score) || score < 0 || score > 10) return res.status(400).json({ error: 'Invalid score' });

    const entry = {
      seller: body.seller || body.storeHandle || 'Unknown',
      storeHandle: body.storeHandle || body.seller || '',
      email: body.email || '',
      score,
      department: body.department || body.aspects || 'Seller Support',
      geography: body.geography || 'PK Zone',
      city: body.city || '',
      comment: body.comment || '',
      mainIssue: body.mainIssue || '',
      aspects: body.aspects || '',
      satisfaction: body.satisfaction || {},
      biggestIssues: body.biggestIssues || '',
      period: body.period || (()=>{ const d=new Date(); return d.toLocaleString('en-US',{month:'short'})+' '+d.getFullYear(); })(),
      submittedAt: body.submittedAt || new Date().toISOString(),
      source: body.source || 'survey_form'
    };

    // Write to GitHub (persistent, cross-device)
    await appendToGitHub(entry);

    // Also in-memory fallback
    if (!global.npsResponses) global.npsResponses = [];
    global.npsResponses.unshift(entry);

    // Slack
    const slackWebhook = process.env.SLACK_WEBHOOK_URL;
    if (slackWebhook) {
      const cat = score >= 9 ? 'Promoter' : score >= 7 ? 'Passive' : 'Detractor';
      const emoji = score >= 9 ? '🟢' : score >= 7 ? '🟡' : '🔴';
      try {
        await fetch(slackWebhook, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: `${emoji} New NPS — *${entry.seller}* scored *${score}/10* (${cat}) · ${entry.period}`,
            blocks: [
              { type: 'header', text: { type: 'plain_text', text: `${emoji} New NPS Response — ${entry.period}`, emoji: true }},
              { type: 'section', fields: [
                { type: 'mrkdwn', text: `*Seller*\n${entry.seller}` },
                { type: 'mrkdwn', text: `*Score*\n${score}/10 — ${cat}` },
                { type: 'mrkdwn', text: `*Email*\n${entry.email || '—'}` },
                { type: 'mrkdwn', text: `*Zone*\n${entry.geography}` }
              ]},
              ...(entry.comment ? [{ type: 'section', text: { type: 'mrkdwn', text: `*Comment*\n_"${entry.comment}"_` }}] : []),
              { type: 'context', elements: [{ type: 'mrkdwn', text: `<https://fleek-nps-dashboard.vercel.app/dashboard|View Dashboard>` }]}
            ]
          })
        });
      } catch(e) { console.error('[survey-submit] Slack error:', e.message); }
    }

    return res.status(201).json({ success: true, seller: entry.seller, score, period: entry.period });
  } catch(err) {
    console.error('[survey-submit] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
