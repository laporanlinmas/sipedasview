import type { IncomingMessage, ServerResponse } from 'node:http';

const BASE = process.env.API_BASE_URL || 'https://nawasara.ponorogo.go.id';
const TOKEN = process.env.API_TOKEN;
const ORIGIN = process.env.API_ORIGIN || 'https://gasta.ponorogo.go.id';

function setCors(res: ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  setCors(res);

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Method Not Allowed' }));
    return;
  }

  try {
    const headers: Record<string, string> = {
      Origin: ORIGIN,
      'User-Agent': 'sipedas-view-proxy/1.0',
      Accept: 'application/json',
    };
    if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`;

    const upstreamRes = await fetch(`${BASE}/api/v1/cctv/cameras`, {
      headers,
      signal: AbortSignal.timeout(10000),
    });

    const body = await upstreamRes.text();
    const ct = upstreamRes.headers.get('content-type');
    if (ct) {
      res.setHeader('Content-Type', ct.split(';')[0]);
    }
    res.statusCode = upstreamRes.status;
    res.end(body);
  } catch (e) {
    res.statusCode = 502;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: `Upstream error: ${(e as Error).message}` }));
  }
}
