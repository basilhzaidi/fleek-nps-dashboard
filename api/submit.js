const responses = global.npsResponses || (global.npsResponses = []);
module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({error:'Method not allowed'});
  const {seller, score, comment, department, region, period} = req.body || {};
  if (score === undefined || score === null || score < 0 || score > 10)
    return res.status(400).json({error:'Score must be 0-10'});
  const entry = {
    id: Date.now(),
    seller: seller || 'Anonymous',
    score: parseInt(score),
    comment: comment || '',
    department: department || '',
    region: region || 'PK Non-Zone',
    period: period || new Date().toLocaleString('en-US',{month:'short',year:'numeric'}),
    submittedAt: new Date().toISOString()
  };
  responses.push(entry);
  global.npsResponses = responses;
  return res.status(201).json({success:true, entry});
};