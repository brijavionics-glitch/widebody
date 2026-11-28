// Only allow visitors from these countries. Everyone else sees "Not available in your country".
// Country comes from Cloudflare (from the visitor's internet address). Codes: IN India, SG Singapore,
// TH Thailand, LK Sri Lanka, VN Vietnam.
const ALLOWED = new Set(["IN", "SG", "TH", "LK", "VN"]);

const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Not available</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
background:#0a0f1a;color:#e5e9f0;font-family:-apple-system,Arial,sans-serif;text-align:center;padding:24px}
h1{font-size:22px;margin:0 0 8px}p{color:#9aa7bd;margin:0}</style></head>
<body><div><h1>Not available in your country</h1><p>This app can only be used in India, Singapore, Thailand, Sri Lanka and Vietnam.</p></div></body></html>`;

export async function onRequest(context) {
  const country = String((context.request.cf && context.request.cf.country) || "").toUpperCase();
  if (!country || ALLOWED.has(country)) return context.next();   // no country info (rare) = allow
  return new Response(PAGE, {
    status: 403,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}
