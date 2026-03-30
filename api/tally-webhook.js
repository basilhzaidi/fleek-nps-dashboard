// api/tally-webhook.js
// Receives Tally form submissions and converts them to NPS dashboard format
// Set this as your Tally form webhook: https://fleek-nps-dashboard.vercel.app/api/tally-webhook
module.exports = function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

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
    if (!score || score < 1 || score > 10) {
      return res.status(400).json({ error: 'Invalid or missing NPS score', received: scoreRaw });
    }

    const entry = {
      email: getField('email') || getField('registered email') || '',
      seller: getField('store handle') || getField('store name') || 'Unknown',
      storeHandle: getField('store handle') || '',
      score,
      comment: getField('main reason') || getField('reason for') || '',
      mainIssue: getField('improve') || getField('improvement') || '',
      aspects: getField('aspects') || getField('value the most') || '',
      satisfaction: getMatrix('satisfied') || getMatrix('satisfaction') || {},
      biggestIssues: getField('biggest issues') || getField('issues') || '',
      department: getField('aspects') || 'Seller Support',
      geography: 'PK Zone',
      city: '',
      period: new Date().toLocaleString('en-US', { month: 'short' }) + ' ' + new Date().getFullYear(),
      submittedAt: new Date().toISOString(),
      source: 'tally_webhook'
    };

    if (!global.npsResponses) global.npsResponses = [];
    global.npsResponses.unshift(entry);
    if (global.npsResponses.length > 5000) global.npsResponses = global.npsResponses.slice(0, 5000);

    console.log('[tally-webhook] New:', entry.seller, 'Score:', entry.score);
    return res.status(200).json({ success: true, seller: entry.seller, score: entry.score, period: entry.period });

  } catch (err) {
    console.error('[tally-webhook] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
