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

    // 1. Ambil API Key dari Environment Variable Vercel
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'API Key belum diset. Tambahkan GEMINI_API_KEY di pengaturan Vercel.' });
    }

    // 2. Tembak API Gemini (Endpoint kompatibel OpenAI)
    const geminiResponse = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        // Kamu bisa mengganti model sesuai kebutuhan
        // Rekomendasi: 'gemini-3.8-flash' (terbaru & cepat) atau 'gemini-3.5-flash-lite' (kuota lebih hemat)
        model: 'gemini-3.8-flash', 
        messages: messages,
        stream: false,
      }),
    });

    // 3. Baca respons dari Gemini
    const data = await geminiResponse.json().catch(() => ({}));

    // 4. Penanganan Error
    if (!geminiResponse.ok) {
      // Jika error 429 (Rate Limit / Kuota Habis)
      if (geminiResponse.status === 429) {
        return res.status(429).json({
          error: '⚠️ Kuota gratis Gemini sedang habis atau terlalu banyak permintaan. Silakan tunggu sebentar.',
        });
      }
      
      // Jika error lainnya
      return res.status(geminiResponse.status).json({
        error: `⚠️ Gagal memproses (Kode: ${geminiResponse.status}).`,
        details: data,
      });
    }

    // 5. Kirim balik jawaban ke frontend
    return res.status(200).json(data);

  } catch (error) {
    return res.status(500).json({
      error: '⚠️ Terjadi kesalahan pada jaringan server.',
      details: error.message,
    });
  }
}
