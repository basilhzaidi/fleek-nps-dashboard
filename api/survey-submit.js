// api/survey-submit.js
// Receives survey form submissions and stores them
if (!global.npsResponses) global.npsResponses = [];

module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { seller, score, department, geography, city, comment, mainIssue, extraComment, importance, period, submittedAt } = req.body;
  
  if (score === undefined || score < 0 || score > 10) {
    return res.status(400).json({ error: 'Score must be between 0 and 10' });
  }

  const entry = {
    id: Date.now(),
    seller: seller || 'Anonymous',
    score: parseInt(score),
    department: department || '',
    geography: geography || '',
    city: city || '',
    comment: comment || '',
    mainIssue: mainIssue || '',
    extraComment: extraComment || '',
    importance: importance || {},
    period: period || new Date().toLocaleString('en-US', { month: 'short', year: 'numeric' }),
    submittedAt: submittedAt || new Date().toISOString(),
    source: 'survey_form'
  };

  global.npsResponses.unshift(entry);
  return res.status(201).json({ success: true, entry });
};