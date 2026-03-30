// api/survey-submit.js
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = req.body || {};
    const { seller, storeHandle, email, score, department, geography, city,
            comment, mainIssue, aspects, satisfaction, biggestIssues,
            importance, period, submittedAt, source } = body;

    if (score === undefined || score === null || score < 0 || score > 10) {
      return res.status(400).json({ error: 'Invalid score' });
    }

    const entry = {
      seller: seller || storeHandle || 'Unknown',
      storeHandle: storeHandle || seller || '',
      email: email || '',
      score: parseInt(score),
      department: department || aspects || 'Seller Support',
      geography: geography || 'PK Zone',
      city: city || '',
      comment: comment || '',
      mainIssue: mainIssue || '',
      aspects: aspects || '',
      satisfaction: satisfaction || {},
      biggestIssues: biggestIssues || '',
      importance: importance || {},
      period: period || (() => {
        const d = new Date();
        return d.toLocaleString('en-US', { month: 'short' }) + ' ' + d.getFullYear();
      })(),
      submittedAt: submittedAt || new Date().toISOString(),
      source: source || 'survey_form'
    };

    if (!global.npsResponses) global.npsResponses = [];
    global.npsResponses.unshift(entry);
    if (global.npsResponses.length > 5000) global.npsResponses = global.npsResponses.slice(0, 5000);

    // ── Slack Notification ────────────────────────────────────────────────
    const slackWebhook = process.env.SLACK_WEBHOOK_URL;
    if (slackWebhook) {
      const cat = entry.score >= 9 ? 'Promoter' : entry.score >= 7 ? 'Passive' : 'Detractor';
      const emoji = entry.score >= 9 ? '🟢' : entry.score >= 7 ? '🟡' : '🔴';
      const npsEmoji = { Promoter: '✅', Passive: '⚠️', Detractor: '🚨' }[cat];

      const slackBody = {
        text: `${npsEmoji} New NPS submission — *${entry.seller}* scored *${entry.score}/10* (${cat})`,
        blocks: [
          {
            type: 'header',
            text: { type: 'plain_text', text: `${emoji} New NPS Response — ${entry.period}`, emoji: true }
          },
          {
            type: 'section',
            fields: [
              { type: 'mrkdwn', text: `*Seller*\n${entry.seller || 'Unknown'}` },
              { type: 'mrkdwn', text: `*Score*\n${entry.score}/10 — ${cat}` },
              { type: 'mrkdwn', text: `*Email*\n${entry.email || '—'}` },
              { type: 'mrkdwn', text: `*Geography*\n${entry.geography || '—'}` },
              { type: 'mrkdwn', text: `*Department*\n${entry.department || '—'}` },
              { type: 'mrkdwn', text: `*Period*\n${entry.period}` }
            ]
          },
          ...(entry.comment ? [{
            type: 'section',
            text: { type: 'mrkdwn', text: `*Comment*\n_"${entry.comment}"_` }
          }] : []),
          ...(entry.biggestIssues ? [{
            type: 'section',
            text: { type: 'mrkdwn', text: `*Biggest Issues*\n${entry.biggestIssues}` }
          }] : []),
          {
            type: 'context',
            elements: [
              { type: 'mrkdwn', text: `Submitted ${new Date(entry.submittedAt).toLocaleString('en-GB')} · Source: ${entry.source} · <https://fleek-nps-dashboard.vercel.app/dashboard|View Dashboard>` }
            ]
          },
          { type: 'divider' }
        ]
      };

      try {
        await fetch(slackWebhook, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(slackBody)
        });
        console.log('[survey-submit] Slack notified for', entry.seller);
      } catch (slackErr) {
        console.error('[survey-submit] Slack error:', slackErr.message);
        // Don't fail the submission if Slack fails
      }
    }

    return res.status(201).json({
      success: true,
      message: 'Response recorded',
      seller: entry.seller,
      score: entry.score,
      period: entry.period
    });

  } catch (err) {
    console.error('[survey-submit] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
