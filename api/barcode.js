// Vercel serverless function: GET /api/barcode?code=<digits>
// Looks up a packaged food by barcode via Open Food Facts (free, no API key needed).
// Runs server-side so the browser never calls a third-party API directly (avoids CORS risk
// and keeps the same secure-proxy pattern as api/scan.js).

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Use GET' });

  const raw = (req.query && req.query.code) || '';
  const code = String(raw).replace(/\D/g, '');
  if (!code || code.length < 6) {
    return res.status(400).json({ error: 'Enter a valid barcode number' });
  }

  try {
    const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json`, {
      headers: { 'User-Agent': 'BulkTrackerPro/1.0 (+https://bulking-tracker-pro.vercel.app)' },
    });
    if (!r.ok) {
      return res.status(502).json({ error: 'Lookup service error (' + r.status + ')' });
    }
    const data = await r.json();
    if (!data || data.status !== 1 || !data.product) {
      return res.status(200).json({ found: false });
    }

    const p = data.product;
    const n = p.nutriments || {};
    const per100 = {
      kcal: num(n['energy-kcal_100g']),
      protein: num(n['proteins_100g']),
      carbs: num(n['carbohydrates_100g']),
      fat: num(n['fat_100g']),
    };
    const hasServing = n['energy-kcal_serving'] != null;
    const servingLabel = p.serving_size || (hasServing ? 'serving' : '100g');
    const vals = hasServing
      ? {
          kcal: num(n['energy-kcal_serving']),
          protein: num(n['proteins_serving']),
          carbs: num(n['carbohydrates_serving']),
          fat: num(n['fat_serving']),
        }
      : per100;

    return res.status(200).json({
      found: true,
      name: String(p.product_name || p.generic_name || 'Packaged food').slice(0, 80),
      serving: String(servingLabel).slice(0, 60),
      kcal: vals.kcal,
      protein: vals.protein,
      carbs: vals.carbs,
      fat: vals.fat,
      confidence: 'high',
    });
  } catch (e) {
    return res.status(502).json({ error: 'Lookup failed: ' + (e && e.message ? e.message : 'unknown error') });
  }
};

function num(v) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}
