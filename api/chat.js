// api/chat.js

export default async function handler(req, res) {
  // 1. Pastikan hanya menerima request metode POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Gunakan POST.' });
  }

  try {
    // 2. Ambil pesan dari frontend
    let body = req.body;
    if (typeof body === 'string') {
      body = JSON.parse(body);
    }
    
    const messages = body?.messages;
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Format request salah. Field "messages" wajib berupa array.' });
    }

    // 3. Ambil API Key dari Environment Variable Vercel
    const apiKey = process.env.INFERX_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'API Key belum diset. Tambahkan INFERX_API_KEY di pengaturan Vercel.' });
    }

    // 4. Tembak API InferX (URL yang sudah terbukti berhasil)
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

    // 5. Baca respons dari InferX
    const data = await inferxResponse.json().catch(() => ({}));

    // 6. Jika InferX error (misal: 429 kapasitas penuh, atau 401 key salah)
    if (!inferxResponse.ok) {
      return res.status(inferxResponse.status).json({
        error: 'Terjadi kesalahan pada server InferX.',
        status: inferxResponse.status,
        details: data,
      });
    }

    // 7. Jika sukses, kirim balik jawaban ke frontend
    return res.status(200).json(data);

  } catch (error) {
    // Tangkap error sistem (misal: koneksi internet server Vercel putus)
    return res.status(500).json({
      error: 'Terjadi kesalahan internal pada server.',
      details: error.message,
    });
  }
}
