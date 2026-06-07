const https = require('https');

const APP_ID = '93abde237c6a4fd5ac06dac238edb184';

function corsHeaders(resp) {
  resp.setHeader('Access-Control-Allow-Origin', '*');
  resp.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  resp.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports.handler = function (req, resp, context) {
  corsHeaders(resp);

  if (req.method === 'OPTIONS') {
    resp.setStatusCode(200);
    resp.send('');
    return;
  }

  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {
    try {
      const { prompt, session_id } = JSON.parse(body);
      if (!prompt) {
        resp.setStatusCode(400);
        resp.send(JSON.stringify({ error: 'prompt required' }));
        return;
      }

      const input = { prompt };
      if (session_id) input.session_id = session_id;

      const payload = JSON.stringify({ input });
      const API_KEY = process.env.DASHSCOPE_API_KEY;

      const options = {
        hostname: 'dashscope.aliyuncs.com',
        path: `/api/v1/apps/${APP_ID}/completion`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Length': Buffer.byteLength(payload),
        },
      };

      const proxyReq = https.request(options, proxyRes => {
        let data = '';
        proxyRes.on('data', chunk => { data += chunk; });
        proxyRes.on('end', () => {
          try {
            const json = JSON.parse(data);
            resp.setStatusCode(200);
            resp.setHeader('Content-Type', 'application/json');
            resp.send(JSON.stringify({
              reply: json.output?.text ?? '',
              sessionId: json.output?.session_id ?? '',
            }));
          } catch (e) {
            resp.setStatusCode(500);
            resp.send(JSON.stringify({ error: 'parse error' }));
          }
        });
      });

      proxyReq.on('error', e => {
        resp.setStatusCode(500);
        resp.send(JSON.stringify({ error: e.message }));
      });

      proxyReq.write(payload);
      proxyReq.end();
    } catch (e) {
      resp.setStatusCode(400);
      resp.send(JSON.stringify({ error: 'invalid json' }));
    }
  });
};
