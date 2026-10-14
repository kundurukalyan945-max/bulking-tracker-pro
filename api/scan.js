// Vercel serverless function: POST /api/scan
// Keeps your Anthropic API key on the server so it never reaches the browser.
// Env vars (set in Vercel dashboard):
//   ANTHROPIC_API_KEY  (required)  from console.anthropic.com
//   CLAUDE_MODEL       (optional)  defaults to claude-sonnet-5-5
//   ALLOWED_ORIGIN     (optional)  e.g. https://your-app.vercel.app  (defaults to *)

const SYSTEM = `You are a nutrition analyst. The user sends a photo of food.
Identify every distinct food or drink item visible and estimate nutrition for the portion shown.
Prefer Indian foods and portions when the dish looks Indian (dal, roti, sabzi, idli, dosa, biryani, paneer, etc.).
Reply with ONLY valid JSON, no markdown, no commentary, in exactly this shape:
{"foods":[{"name":"Food name","serving":"portion description e.g. 1 cup / 2 rotis / 150g","kcal":0,"protein":0,"carbs":0,"fat":0,"confidence":"high|medium|low"}]}
All numbers are plain numbers (grams for macros). If no food is visible, reply {"foods":[]}.`;

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(500).json({ error: 'Server is missing ANTHROPIC_API_KEY' });

  const body = typeof req.body === 'string' ? safeParse(req.body) : req.body || {};
  const image = body.image;
  const mediaType = ['image/jpeg', 'image/png', 'image/webp'].includes(body.mediaType) ? body.mediaType : 'image/jpeg';
  if (!image || typeof image !== 'string') return res.status(400).json({ error: 'No image sent' });
  if (image.length > 3500000) return res.status(413).json({ error: 'Image too large. Try again.' });

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.CLAUDE_MODEL || 'claude-sonnet-5-5',
        max_tokens: 900,
        system: SYSTEM,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } },
              { type: 'text', text: 'Analyze this meal and return the JSON.' },
            ],
          },
        ],
      }),
    });

    const data = await r.json();
    if (!r.ok) {
      const msg = (data && data.error && data.error.message) || 'Claude API error';
      return res.status(r.status === 401 ? 500 : 502).json({ error: msg });
    }

    const text = (data.content || []).map((c) => c.text || '').join('');
    const parsed = extractJson(text);
    const foods = (parsed && Array.isArray(parsed.foods) ? parsed.foods : []).map((f) => ({
      name: String(f.name || 'Food').slice(0, 80),
      serving: String(f.serving || '').slice(0, 60),
      kcal: num(f.kcal),
      protein: num(f.protein),
      carbs: num(f.carbs),
      fat: num(f.fat),
      confidence: ['high', 'medium', 'low'].includes(f.confidence) ? f.confidence : 'medium',
    }));
    return res.status(200).json({ foods });
  } catch (e) {
    return res.status(500).json({ error: 'Scan failed: ' + (e && e.message ? e.message : 'unknown error') });
  }
};

function num(v) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}
function safeParse(s) {
  try { return JSON.parse(s); } catch (e) { return {}; }
}
function extractJson(t) {
  const a = t.indexOf('{');
  const b = t.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(t.slice(a, b + 1)); } catch (e) { return null; }
}
