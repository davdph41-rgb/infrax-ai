// api/chat.js

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Gunakan POST.' });
  }

  try {
    let body = req.body;
    if (typeof body === 'string') {
      body = JSON.parse(body);
    }
    
    const messages = body?.messages;
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Format request salah. Field "messages" wajib berupa array.' });
    }

    const apiKey = process.env.INFERX_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'API Key belum diset. Tambahkan INFERX_API_KEY di pengaturan Vercel.' });
    }

    const inferxResponse = await fetch('https://model.inferx.net/endpoints/v1/chat/completions', {
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

    // Penanganan Error yang lebih ramah
    if (!inferxResponse.ok) {
      // Jika error 429 (Server Penuh)
      if (inferxResponse.status === 429) {
        return res.status(429).json({
          error: '⚠️ Server AI sedang sibuk atau penuh. Silakan tunggu beberapa detik, lalu kirim ulang pesanmu.',
        });
      }
      
      // Jika error lainnya (401, 500, dll)
      return res.status(inferxResponse.status).json({
        error: `⚠️ Gagal memproses (Kode: ${inferxResponse.status}). Coba beberapa saat lagi.`,
        details: data,
      });
    }

    return res.status(200).json(data);

  } catch (error) {
    return res.status(500).json({
      error: '⚠️ Terjadi kesalahan pada jaringan server. Periksa koneksi internetmu.',
      details: error.message,
    });
  }
}
