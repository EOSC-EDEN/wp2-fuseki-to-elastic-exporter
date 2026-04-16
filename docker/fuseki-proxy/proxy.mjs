import http from 'node:http';
import { createClient } from 'redis';

const FUSEKI_HOST = process.env.FUSEKI_BACKEND_HOST || 'fuseki-backend';
const FUSEKI_PORT = parseInt(process.env.FUSEKI_BACKEND_PORT || '3030', 10);
const PROXY_PORT = parseInt(process.env.PROXY_PORT || '3030', 10);
const REDIS_URL = process.env.REDIS_URL || 'redis://redis:6379';
const CHANNEL = process.env.REDIS_CHANNEL || 'fuseki:graph-changed';

const WRITE_METHODS = new Set(['PUT', 'POST', 'DELETE', 'PATCH']);
const GRAPH_PARAM_RE = /[?&]graph=([^&]+)/;
const HARMONIZED_RE = /\/harmonized\//;

let redis;

async function connectRedis() {
  redis = createClient({ url: REDIS_URL });
  redis.on('error', (err) => console.error('[proxy] Redis error:', err));
  await redis.connect();
  console.log(`[proxy] Connected to Redis at ${REDIS_URL}`);
}

function extractGraphUri(url) {
  const match = url.match(GRAPH_PARAM_RE);
  if (!match) return null;
  return decodeURIComponent(match[1]);
}

function isWriteToGraphStore(method, url) {
  if (!WRITE_METHODS.has(method)) return false;
  // Graph Store Protocol endpoints: /dataset/data or /dataset/data?graph=...
  return /\/\w+\/data/.test(url);
}

const server = http.createServer((clientReq, clientRes) => {
  const { method, url, headers } = clientReq;
  const graphUri = extractGraphUri(url);
  const isWrite = isWriteToGraphStore(method, url);

  const proxyReq = http.request(
    {
      hostname: FUSEKI_HOST,
      port: FUSEKI_PORT,
      path: url,
      method,
      headers,
    },
    (proxyRes) => {
      clientRes.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(clientRes, { end: true });

      // After successful write to a harmonized graph, publish event
      if (
        isWrite &&
        proxyRes.statusCode >= 200 &&
        proxyRes.statusCode < 300
      ) {
        const eventGraphUri = graphUri || `unknown:${url}`;

        if (method === 'DELETE' || HARMONIZED_RE.test(eventGraphUri)) {
          const event = JSON.stringify({
            graphUri: eventGraphUri,
            method,
            timestamp: new Date().toISOString(),
          });

          redis.publish(CHANNEL, event).catch((err) => {
            console.error('[proxy] Failed to publish event:', err);
          });

          console.log(`[proxy] ${method} ${eventGraphUri} -> published event`);
        }
      }
    },
  );

  proxyReq.on('error', (err) => {
    console.error('[proxy] Upstream error:', err.message);
    clientRes.writeHead(502);
    clientRes.end('Bad Gateway');
  });

  clientReq.pipe(proxyReq, { end: true });
});

connectRedis()
  .then(() => {
    server.listen(PROXY_PORT, () => {
      console.log(
        `[proxy] Fuseki GSP proxy listening on :${PROXY_PORT}, forwarding to ${FUSEKI_HOST}:${FUSEKI_PORT}`,
      );
    });
  })
  .catch((err) => {
    console.error('[proxy] Failed to start:', err);
    process.exit(1);
  });
