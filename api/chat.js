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

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'API Key belum diset. Tambahkan GEMINI_API_KEY di pengaturan Vercel.' });
    }

    const endpoint = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
    
    // Konfigurasi Model (bisa diganti ke 'gemini-3.5-flash-lite' jika masih sering 503)
    const modelName = 'gemini-3.8-flash'; 

    // Fungsi untuk melakukan request ke Gemini
    const fetchGemini = async () => {
      return await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: modelName,
          messages: messages,
          stream: false,
        }),
      });
    };

    // Strategi Exponential Backoff (Coba ulang jika Error 503 atau 429)
    let response;
    let retries = 4; // Maksimal 4 kali percobaan
    let delay = 1000; // Jeda awal 1 detik

    for (let i = 0; i < retries; i++) {
      response = await fetchGemini();

      // Jika berhasil (200) atau error yang bukan karena server sibuk (misal 400/401), hentikan loop
      if (response.ok || (response.status !== 503 && response.status !== 429)) {
        break;
      }

      // Jika masih ada sisa percobaan, tunggu sebentar lalu coba lagi
      if (i < retries - 1) {
        console.log(`Server sibuk (Status: ${response.status}). Mencoba lagi dalam ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2; // Jeda menjadi 2 detik, 4 detik, 8 detik
      }
    }

    const data = await response.json().catch(() => ({}));

    // Jika setelah 4 kali percobaan masih gagal
    if (!response.ok) {
      if (response.status === 503) {
        return res.status(503).json({
          error: '⚠️ Server Gemini sedang kelebihan beban. Silakan coba lagi beberapa saat lagi.',
        });
      }
      if (response.status === 429) {
        return res.status(429).json({
          error: '⚠️ Kuota gratis Gemini sedang habis atau terlalu banyak permintaan.',
        });
      }
      
      return res.status(response.status).json({
        error: `⚠️ Gagal memproses (Kode: ${response.status}).`,
        details: data,
      });
    }

    return res.status(200).json(data);

  } catch (error) {
    return res.status(500).json({
      error: '⚠️ Terjadi kesalahan pada jaringan server.',
      details: error.message,
    });
  }
}
