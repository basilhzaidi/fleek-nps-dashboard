// api/tally-webhook.js
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
      body: JSON.stringify({ message: `NPS Tally: ${entry.seller} score ${entry.score}`, content: Buffer.from(JSON.stringify(data, null, 2)).toString('base64'), sha, branch: 'main' })
    });
  } catch(e) { console.error('[tally-webhook] GitHub write error:', e.message); }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const fields = req.body?.data?.fields || [];
    const getField = (label) => {
      const f = fields.find(f => f.label && f.label.toLowerCase().includes(label.toLowerCase()));
      if (!f) return null;
      if (f.type === 'MULTIPLE_CHOICE' || f.type === 'DROPDOWN') return f.value?.[0]?.text || f.value || null;
      return f.value || null;
    };
    const getMatrix = (label) => {
      const f = fields.find(f => f.label && f.label.toLowerCase().includes(label.toLowerCase()));
      if (!f || f.type !== 'MATRIX') return {};
      const result = {};
      (f.value || []).forEach(row => { result[row.rowLabel] = row.columnLabel; });
      return result;
    };
    const scoreRaw = getField('how likely') || getField('scale') || getField('recommend');
    const score = parseInt(scoreRaw);
    if (!score || score < 1 || score > 10) return res.status(400).json({ error: 'Invalid score', received: scoreRaw });

    const entry = {
      email: getField('email') || getField('registered email') || '',
      seller: getField('store handle') || getField('store name') || 'Unknown',
      storeHandle: getField('store handle') || '',
      score,
      comment: getField('main reason') || getField('reason for') || '',
      mainIssue: getField('improve') || getField('improvement') || '',
      aspects: getField('aspects') || getField('value the most') || '',
      satisfaction: getMatrix('satisfied') || {},
      biggestIssues: getField('biggest issues') || getField('issues') || '',
      department: getField('aspects') || 'Seller Support',
      geography: 'PK Zone', city: '',
      period: new Date().toLocaleString('en-US', { month: 'short' }) + ' ' + new Date().getFullYear(),
      submittedAt: new Date().toISOString(),
      source: 'tally_webhook'
    };

    await appendToGitHub(entry);
    if (!global.npsResponses) global.npsResponses = [];
    global.npsResponses.unshift(entry);

    const slackWebhook = process.env.SLACK_WEBHOOK_URL;
    if (slackWebhook) {
      const cat = score >= 9 ? 'Promoter' : score >= 7 ? 'Passive' : 'Detractor';
      const emoji = score >= 9 ? '🟢' : score >= 7 ? '🟡' : '🔴';
      try {
        await fetch(slackWebhook, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: `${emoji} New Tally NPS — *${entry.seller}* scored *${score}/10* (${cat}) · ${entry.period}`,
            blocks: [
              { type: 'header', text: { type: 'plain_text', text: `${emoji} Tally NPS — ${entry.period}`, emoji: true }},
              { type: 'section', fields: [
                { type: 'mrkdwn', text: `*Seller*\n${entry.seller}` },
                { type: 'mrkdwn', text: `*Score*\n${score}/10 — ${cat}` },
                { type: 'mrkdwn', text: `*Email*\n${entry.email || '—'}` },
                { type: 'mrkdwn', text: `*Period*\n${entry.period}` }
              ]},
              ...(entry.comment ? [{ type: 'section', text: { type: 'mrkdwn', text: `*Comment*\n_"${entry.comment}"_` }}] : []),
              { type: 'context', elements: [{ type: 'mrkdwn', text: `<https://fleek-nps-dashboard.vercel.app/dashboard|View Dashboard>` }]}
            ]
          })
        });
      } catch(e) { console.error('[tally-webhook] Slack error:', e.message); }
    }
    return res.status(200).json({ success: true, seller: entry.seller, score, period: entry.period });
  } catch(err) {
    console.error('[tally-webhook] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
