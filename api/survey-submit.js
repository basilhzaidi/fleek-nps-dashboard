// api/survey-submit.js
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = req.body || {};
    const score = parseInt(body.score);
    if (isNaN(score) || score < 0 || score > 10) {
      return res.status(400).json({ error: 'Invalid score' });
    }

    const entry = {
      email:        body.email || '',
      seller:       body.seller || body.storeHandle || 'Unknown',
      storeHandle:  body.storeHandle || body.seller || '',
      score,
      department:   body.department || body.aspects || 'Seller Support',
      geography:    body.geography || 'PK Zone',
      city:         body.city || '',
      comment:      body.comment || '',
      mainIssue:    body.mainIssue || '',
      aspects:      body.aspects || '',
      satisfaction: body.satisfaction || {},
      biggestIssues:body.biggestIssues || '',
      period:       body.period || (() => {
        const d = new Date();
        return d.toLocaleString('en-US', { month: 'short' }) + ' ' + d.getFullYear();
      })(),
      submittedAt:  new Date().toISOString(),
      source:       'survey_form'
    };

    if (!global.npsResponses) global.npsResponses = [];
    global.npsResponses.unshift(entry);
    if (global.npsResponses.length > 5000) global.npsResponses = global.npsResponses.slice(0, 5000);

    // ── Slack DM notification to Basil ──────────────────────────────────────
    const slackToken = process.env.SLACK_BOT_TOKEN;
    if (slackToken) {
      const cat = score >= 9 ? '🟢 Promoter' : score >= 7 ? '🟡 Passive' : '🔴 Detractor';
      const scoreBar = '█'.repeat(score) + '░'.repeat(10 - score);
      const slackMsg = {
        channel: 'U0947NPLP1V', // Basil's user ID — private DM
        text: `📋 New NPS Response — ${entry.period}`,
        blocks: [
          {
            type: 'header',
            text: { type: 'plain_text', text: `📋 New NPS Response — ${entry.period}` }
          },
          {
            type: 'section',
            fields: [
              { type: 'mrkdwn', text: `*🏪 Store*\n${entry.seller || entry.storeHandle || 'Unknown'}` },
              { type: 'mrkdwn', text: `*📧 Email*\n${entry.email || '—'}` },
              { type: 'mrkdwn', text: `*📊 Score*\n${score}/10  ${cat}` },
              { type: 'mrkdwn', text: `*🌍 Zone*\n${entry.geography}${entry.city ? ' · ' + entry.city : ''}` }
            ]
          },
          entry.comment ? {
            type: 'section',
            text: { type: 'mrkdwn', text: `*💬 Reason for score*\n_${entry.comment}_` }
          } : null,
          (entry.biggestIssues || entry.mainIssue) ? {
            type: 'section',
            text: { type: 'mrkdwn', text: `*⚠️ Issues*\n${entry.biggestIssues || entry.mainIssue}` }
          } : null,
          {
            type: 'context',
            elements: [
              { type: 'mrkdwn', text: `Submitted via ${entry.source} · ${new Date(entry.submittedAt).toLocaleString('en-GB', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })}` }
            ]
          },
          { type: 'divider' }
        ].filter(Boolean)
      };

      await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${slackToken}`
        },
        body: JSON.stringify(slackMsg)
      }).catch(e => console.error('[survey-submit] Slack error:', e.message));
    }

    return res.status(201).json({ success: true, period: entry.period, score: entry.score });

  } catch (err) {
    console.error('[survey-submit] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
