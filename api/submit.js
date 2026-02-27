// api/submit.js
// In-memory store (resets on cold start). For persistence, connect a DB like PlanetScale or Supabase.
if (!global.npsResponses) global.npsResponses = [];

module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { name, score, comment, date } = req.body;
  if (score === undefined || score < 0 || score > 10) {
    return res.status(400).json({ error: 'Score must be between 0 and 10' });
  }

  const entry = {
    id: Date.now(),
    name: name || 'Anonymous',
    score: parseInt(score),
    comment: comment || '',
    date: date || new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  };

  global.npsResponses.unshift(entry);
  return res.status(201).json({ success: true, entry });
};