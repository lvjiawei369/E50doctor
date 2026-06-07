const https = require('https');
const http = require('http');

const APP_ID = '93abde237c6a4fd5ac06dac238edb184';
const PORT = process.env.PORT || 9000;

function httpsPost(options, payload) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'method not allowed' }));
    return;
  }

  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', async () => {
    const API_KEY = process.env.DASHSCOPE_API_KEY;

    // TTS route
    if (req.url === '/tts') {
      try {
        const { text } = JSON.parse(body);
        if (!text) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'text required' }));
          return;
        }
        const plain = text.replace(/[#*`>\-_~\[\]()]/g, '').replace(/\n+/g, '，');
        const payload = JSON.stringify({
          model: 'cosyvoice-v2',
          input: { text: plain },
          parameters: { voice: 'longxiaochun_v2', format: 'mp3' }
        });
        const result = await httpsPost({
          hostname: 'dashscope.aliyuncs.com',
          path: '/api/v1/services/audio/tts/SpeechSynthesizer',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${API_KEY}`,
            'X-DashScope-Async': 'disable',
            'Content-Length': Buffer.byteLength(payload),
          },
        }, payload);
        const json = JSON.parse(result.body);
        const audioUrl = json.output?.audio?.url;
        if (!audioUrl) throw new Error(json.message || 'no audio url');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ url: audioUrl }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
      return;
    }

    // Chat route
    try {
      const { prompt, session_id } = JSON.parse(body);
      if (!prompt) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'prompt required' }));
        return;
      }

      const input = { prompt };
      if (session_id) input.session_id = session_id;

      const payload = JSON.stringify({ input, parameters: { incremental_output: true } });

      const options = {
        hostname: 'dashscope.aliyuncs.com',
        path: `/api/v1/apps/${APP_ID}/completion`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${API_KEY}`,
          'X-DashScope-SSE': 'enable',
          'Content-Length': Buffer.byteLength(payload),
        },
      };

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no',
      });

      const proxyReq = https.request(options, proxyRes => {
        proxyRes.on('data', chunk => { res.write(chunk); });
        proxyRes.on('end', () => { res.end(); });
      });

      proxyReq.on('error', e => {
        res.write(`data: ${JSON.stringify({ error: e.message })}\n\n`);
        res.end();
      });

      proxyReq.write(payload);
      proxyReq.end();
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'invalid json' }));
    }
  });
});

server.listen(PORT, () => {
  console.log(`proxy listening on port ${PORT}`);
});
