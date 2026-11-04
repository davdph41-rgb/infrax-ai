// api/chat.js
// Vercel Serverless Function (CommonJS, aman tanpa package.json "type": "module")

module.exports = async function handler(req, res) {
  // Hanya izinkan POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Vercel biasanya sudah mem-parse body JSON.
    // Kalau masih string, kita parse manual.
    let body = req.body;
    if (typeof body === 'string') {
      body = JSON.parse(body);
    }

    const messages = body?.messages;

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Field "messages" wajib berupa array.' });
    }

    const apiKey = process.env.INFERX_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'INFERX_API_KEY belum diset di Vercel.' });
    }

    // Base URL bisa diatur lewat Environment Variable.
    // Default mengikuti base URL yang umum dipakai InferX.
    const baseUrl = process.env.INFERX_BASE_URL || 'https://model.inferx.net/endpoints/v1';
    const endpoint = `${baseUrl.replace(/\/$/, '')}/chat/completions`;

    const inferxResponse = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-v4.1-flash-1017-basic',
        messages: messages,
        stream: false,
      }),
    });

    const data = await inferxResponse.json().catch(() => ({}));

    if (!inferxResponse.ok) {
      return res.status(inferxResponse.status).json({
        error: 'Gagal memanggil InferX.',
        status: inferxResponse.status,
        details: data,
      });
    }

    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({
      error: 'Terjadi kesalahan di server.',
      details: error.message,
    });
  }
};
