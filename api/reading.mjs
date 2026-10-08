import { getVercelOidcToken } from '@vercel/oidc';
import { createRequestHandler } from '../server/index.mjs';

export default createRequestHandler({
  routePath: '/api/reading',
  oidcTokenProvider: process.env.VERCEL === '1' && process.env.AI_GATEWAY_ENABLED === 'true' ? () => getVercelOidcToken() : undefined,
});
