// api/tally-webhook.js
// Receives Tally form submissions and converts them to the NPS dashboard format
// Set this URL as your Tally form webhook: https://fleek-nps-dashboard.vercel.app/api/tally-webhook

export default function handler(req, res) {
  // Allow CORS from Tally
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const body = req.body;
    
    // Tally sends data in fields array format
    const fields = body?.data?.fields || [];
    
    const getField = (label) => {
      const f = fields.find(f => f.label && f.label.toLowerCase().includes(label.toLowerCase()));
      if (!f) return null;
      if (f.type === 'MULTIPLE_CHOICE' || f.type === 'DROPDOWN') {
        return f.value?.[0]?.text || f.value || null;
      }
      return f.value || null;
    };
    
    const getMatrix = (label) => {
      const f = fields.find(f => f.label && f.label.toLowerCase().includes(label.toLowerCase()));
      if (!f || f.type !== 'MATRIX') return {};
      const result = {};
      (f.value || []).forEach(row => {
        result[row.rowLabel] = row.columnLabel;
      });
      return result;
    };

    // Map Tally fields to our data model
    const scoreRaw = getField('how likely') || getField('scale') || getField('recommend');
    const score = parseInt(scoreRaw) || null;
    
    const entry = {
      email: getField('email') || getField('registered email') || '',
      seller: getField('store handle') || getField('store name') || getField('handle') || 'Unknown',
      storeHandle: getField('store handle') || '',
      score: score,
      comment: getField('main reason') || getField('reason for') || '',
      mainIssue: getField('improve') || getField('improvement') || '',
      aspects: getField('aspects') || getField('value the most') || '',
      satisfaction: getMatrix('satisfied') || getMatrix('satisfaction') || {},
      biggestIssues: getField('biggest issues') || getField('issues') || '',
      department: getField('aspects') || 'Seller Support',
      geography: getField('geography') || getField('zone') || getField('region') || 'PK Zone',
      city: getField('city') || '',
      period: (() => {
        const d = new Date();
        return d.toLocaleString('en-US', { month: 'short' }) + ' ' + d.getFullYear();
      })(),
      submittedAt: new Date().toISOString(),
      source: 'tally_webhook'
    };

    if (entry.score === null || entry.score < 1 || entry.score > 10) {
      return res.status(400).json({ error: 'Invalid or missing NPS score', received: scoreRaw });
    }

    // Store in global in-memory store (same as survey-submit)
    if (!global.npsResponses) global.npsResponses = [];
    global.npsResponses.unshift(entry);
    if (global.npsResponses.length > 5000) global.npsResponses = global.npsResponses.slice(0, 5000);

    console.log('[tally-webhook] New submission:', entry.seller, 'Score:', entry.score, 'Period:', entry.period);

    return res.status(200).json({
      success: true,
      message: 'Response recorded',
      seller: entry.seller,
      score: entry.score,
      period: entry.period
    });

  } catch (err) {
    console.error('[tally-webhook] Error:', err.message);
    return res.status(500).json({ error: 'Internal server error', message: err.message });
  }
}
