// api/results.js
if (!global.npsResponses) global.npsResponses = [];

module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const responses = global.npsResponses;
  const total = responses.length;
  const promoters = responses.filter(r => r.score >= 9).length;
  const passives = responses.filter(r => r.score >= 7 && r.score <= 8).length;
  const detractors = responses.filter(r => r.score <= 6).length;
  const nps = total === 0 ? 0 : Math.round(((promoters - detractors) / total) * 100);

  return res.status(200).json({
    responses,
    summary: { total, promoters, passives, detractors, nps }
  });
};