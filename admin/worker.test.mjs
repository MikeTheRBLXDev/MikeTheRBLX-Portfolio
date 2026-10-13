import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { configuration, seal, unseal, requireCsrf, validateMetadata, validateUpload, youtubeId } from './worker.mjs';

// All credentials and GitHub responses below are synthetic. Tests never call GitHub.
const env = {
  GITHUB_CLIENT_ID: 'Iv1.testclient', GITHUB_CLIENT_SECRET: 'synthetic-test-secret-not-a-real-credential',
  SESSION_SECRET: Buffer.alloc(32, 17).toString('base64url'), OWNER_ID: '4141',
  REPO_OWNER: 'owner', REPO_NAME: 'portfolio', REPO_BRANCH: 'main', ADMIN_ORIGIN: 'https://studio.example.com',
  ASSETS: { fetch: async () => new Response('<html>Login shell</html>', { headers: { 'Content-Type': 'text/html' } }) }
};
const config = configuration(env);
const token = 'ghu_synthetic-owner-token';
const csrf = Buffer.alloc(32, 23).toString('base64url');
const currentTime = () => Math.floor(Date.now() / 1000);
const sha = character => character.repeat(40);
const responseJson = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const fileResponse = (value, version = sha('a')) => responseJson({ type: 'file', encoding: 'base64', sha: version, content: Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64') });
const blobResponse = text => responseJson({ encoding: 'base64', size: Buffer.byteLength(text), content: Buffer.from(text).toString('base64') });
const installation = { id: 9, account: { id: 4141 }, repository_selection: 'selected', permissions: { contents: 'write', metadata: 'read' }, suspended_at: null };
const repository = { id: 100, full_name: 'owner/portfolio', owner: { id: 4141 }, permissions: { push: true } };

async function sessionCookie(overrides = {}) {
  const timestamp = currentTime();
  const payload = { token, csrf, ownerId: config.ownerId, login: 'owner', binding: config.binding, iat: timestamp, exp: timestamp + 3600, ...overrides };
  return '__Host-studio_session=' + await seal(payload, env, 'session');
}
function request(path, method = 'GET', body, headers = {}) {
  return new Request(env.ADMIN_ORIGIN + path, { method, headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
}
async function authRequest(path, method = 'GET', body, headers = {}) {
  return request(path, method, body, { Cookie: await sessionCookie(), ...(method !== 'GET' ? { Origin: config.origin, 'X-CSRF-Token': csrf } : {}), ...headers });
}
async function withFetch(mock, action) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => { calls.push({ url: String(url), options }); return mock(String(url), options); };
  try { return await action(calls); } finally { globalThis.fetch = original; }
}
function githubMock(extra = () => { throw new Error('Unexpected mock request'); }, replacements = {}) {
  return async (url, options) => {
    const path = new URL(url).pathname;
    if (path === '/user') return responseJson(replacements.user || { id: 4141, login: 'owner' });
    if (path === '/user/installations') return responseJson(replacements.installations || { total_count: 1, installations: [installation] });
    if (path === '/user/installations/9/repositories') return responseJson(replacements.repositories || { total_count: 1, repositories: [repository] });
    return extra(url, options);
  };
}

test('configuration fails closed for each missing security setting', () => {
  assert.ok(config);
  for (const key of ['GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET', 'SESSION_SECRET', 'OWNER_ID', 'REPO_OWNER', 'REPO_NAME', 'REPO_BRANCH', 'ADMIN_ORIGIN']) assert.equal(configuration({ ...env, [key]: '' }), null, key);
});
test('configuration rejects HTTP, credentials, callback paths, unsafe refs and OAuth apps', () => {
  for (const origin of ['http://studio.example.com', 'https://studio.example.com/', 'https://studio.example.com/path', 'https://user:pass@studio.example.com']) assert.equal(configuration({ ...env, ADMIN_ORIGIN: origin }), null);
  for (const branch of ['../main', 'main?foo', '/main', 'main/', 'ref@{1}', 'main.lock']) assert.equal(configuration({ ...env, REPO_BRANCH: branch }), null);
  assert.equal(configuration({ ...env, OWNER_ID: 'owner' }), null);
  assert.equal(configuration({ ...env, OWNER_ID: '9007199254740992' }), null);
  assert.equal(configuration({ ...env, GITHUB_CLIENT_ID: 'oauth-app-id' }), null);
});
test('unconfigured deployment exposes only its disabled login shell', async () => {
  const disabled = { ...env, SESSION_SECRET: '' };
  const session = await worker.fetch(request('/api/session'), disabled);
  assert.deepEqual(await session.json(), { authenticated: false, configured: false, message: 'Private editing is disabled until the owner finishes the secure setup.' });
  assert.equal((await worker.fetch(request('/api/content'), disabled)).status, 503);
  assert.equal((await worker.fetch(request('/'), disabled)).status, 200);
});
test('anonymous API and protected asset requests never reach GitHub or asset storage', async () => {
  await withFetch(() => { throw new Error('Unauthorized outbound request'); }, async calls => {
    for (const [path, method] of [['/api/content', 'GET'], ['/api/metadata', 'PUT'], ['/api/upload', 'POST'], ['/api/video', 'POST'], ['/auth/logout', 'POST'], ['/private-project.json', 'GET']]) assert.equal((await worker.fetch(request(path, method), env)).status, 401, path);
    assert.equal(calls.length, 0);
  });
});
test('configured origin rejects requests arriving through another host', async () => {
  assert.equal((await worker.fetch(new Request('https://other.example.com/api/session'), env)).status, 403);
});
test('encrypted sessions reject tampering, expiry, changed secret and cross-purpose use', async () => {
  const timestamp = 123456;
  const value = await seal({ iat: timestamp, exp: timestamp + 3600, token: 'secret-token' }, env, 'session');
  assert.ok(!value.includes('secret-token'));
  assert.equal((await unseal(value, env, 'session', timestamp + 1)).token, 'secret-token');
  const parts = value.split('.');
  parts[2] = (parts[2][0] === 'A' ? 'B' : 'A') + parts[2].slice(1);
  assert.equal(await unseal(parts.join('.'), env, 'session', timestamp + 1), null);
  assert.equal(await unseal(value, env, 'session', timestamp + 3600), null);
  assert.equal(await unseal(value, { ...env, SESSION_SECRET: Buffer.alloc(32, 19).toString('base64url') }, 'session', timestamp + 1), null);
  assert.equal(await unseal(value, env, 'login', timestamp + 1), null);
  const extended = await seal({ iat: timestamp, exp: timestamp + 3601 }, env, 'session');
  assert.equal(await unseal(extended, env, 'session', timestamp + 1), null);
});
test('session is bound to owner, repository, client and exact origin', async () => {
  for (const overrides of [{ ownerId: 99 }, { binding: 'different-repository' }]) {
    const result = await worker.fetch(request('/api/session', 'GET', undefined, { Cookie: await sessionCookie(overrides) }), env);
    assert.equal((await result.json()).authenticated, false);
  }
});
test('login uses random encrypted state and S256 PKCE without broad OAuth scope', async () => {
  const result = await worker.fetch(request('/auth/login'), env);
  assert.equal(result.status, 302);
  const location = new URL(result.headers.get('Location'));
  assert.equal(location.origin, 'https://github.com');
  assert.equal(location.searchParams.get('redirect_uri'), config.callback);
  assert.equal(location.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(location.searchParams.has('scope'), false);
  const cookie = result.headers.get('Set-Cookie');
  assert.match(cookie, /^__Host-studio_login=/);
  assert.match(cookie, /HttpOnly; Secure; SameSite=Lax/);
  const pending = await unseal(cookie.split(';')[0].split('=')[1], env, 'login');
  assert.equal(pending.state, location.searchParams.get('state'));
  const expected = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pending.verifier))).toString('base64url');
  assert.equal(location.searchParams.get('code_challenge'), expected);
});
test('callback rejects missing/mismatched state without exchanging any code', async () => {
  const pending = await seal({ state: 'expected-state', verifier: csrf, binding: config.binding, iat: currentTime(), exp: currentTime() + 600 }, env, 'login');
  await withFetch(() => { throw new Error('State validation bypass'); }, async calls => {
    const result = await worker.fetch(request('/auth/callback?code=test-code&state=wrong-state', 'GET', undefined, { Cookie: '__Host-studio_login=' + pending }), env);
    assert.equal(result.status, 403);
    assert.match(result.headers.get('Set-Cookie'), /Max-Age=0/);
    assert.equal(calls.length, 0);
  });
});
test('callback refuses other GitHub accounts and revokes the rejected token', async () => {
  const pending = await seal({ state: csrf, verifier: csrf, binding: config.binding, iat: currentTime(), exp: currentTime() + 600 }, env, 'login');
  await withFetch(githubMock((url, options) => {
    if (url.endsWith('/login/oauth/access_token')) return responseJson({ access_token: token, expires_in: 28800 });
    if (url.endsWith('/applications/Iv1.testclient/token')) { assert.equal(options.method, 'DELETE'); return new Response(null, { status: 204 }); }
    throw new Error('Unexpected provider request');
  }, { user: { id: 99, login: 'intruder' } }), async calls => {
    const result = await worker.fetch(request(`/auth/callback?code=test-code&state=${csrf}`, 'GET', undefined, { Cookie: '__Host-studio_login=' + pending }), env);
    assert.equal(result.status, 403);
    assert.ok(calls.some(call => call.options?.method === 'DELETE'));
    assert.ok(!result.headers.get('Set-Cookie').includes('__Host-studio_session'));
  });
});
test('valid owner callback creates an encrypted one-hour session, never a browser access token', async () => {
  const pending = await seal({ state: csrf, verifier: csrf, binding: config.binding, iat: currentTime(), exp: currentTime() + 600 }, env, 'login');
  await withFetch(githubMock((url, options) => {
    assert.ok(url.endsWith('/login/oauth/access_token'));
    const body = JSON.parse(options.body);
    assert.equal(body.code_verifier, csrf);
    assert.equal(body.redirect_uri, config.callback);
    return responseJson({ access_token: token, expires_in: 28800, refresh_token: 'ghr_discarded-test-refresh' });
  }), async () => {
    const result = await worker.fetch(request(`/auth/callback?code=test-code&state=${csrf}`, 'GET', undefined, { Cookie: '__Host-studio_login=' + pending }), env);
    assert.equal(result.status, 302);
    assert.equal(result.headers.get('Location'), config.origin + '/');
    const cookies = result.headers.getSetCookie();
    const session = cookies.find(value => value.startsWith('__Host-studio_session='));
    assert.match(session, /Max-Age=3600; HttpOnly; Secure; SameSite=Lax/);
    assert.ok(!session.includes(token));
    const payload = await unseal(session.split(';')[0].split('=')[1], env, 'session');
    assert.equal(payload.ownerId, 4141);
    assert.equal(payload.token, token);
    assert.equal(payload.refresh_token, undefined);
  });
});
test('session endpoint rechecks live owner and returns only browser-safe session fields', async () => {
  await withFetch(githubMock(), async () => {
    const result = await worker.fetch(await authRequest('/api/session'), env);
    const data = await result.json();
    assert.deepEqual(data, { authenticated: true, configured: true, login: '/auth/login', user: { login: 'owner' }, csrf });
    assert.ok(!JSON.stringify(data).includes(token));
  });
});
test('live owner mismatch and revoked tokens invalidate stored sessions', async () => {
  await withFetch(githubMock(undefined, { user: { id: 99, login: 'intruder' } }), async () => {
    const result = await worker.fetch(await authRequest('/api/session'), env);
    assert.equal((await result.json()).authenticated, false);
    assert.match(result.headers.get('Set-Cookie'), /Max-Age=0/);
  });
  await withFetch(() => responseJson({ message: 'Bad credentials', token }, 401), async () => {
    assert.equal((await worker.fetch(await authRequest('/api/content'), env)).status, 401);
  });
});
test('all-repository, extra-permission, extra-installation and wrong-repo apps fail closed', async () => {
  const scenarios = [
    { installations: { total_count: 1, installations: [{ ...installation, repository_selection: 'all' }] } },
    { installations: { total_count: 1, installations: [{ ...installation, permissions: { ...installation.permissions, workflows: 'write' } }] } },
    { installations: { total_count: 2, installations: [installation, { ...installation, id: 10 }] } },
    { installations: { total_count: 1, installations: [{ ...installation, suspended_at: '2026-10-01' }] } },
    { repositories: { total_count: 2, repositories: [repository, { ...repository, id: 101 }] } },
    { repositories: { total_count: 1, repositories: [{ ...repository, full_name: 'owner/other-repository' }] } },
    { repositories: { total_count: 1, repositories: [{ ...repository, permissions: { push: false } }] } }
  ];
  for (const scenario of scenarios) await withFetch(githubMock(undefined, scenario), async () => assert.equal((await worker.fetch(await authRequest('/api/content'), env)).status, 403));
});
test('CSRF requires matching header, Origin and browser fetch site on every mutation', async () => {
  assert.doesNotThrow(() => requireCsrf(request('/api/metadata', 'PUT', {}, { Origin: config.origin, 'X-CSRF-Token': csrf, 'Sec-Fetch-Site': 'same-origin' }), config, { csrf }));
  await withFetch(() => { throw new Error('CSRF bypass'); }, async calls => {
    for (const headers of [{ Origin: 'https://evil.example' }, { 'X-CSRF-Token': 'wrong' }, { Origin: '' }, { 'Sec-Fetch-Site': 'cross-site' }]) {
      for (const [path, method] of [['/api/metadata', 'PUT'], ['/api/upload', 'POST'], ['/api/video', 'POST'], ['/auth/logout', 'POST']]) assert.equal((await worker.fetch(await authRequest(path, method, {}, headers), env)).status, 403, path);
    }
    assert.equal(calls.length, 0);
  });
});
test('metadata accepts exact project schema and rejects traversal, unsafe keys and malformed fields', () => {
  const valid = { 'ui:media:assets/UI/Inventory.png': { title: 'Inventory UI', description: 'A useful description.', featured: true, hidden: false, order: 0.5 }, 'scripting:youtube:Wy2rbplQK28': { featured: false } };
  assert.deepEqual(JSON.parse(JSON.stringify(validateMetadata(valid))), valid);
  for (const invalid of [[], null, { '__proto__': [] }, { 'ui:media:assets/Scripting/other.png': {} }, { 'ui:media:assets/UI/../index.html': {} }, { 'ui:youtube:bad-id': {} }, { 'other:media:assets/UI/a.png': {} }, { 'ui:media:assets/UI/a.png': { title: '' } }, { 'ui:media:assets/UI/a.png': { title: 'x'.repeat(201) } }, { 'ui:media:assets/UI/a.png': { description: 'x'.repeat(5001) } }, { 'ui:media:assets/UI/a.png': { hidden: 'false' } }, { 'ui:media:assets/UI/a.png': { order: NaN } }, { 'ui:media:assets/UI/a.png': { order: -1 } }, { 'ui:media:assets/UI/a.png': { html: '<script>' } }]) assert.throws(() => validateMetadata(invalid));
  assert.throws(() => validateMetadata(JSON.parse('{"__proto__":{"title":"bad"}}')));
});
test('uploads validate binary signatures and reject SVG, mismatches and path traversal', () => {
  const png = Buffer.from([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,1,0,0,0,1]);
  assert.equal(validateUpload('ui', 'Inventory.png', png.toString('base64')).path, 'assets/UI/Inventory.png');
  const jpg = Buffer.from([255,216,255,224]);
  assert.equal(validateUpload('scripting', 'Demo.jpg', jpg.toString('base64')).path, 'assets/Scripting/Demo.jpg');
  for (const name of ['../evil.png', 'folder/evil.png', 'evil\\image.png', 'evil.svg', 'evil.html', '..image.png', 'evil%2Fimage.png', '.image.png']) assert.throws(() => validateUpload('ui', name, png.toString('base64')), name);
  assert.throws(() => validateUpload('ui', 'image.jpg', png.toString('base64')));
  assert.throws(() => validateUpload('ui', 'image.png', Buffer.from('<html>Not an image</html>').toString('base64')));
  assert.throws(() => validateUpload('other', 'image.png', png.toString('base64')));
  assert.throws(() => validateUpload('ui', 'image.png', '%%%'));
  assert.throws(() => validateUpload('ui', 'image.png', Buffer.alloc(8 * 1024 * 1024 + 1).toString('base64')));
  const gif = Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(7)]);
  assert.equal(validateUpload('ui', 'image.gif', gif.toString('base64')).path, 'assets/UI/image.gif');
  const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8L')]);
  assert.equal(validateUpload('ui', 'image.webp', webp.toString('base64')).path, 'assets/UI/image.webp');
  const avif = Buffer.concat([Buffer.from([0,0,0,20]), Buffer.from('ftypmif1'), Buffer.alloc(4), Buffer.from('avif')]);
  assert.equal(validateUpload('ui', 'image.avif', avif.toString('base64')).path, 'assets/UI/image.avif');
});
test('YouTube input only accepts canonical hosts and a valid eleven-character ID', () => {
  for (const url of ['https://youtu.be/Wy2rbplQK28', 'https://www.youtube.com/watch?v=Wy2rbplQK28&feature=share', 'youtube.com/shorts/Wy2rbplQK28', 'https://www.youtube.com/embed/Wy2rbplQK28', 'https://m.youtube.com/live/Wy2rbplQK28']) assert.equal(youtubeId(url), 'Wy2rbplQK28');
  for (const url of ['https://youtube.com.evil.example/watch?v=Wy2rbplQK28', 'javascript:alert(1)', 'https://evil.example/Wy2rbplQK28', 'https://youtube.com/watch?v=invalid', 'https://u:p@youtube.com/watch?v=Wy2rbplQK28', 'https://youtube.com:8443/watch?v=Wy2rbplQK28']) assert.equal(youtubeId(url), null);
});
test('metadata stale SHA returns 409 without writing', async () => {
  await withFetch(githubMock(() => fileResponse({}, sha('b'))), async calls => {
    const result = await worker.fetch(await authRequest('/api/metadata', 'PUT', { sha: sha('a'), metadata: {} }), env);
    assert.equal(result.status, 409);
    assert.ok(!calls.some(call => call.options?.method === 'PUT'));
  });
});
test('metadata create/update always writes the fixed repo and branch with conditional SHA', async () => {
  await withFetch(githubMock((url, options) => {
    assert.equal(new URL(url).pathname, '/repos/owner/portfolio/contents/project-details.json');
    if (options.method === 'PUT') {
      const body = JSON.parse(options.body);
      assert.equal(body.sha, sha('a'));
      assert.equal(body.branch, 'main');
      assert.deepEqual(JSON.parse(Buffer.from(body.content, 'base64')), { 'ui:media:assets/UI/a.png': { title: 'Edited UI' } });
      return responseJson({ content: { sha: sha('b') } }, 200);
    }
    return fileResponse({}, sha('a'));
  }), async () => {
    const result = await worker.fetch(await authRequest('/api/metadata', 'PUT', { sha: sha('a'), metadata: { 'ui:media:assets/UI/a.png': { title: 'Edited UI' } } }), env);
    assert.equal(result.status, 200);
    assert.equal((await result.json()).sha, sha('b'));
  });
});
test('concurrent metadata create rejected by GitHub becomes a safe conflict', async () => {
  await withFetch(githubMock((url, options) => options.method === 'PUT' ? responseJson({ message: 'raw-provider-detail', access_token: token }, 422) : responseJson({}, 404)), async () => {
    const result = await worker.fetch(await authRequest('/api/metadata', 'PUT', { sha: null, metadata: {} }), env);
    assert.equal(result.status, 409);
    assert.ok(!(await result.text()).includes(token));
  });
});
test('video commits append canonical links and feature star with conditional SHA', async () => {
  await withFetch(githubMock((url, options) => {
    if (new URL(url).pathname.endsWith('/git/trees/main')) return responseJson({ tree:[], truncated:false });
    assert.equal(new URL(url).pathname, '/repos/owner/portfolio/contents/assets/UI/youtube.txt');
    if (options.method === 'PUT') {
      const body = JSON.parse(options.body);
      assert.equal(body.sha, sha('a'));
      assert.equal(body.branch, 'main');
      assert.equal(Buffer.from(body.content, 'base64').toString(), '# UI demos\n*Inventory animation | https://www.youtube.com/watch?v=Wy2rbplQK28\n');
      return responseJson({ content: { sha: sha('b') } }, 201);
    }
    return fileResponse('# UI demos', sha('a'));
  }), async () => {
    const result = await worker.fetch(await authRequest('/api/video', 'POST', { category: 'ui', url: 'https://youtu.be/Wy2rbplQK28?share=yes', title: 'Inventory animation', featured: true }), env);
    assert.equal(result.status, 201);
    assert.deepEqual(await result.json(), { id: 'Wy2rbplQK28', path: 'assets/UI/youtube.txt' });
  });
});
test('video duplicates in another category text file return a conflict without a commit', async () => {
  await withFetch(githubMock((url, options) => {
    const path = new URL(url).pathname;
    if (path.endsWith('/contents/assets/UI/youtube.txt')) return fileResponse('# Main UI demos', sha('a'));
    if (path.endsWith('/git/trees/main')) return responseJson({ tree: [
      { type:'blob', mode:'100644', path:'assets/UI/youtube.txt', sha:sha('a') },
      { type:'blob', mode:'100644', path:'assets/UI/custom.txt', sha:sha('b') },
      { type:'blob', mode:'100644', path:'assets/Scripting/other.txt', sha:sha('c') }
    ], truncated:false });
    if (path.endsWith('/git/blobs/' + sha('b'))) return blobResponse('Old UI title | https://youtu.be/Wy2rbplQK28');
    throw new Error('Unexpected duplicate-check request ' + path);
  }), async calls => {
    const result = await worker.fetch(await authRequest('/api/video', 'POST', { category:'ui', url:'https://youtu.be/Wy2rbplQK28', title:'New ignored title', featured:true }), env);
    assert.equal(result.status, 409);
    assert.match((await result.json()).error, /already in this collection/);
    assert.ok(!calls.some(call => call.options?.method === 'PUT'));
    assert.ok(!calls.some(call => call.url.endsWith('/git/blobs/' + sha('a'))));
    assert.ok(!calls.some(call => call.url.endsWith('/git/blobs/' + sha('c'))));
  });
});
test('metadata limits actual formatted UTF-8 file bytes before any repository write', async () => {
  const metadata = Object.fromEntries(Array.from({ length:1800 }, (_, index) => [`ui:media:assets/UI/image${index}.png`, { title:'Inventory', description:'x'.repeat(440), featured:false, hidden:false, order:index }]));
  assert.ok(Buffer.byteLength(JSON.stringify(metadata)) < 1024 * 1024);
  assert.ok(Buffer.byteLength(JSON.stringify(metadata, null, 2) + '\n') > 1024 * 1024);
  assert.throws(() => validateMetadata(metadata), /1 MB/);
  await withFetch(githubMock(), async calls => {
    const result = await worker.fetch(await authRequest('/api/metadata', 'PUT', { sha:null, metadata }), env);
    assert.equal(result.status, 400);
    assert.match((await result.json()).error, /1 MB/);
    assert.ok(!calls.some(call => call.options?.method === 'PUT'));
    assert.ok(!calls.some(call => call.url.includes('/contents/project-details.json')));
  });
});
test('upload never replaces an existing filename', async () => {
  await withFetch(githubMock(() => responseJson({ type: 'file' })), async calls => {
    const jpg = Buffer.from([255,216,255,224]).toString('base64');
    const result = await worker.fetch(await authRequest('/api/upload', 'POST', { category: 'ui', filename: 'existing.jpg', base64: jpg }), env);
    assert.equal(result.status, 409);
    assert.ok(!calls.some(call => call.options?.method === 'PUT'));
  });
});
test('content discovers new assets and text lists, overlays sidecars and metadata, and preserves hidden entries for editing', async () => {
  const metadata = { 'ui:media:assets/UI/B.png': { title: 'Metadata title', featured: true, order: 0 }, 'ui:youtube:Wy2rbplQK28': { featured: false, hidden: true } };
  const tree = [
    { type: 'blob', mode: '100644', path: 'assets/UI/A.png', sha: sha('1') },
    { type: 'blob', mode: '100644', path: 'assets/UI/A.png.json', sha: sha('2') },
    { type: 'blob', mode: '100644', path: 'assets/UI/B.png', sha: sha('3') },
    { type: 'blob', mode: '100644', path: 'assets/UI/youtube.txt', sha: sha('4') },
    { type: 'blob', mode: '120000', path: 'assets/UI/symlink.png', sha: sha('5') },
    { type: 'blob', mode: '100644', path: 'assets/UI/../unsafe.png', sha: sha('6') }
  ];
  await withFetch(githubMock(url => {
    const path = new URL(url).pathname;
    if (path.endsWith('/git/trees/main')) return responseJson({ tree, truncated: false });
    if (path.endsWith('/contents/portfolio.json')) return fileResponse({ ui: [{ type: 'media', path: 'assets/UI/A.png', title: 'Cached A' }] });
    if (path.endsWith('/contents/project-details.json')) return fileResponse(metadata, sha('b'));
    if (path.endsWith('/git/blobs/' + sha('2'))) return blobResponse(JSON.stringify({ description: 'Sidecar description', featured: true }));
    if (path.endsWith('/git/blobs/' + sha('4'))) return blobResponse('*UI motion | https://youtu.be/Wy2rbplQK28');
    throw new Error('Unexpected content URL ' + path);
  }), async () => {
    const result = await worker.fetch(await authRequest('/api/content'), env);
    assert.equal(result.status, 200);
    const data = await result.json();
    assert.equal(data.sha, sha('b'));
    assert.deepEqual(data.repository, { owner: 'owner', name: 'portfolio', branch: 'main' });
    assert.equal(data.projects.ui.length, 3);
    assert.equal(data.projects.ui[0].key, 'ui:media:assets/UI/B.png');
    assert.equal(data.projects.ui[0].title, 'Metadata title');
    assert.equal(data.projects.ui[0].featured, true);
    const a = data.projects.ui.find(item => item.path === 'assets/UI/A.png');
    assert.equal(a.description, 'Sidecar description');
    assert.equal(a.featured, false);
    assert.equal(a.previewUrl, 'https://raw.githubusercontent.com/owner/portfolio/main/assets/UI/A.png');
    const video = data.projects.ui.find(item => item.type === 'youtube');
    assert.equal(video.hidden, true);
    assert.equal(video.featured, false);
    assert.equal(video.previewUrl, 'https://i.ytimg.com/vi/Wy2rbplQK28/hqdefault.jpg');
  });
});
test('logout revokes the provider token and clears the Secure cookie', async () => {
  await withFetch((url, options) => {
    assert.equal(url, 'https://api.github.com/applications/Iv1.testclient/token');
    assert.equal(options.method, 'DELETE');
    assert.equal(JSON.parse(options.body).access_token, token);
    return new Response(null, { status: 204 });
  }, async () => {
    const result = await worker.fetch(await authRequest('/auth/logout', 'POST', {}), env);
    assert.deepEqual(await result.json(), { authenticated: false, revoked: true });
    assert.match(result.headers.get('Set-Cookie'), /Max-Age=0; HttpOnly; Secure/);
  });
});
test('hidden or explicitly unfeatured final star cannot displace an earlier visible star', async () => {
  const metadata = { 'ui:youtube:Wy2rbplQK28': { featured: false, hidden: true } };
  await withFetch(githubMock(url => {
    const path = new URL(url).pathname;
    if (path.endsWith('/git/trees/main')) return responseJson({ tree: [{ type:'blob', mode:'100644', path:'assets/UI/youtube.txt', sha:sha('4') }], truncated:false });
    if (path.endsWith('/contents/portfolio.json')) return fileResponse({});
    if (path.endsWith('/contents/project-details.json')) return fileResponse(metadata);
    if (path.endsWith('/git/blobs/' + sha('4'))) return blobResponse('*First | https://youtu.be/ibiyGn6kSrM\n*Second | https://youtu.be/Wy2rbplQK28');
    throw new Error('Unexpected content URL');
  }), async () => {
    const result = await worker.fetch(await authRequest('/api/content'), env);
    assert.equal(result.status, 200);
    const data = await result.json();
    assert.equal(data.projects.ui.find(item => item.featured).id, 'ibiyGn6kSrM');
  });
});
test('security headers apply to success and errors, without cross-origin API access', async () => {
  for (const path of ['/', '/api/content']) {
    const result = await worker.fetch(request(path), env);
    assert.equal(result.headers.get('Cache-Control'), 'no-store');
    assert.equal(result.headers.get('X-Frame-Options'), 'DENY');
    assert.equal(result.headers.get('X-Content-Type-Options'), 'nosniff');
    assert.equal(result.headers.get('Access-Control-Allow-Origin'), null);
    assert.match(result.headers.get('Content-Security-Policy'), /frame-ancestors 'none'/);
    assert.ok(!result.headers.get('Content-Security-Policy').includes('unsafe-inline'));
  }
});
