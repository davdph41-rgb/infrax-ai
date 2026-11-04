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

    // DAFTAR MODEL (Fallback)
    // Sistem akan mencoba dari atas ke bawah.
    const modelsToTry = [
      'gemini-3.5-flash',      // 1. Model Utama (Paling pintar)
      'gemini-3.5-flash-lite'  // 2. Model Cadangan (Lebih ringan, kuota lebih longgar)
    ];

    let isSuccess = false;
    let finalData = null;
    let lastStatus = 500;

    // Looping melalui daftar model
    for (const currentModel of modelsToTry) {
      console.log(`[AI] Mencoba model: ${currentModel}`);
      
      let response;
      let retries = 3; // Coba 3 kali per model sebelum pindah ke model cadangan
      let delay = 1000; // Jeda awal 1 detik

      for (let i = 0; i < retries; i++) {
        try {
          response = await fetch(endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model: currentModel,
              messages: messages,
              stream: false,
            }),
          });

          finalData = await response.json().catch(() => ({}));
          lastStatus = response.status;

          // Jika berhasil (200 OK)
          if (response.ok) {
            isSuccess = true;
            console.log(`[AI] Sukses menggunakan model: ${currentModel}`);
            break; // Keluar dari loop retry
          }

          // Jika Error 503 (Server sibuk) atau 429 (Rate limit)
          if (response.status === 503 || response.status === 429) {
            if (i < retries - 1) {
              console.log(`[AI] ${currentModel} sibuk (${response.status}). Retry dalam ${delay}ms...`);
              await new Promise(resolve => setTimeout(resolve, delay));
              delay *= 2; // Jeda 1s -> 2s -> 4s
            }
          } else {
            // Jika error lain (misal format salah, API key salah), jangan retry, langsung ganti model
            break; 
          }
        } catch (err) {
          console.error(`[AI] Network error pada ${currentModel}:`, err.message);
          lastStatus = 500;
          break; // Gagal koneksi, coba model berikutnya
        }
      }

      // Jika model ini berhasil, hentikan pencarian model
      if (isSuccess) break;
      
      console.log(`[AI] Gagal menggunakan ${currentModel}, beralih ke model cadangan...`);
    }

    // Jika semua model di daftar sudah dicoba dan tetap gagal
    if (!isSuccess) {
      if (lastStatus === 503) {
        return res.status(503).json({
          error: '⚠️ Semua server Gemini sedang kelebihan beban. Silakan coba lagi nanti.',
        });
      }
      if (lastStatus === 429) {
        return res.status(429).json({
          error: '⚠️ Kuota gratis semua model Gemini sedang habis. Coba lagi besok atau buat API Key baru.',
        });
      }
      
      return res.status(lastStatus).json({
        error: `⚠️ Gagal memproses (Kode: ${lastStatus}).`,
        details: finalData,
      });
    }

    // Jika berhasil, kirim data ke frontend
    return res.status(200).json(finalData);

  } catch (error) {
    return res.status(500).json({
      error: '⚠️ Terjadi kesalahan pada server.',
      details: error.message,
    });
  }
}
