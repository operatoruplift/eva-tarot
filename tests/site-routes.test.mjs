import test from 'node:test';
import assert from 'node:assert/strict';
import { siteSurface } from '../src/lib/site-routes.ts';

test('public pages and magic-link admin callbacks resolve without entering chat', () => {
  for (const [hash,path,view] of [['','/','landing'],['#how-it-works','/','landing'],['#welcome','/admin','landing'],['','/pricing','pricing'],['#pricing','/','pricing'],['#support','/','support'],['','/donate','support'],['#terms','/','terms'],['','/terms','terms'],['#admin','/','admin'],['','/admin','admin'],['#access_token=example','/admin','admin'],['#error=access_denied','/admin','admin']]) assert.equal(siteSurface(hash,path),view);
});
test('existing journal links, standalone entry and transfer screen remain in reader', () => {
  for (const [hash,path] of [['#chat','/'],['#reading/saved%2Fone','/'],['#calendar','/'],['#transfer/nonce','/'],['','/reading/cccafb19-74c0-4f1a-ab6a-f54f318561e2'],['','/chat']]) assert.equal(siteSurface(hash,path),'app');
});
