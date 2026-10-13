// No client-side password, GitHub token, or repository secret is shipped to visitors.
// Cloudflare runs this Worker BEFORE static assets (see wrangler.jsonc).
const SESSION_COOKIE = '__Host-studio_session';
const LOGIN_COOKIE = '__Host-studio_login';
const SESSION_TTL = 3600;
const LOGIN_TTL = 600;
const MAX_IMAGE = 8 * 1024 * 1024;
const MAX_BODY = Math.ceil(MAX_IMAGE / 3) * 4 + 4096;
const MAX_METADATA = 1024 * 1024;
const METADATA_FILE = 'project-details.json';
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const SHA = /^[a-f0-9]{40,64}$/;
const MEDIA_EXTENSIONS = /\.(png|jpe?g|gif|webp|avif|svg|mp4|webm|ogg|mov|m4v)$/i;
const FOLDERS = { ui: 'UI', scripting: 'Scripting' };
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const fail = (status, message) => { throw new HttpError(status, message); };
const now = () => Math.floor(Date.now() / 1000);
const plainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const json = (value, status = 200, headers = {}) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers } });

function bytesToBase64(bytes) {
  let result = '';
  for (let i = 0; i < bytes.length; i += 32768) result += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(result);
}
function base64ToBytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
const base64url = bytes => bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
function fromBase64url(value) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Invalid encoding');
  const bytes = base64ToBytes(value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4));
  if (base64url(bytes) !== value) throw new Error('Invalid encoding');
  return bytes;
}
const randomString = () => base64url(crypto.getRandomValues(new Uint8Array(32)));

export function configuration(env) {
  try {
    if (!/^Iv\d+\.[A-Za-z0-9]+$/.test(env.GITHUB_CLIENT_ID || '')) return null;
    if (!/^[1-9]\d{0,15}$/.test(env.OWNER_ID || '') || !Number.isSafeInteger(Number(env.OWNER_ID))) return null;
    if (!/^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/.test(env.REPO_OWNER || '')) return null;
    if (!/^[A-Za-z0-9._-]{1,100}$/.test(env.REPO_NAME || '') || ['.', '..'].includes(env.REPO_NAME)) return null;
    if (!env.REPO_BRANCH || env.REPO_BRANCH.length > 200 || /[\s~^:?*\[\\\x00-\x1f]/.test(env.REPO_BRANCH) || env.REPO_BRANCH.includes('..') || env.REPO_BRANCH.includes('@{') || env.REPO_BRANCH.startsWith('/') || env.REPO_BRANCH.endsWith('/') || env.REPO_BRANCH.endsWith('.lock')) return null;
    if (!env.GITHUB_CLIENT_SECRET || env.GITHUB_CLIENT_SECRET.length < 20) return null;
    if (!/^[A-Za-z0-9_-]{43}$/.test(env.SESSION_SECRET || '') || fromBase64url(env.SESSION_SECRET).length !== 32) return null;
    const url = new URL(env.ADMIN_ORIGIN);
    if (url.protocol !== 'https:' || url.origin !== env.ADMIN_ORIGIN || url.username || url.password) return null;
    return {
      clientId: env.GITHUB_CLIENT_ID, ownerId: Number(env.OWNER_ID),
      owner: env.REPO_OWNER, repo: env.REPO_NAME, branch: env.REPO_BRANCH,
      origin: env.ADMIN_ORIGIN, callback: env.ADMIN_ORIGIN + '/auth/callback',
      binding: `${env.OWNER_ID}:${env.REPO_OWNER}/${env.REPO_NAME}:${env.REPO_BRANCH}:${env.ADMIN_ORIGIN}:${env.GITHUB_CLIENT_ID}`
    };
  } catch { return null; }
}

async function encryptionKey(env) {
  return crypto.subtle.importKey('raw', fromBase64url(env.SESSION_SECRET), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}
export async function seal(value, env, purpose) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode(`studio:${purpose}:v1`) }, await encryptionKey(env), encoder.encode(JSON.stringify(value)));
  return `v1.${base64url(iv)}.${base64url(new Uint8Array(ciphertext))}`;
}
export async function unseal(value, env, purpose, timestamp = now()) {
  try {
    if (typeof value !== 'string' || value.length > 3800) return null;
    const parts = value.split('.');
    if (parts.length !== 3 || parts[0] !== 'v1') return null;
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64url(parts[1]), additionalData: encoder.encode(`studio:${purpose}:v1`) }, await encryptionKey(env), fromBase64url(parts[2]));
    const payload = JSON.parse(decoder.decode(decrypted));
    const ttl = purpose === 'session' ? SESSION_TTL : LOGIN_TTL;
    if (!plainObject(payload) || !Number.isInteger(payload.iat) || !Number.isInteger(payload.exp) || payload.iat > timestamp + 30 || payload.exp <= timestamp || payload.exp > payload.iat + ttl) return null;
    return payload;
  } catch { return null; }
}
function cookie(name, value, ttl) { return `${name}=${value}; Path=/; Max-Age=${ttl}; HttpOnly; Secure; SameSite=Lax`; }
function getCookie(request, name) {
  const matches = (request.headers.get('Cookie') || '').split(';').map(part => part.trim()).filter(part => part.startsWith(name + '='));
  return matches.length === 1 ? matches[0].slice(name.length + 1) : '';
}
function equalSecret(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length || a.length > 256) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}
export function requireCsrf(request, config, session) {
  if (request.headers.get('Origin') !== config.origin || !equalSecret(request.headers.get('X-CSRF-Token'), session.csrf)) fail(403, 'This request could not be verified. Reload the dashboard and try again.');
  const site = request.headers.get('Sec-Fetch-Site');
  if (site && site !== 'same-origin') fail(403, 'Cross-site requests are blocked.');
}

async function github(token, path, options = {}) {
  const headers = {
    Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`,
    'User-Agent': 'MikeTheRBLX-Private-Studio', 'X-GitHub-Api-Version': '2022-11-28',
    ...options.headers
  };
  const response = await fetch('https://api.github.com' + path, { ...options, headers, redirect: 'error' });
  if (response.status === 401) fail(401, 'Your session has ended. Sign in again.');
  if (response.status === 403) fail(403, 'GitHub denied access. Check the app permissions or try again later.');
  if (response.status === 409 || response.status === 422) fail(409, 'The repository changed or rejected this edit. Reload before saving again.');
  if (!response.ok) fail(502, 'GitHub could not complete this request. Try again shortly.');
  return response;
}
const repoPath = config => `/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}`;

// Check live GitHub permissions for API requests: a revoked cookie cannot keep editing.
// Require one installation, selected repositories, contents write and ONLY this repository.
async function verifyOwnerAndRepository(token, config) {
  const user = await (await github(token, '/user')).json();
  if (user.id !== config.ownerId) fail(403, 'This dashboard is restricted to its owner.');
  const installations = await (await github(token, '/user/installations?per_page=100')).json();
  if (installations.total_count !== 1 || installations.installations?.length !== 1) fail(403, 'Install the private GitHub App on only the portfolio account.');
  const installation = installations.installations[0];
  const permitted = installation.permissions || {};
  if (installation.account?.id !== config.ownerId || installation.repository_selection !== 'selected' || installation.suspended_at || permitted.contents !== 'write' || Object.entries(permitted).some(([name, level]) => !['contents', 'metadata'].includes(name) && level !== 'none')) fail(403, 'Use a private GitHub App with only selected repository contents permission.');
  const repositories = await (await github(token, `/user/installations/${installation.id}/repositories?per_page=100`)).json();
  const repository = repositories.repositories?.[0];
  if (repositories.total_count !== 1 || repositories.repositories?.length !== 1 || repository.full_name?.toLowerCase() !== `${config.owner}/${config.repo}`.toLowerCase() || repository.owner?.id !== config.ownerId || !repository.permissions?.push) fail(403, 'The app must have write access to only the configured portfolio repository.');
  return { login: typeof user.login === 'string' ? user.login : config.owner, repositoryId: repository.id };
}
async function sessionFor(request, env, config) {
  const session = await unseal(getCookie(request, SESSION_COOKIE), env, 'session');
  if (!session || session.ownerId !== config.ownerId || session.binding !== config.binding || typeof session.token !== 'string' || !session.token.startsWith('ghu_') || !/^[A-Za-z0-9_-]{43}$/.test(session.csrf || '')) return null;
  return session;
}
async function authenticated(request, env, config) {
  const session = await sessionFor(request, env, config);
  if (!session) fail(401, 'Sign in to your private dashboard.');
  await verifyOwnerAndRepository(session.token, config);
  return session;
}
async function revokeToken(token, env, config) {
  const response = await fetch(`https://api.github.com/applications/${encodeURIComponent(config.clientId)}/token`, {
    method: 'DELETE', redirect: 'error',
    headers: { Authorization: `Basic ${btoa(config.clientId + ':' + env.GITHUB_CLIENT_SECRET)}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'User-Agent': 'MikeTheRBLX-Private-Studio', 'X-GitHub-Api-Version': '2022-11-28' },
    body: JSON.stringify({ access_token: token })
  });
  return response.ok || response.status === 404;
}
async function login(request, env, config) {
  const state = randomString();
  const verifier = randomString();
  const challenge = base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(verifier))));
  const timestamp = now();
  const payload = await seal({ state, verifier, binding: config.binding, iat: timestamp, exp: timestamp + LOGIN_TTL }, env, 'login');
  const url = new URL('https://github.com/login/oauth/authorize');
  url.search = new URLSearchParams({ client_id: config.clientId, redirect_uri: config.callback, state, code_challenge: challenge, code_challenge_method: 'S256' }).toString();
  return new Response(null, { status: 302, headers: { Location: url.toString(), 'Set-Cookie': cookie(LOGIN_COOKIE, payload, LOGIN_TTL) } });
}
async function callback(request, env, config) {
  const url = new URL(request.url);
  const state = url.searchParams.get('state');
  const code = url.searchParams.get('code');
  const pending = await unseal(getCookie(request, LOGIN_COOKIE), env, 'login');
  if (!pending || pending.binding !== config.binding || !equalSecret(state, pending.state) || !code || code.length > 256 || !/^[A-Za-z0-9_-]+$/.test(code)) fail(403, 'The sign-in request expired or could not be verified. Start again.');
  const response = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST', redirect: 'error',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'MikeTheRBLX-Private-Studio' },
    body: JSON.stringify({ client_id: config.clientId, client_secret: env.GITHUB_CLIENT_SECRET, code, redirect_uri: config.callback, code_verifier: pending.verifier })
  });
  if (!response.ok) fail(502, 'GitHub sign-in is temporarily unavailable.');
  const token = await response.json();
  if (typeof token.access_token !== 'string' || !token.access_token.startsWith('ghu_') || token.access_token.length > 1024 || !Number.isFinite(token.expires_in) || token.expires_in < SESSION_TTL) fail(403, 'Use a GitHub App with expiring user access tokens enabled.');
  let owner;
  try { owner = await verifyOwnerAndRepository(token.access_token, config); }
  catch (error) {
    try { await revokeToken(token.access_token, env, config); } catch { /* Do not expose provider details. */ }
    throw error;
  }
  // Refresh tokens are intentionally discarded; a fresh sign-in is required every hour.
  const timestamp = now();
  const session = await seal({ token: token.access_token, csrf: randomString(), ownerId: config.ownerId, login: owner.login, binding: config.binding, iat: timestamp, exp: timestamp + SESSION_TTL }, env, 'session');
  const headers = new Headers({ Location: config.origin + '/' });
  headers.append('Set-Cookie', cookie(LOGIN_COOKIE, '', 0));
  headers.append('Set-Cookie', cookie(SESSION_COOKIE, session, SESSION_TTL));
  return new Response(null, { status: 302, headers });
}

function validMediaPath(path, category) {
  if (typeof path !== 'string' || path.length > 500 || /[\\\x00-\x1f\x7f]/.test(path)) return false;
  const segments = path.split('/');
  if (segments.some(segment => !segment || segment === '.' || segment === '..')) return false;
  return path.startsWith(`assets/${FOLDERS[category]}/`) && MEDIA_EXTENSIONS.test(path);
}
export function validateFields(value) {
  if (!plainObject(value)) fail(400, 'Project details must be an object.');
  const allowed = ['title', 'description', 'featured', 'hidden', 'order'];
  if (Object.keys(value).some(key => !allowed.includes(key))) fail(400, 'Project details contain an unsupported field.');
  if ('title' in value && (typeof value.title !== 'string' || !value.title.trim() || value.title.length > 200 || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value.title))) fail(400, 'Titles must contain 1–200 characters.');
  if ('description' in value && (typeof value.description !== 'string' || value.description.length > 5000 || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value.description))) fail(400, 'Descriptions must contain at most 5,000 characters.');
  for (const field of ['featured', 'hidden']) if (field in value && typeof value[field] !== 'boolean') fail(400, 'Featured and hidden values must be true or false.');
  if ('order' in value && (typeof value.order !== 'number' || !Number.isFinite(value.order) || value.order < 0 || value.order > 1000000)) fail(400, 'Project order must be a number from 0 to 1,000,000.');
  return Object.fromEntries(Object.entries(value));
}
export function validateMetadata(value) {
  if (!plainObject(value) || Object.keys(value).length > 2000) fail(400, 'Metadata must be an object with at most 2,000 projects.');
  const result = Object.create(null);
  for (const [key, details] of Object.entries(value)) {
    const match = /^(ui|scripting):(youtube|media):(.+)$/.exec(key);
    if (!match || (match[2] === 'youtube' ? !VIDEO_ID.test(match[3]) : !validMediaPath(match[3], match[1]))) fail(400, 'A project identity is invalid.');
    result[key] = validateFields(details);
  }
  if (encoder.encode(serializeMetadata(result)).length > MAX_METADATA) fail(400, 'Project details exceed the 1 MB limit.');
  return result;
}
const serializeMetadata = value => JSON.stringify(value, null, 2) + '\n';
export function youtubeId(input) {
  try {
    if (typeof input !== 'string' || input.length > 2048) return null;
    const url = new URL(input.includes('://') ? input : 'https://' + input);
    if (url.protocol !== 'https:' && url.protocol !== 'http:' || url.username || url.password || url.port) return null;
    const segments = url.pathname.split('/').filter(Boolean);
    let id;
    if (url.hostname === 'youtu.be') id = segments[0];
    else if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com'].includes(url.hostname)) id = segments[0] === 'watch' ? url.searchParams.get('v') : ['shorts', 'embed', 'live'].includes(segments[0]) ? segments[1] : '';
    return VIDEO_ID.test(id || '') ? id : null;
  } catch { return null; }
}
export function validateUpload(category, filename, base64) {
  if (!Object.hasOwn(FOLDERS, category)) fail(400, 'Choose UI or scripting.');
  if (typeof filename !== 'string' || filename.length > 120 || !/^[A-Za-z0-9][A-Za-z0-9._ -]*\.(png|jpe?g|webp|gif|avif)$/i.test(filename) || filename.includes('..')) fail(400, 'Use a plain image filename ending in PNG, JPG, WebP, GIF or AVIF.');
  if (typeof base64 !== 'string' || base64.length > Math.ceil(MAX_IMAGE / 3) * 4 || base64.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(base64)) fail(400, 'Upload a valid image up to 8 MB.');
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  const decodedLength = base64.length / 4 * 3 - padding;
  if (decodedLength <= 0 || decodedLength > MAX_IMAGE || base64.indexOf('=') !== -1 && base64.indexOf('=') !== base64.length - padding) fail(400, 'Upload an image up to 8 MB.');
  let bytes;
  try {
    // Inspect a bounded signature prefix. This avoids decoding/re-encoding 8 MB
    // just to check its format, while validating all base64 characters above.
    if (btoa(atob(base64.slice(-4))) !== base64.slice(-4)) fail(400, 'The image encoding is invalid.');
    bytes = base64ToBytes(base64.slice(0, 344));
  } catch { fail(400, 'The image encoding is invalid.'); }
  const ext = filename.split('.').pop().toLowerCase();
  const starts = expected => expected.every((byte, index) => bytes[index] === byte);
  const ascii = (start, end) => String.fromCharCode(...bytes.subarray(start, end));
  let valid = false;
  if (ext === 'png') valid = bytes.length >= 24 && starts([137, 80, 78, 71, 13, 10, 26, 10]) && ascii(12, 16) === 'IHDR';
  if (ext === 'jpg' || ext === 'jpeg') valid = bytes.length >= 4 && starts([255, 216, 255]);
  if (ext === 'gif') valid = bytes.length >= 13 && ['GIF87a', 'GIF89a'].includes(ascii(0, 6));
  if (ext === 'webp') valid = bytes.length >= 16 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP' && ['VP8 ', 'VP8L', 'VP8X'].includes(ascii(12, 16));
  if (ext === 'avif') {
    const size = bytes.length >= 16 ? new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0) : 0;
    valid = size >= 16 && size <= Math.min(bytes.length, 256) && ascii(4, 8) === 'ftyp' && [ascii(8, 12), ...Array.from({ length: Math.floor((size - 16) / 4) }, (_, i) => ascii(16 + i * 4, 20 + i * 4))].some(brand => ['avif', 'avis'].includes(brand));
  }
  if (!valid) fail(400, 'The file content does not match its image extension.');
  return { path: `assets/${FOLDERS[category]}/${filename}`, base64 };
}

async function bodyJson(request, limit = 1024 * 1024 + 4096) {
  if (request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json') fail(415, 'Send application/json.');
  const length = request.headers.get('Content-Length');
  if (length && (!/^\d+$/.test(length) || Number(length) > limit)) fail(413, 'The request is too large.');
  if (!request.body) fail(400, 'A JSON request body is required.');
  const reader = request.body.getReader();
  let total = 0;
  const chunks = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > limit) { await reader.cancel(); fail(413, 'The request is too large.'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try {
    const data = JSON.parse(decoder.decode(bytes));
    if (!plainObject(data)) fail(400, 'The request body must be a JSON object.');
    return data;
  } catch (error) { if (error instanceof HttpError) throw error; fail(400, 'The JSON request is invalid.'); }
}
function assertKeys(body, allowed) { if (Object.keys(body).some(key => !allowed.includes(key))) fail(400, 'The request contains an unsupported field.'); }
const encodePath = path => path.split('/').map(encodeURIComponent).join('/');
async function readFile(token, config, path) {
  const response = await fetch(`https://api.github.com${repoPath(config)}/contents/${encodePath(path)}?ref=${encodeURIComponent(config.branch)}`, {
    redirect: 'error', headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'User-Agent': 'MikeTheRBLX-Private-Studio', 'X-GitHub-Api-Version': '2022-11-28' }
  });
  if (response.status === 404) return null;
  if (response.status === 401) fail(401, 'Your session has ended. Sign in again.');
  if (!response.ok) fail(502, 'GitHub could not read the portfolio. Try again shortly.');
  const data = await response.json();
  if (data.type !== 'file' || data.encoding !== 'base64' || typeof data.content !== 'string' || !SHA.test(data.sha || '')) fail(502, 'The repository file format could not be read.');
  try { return { sha: data.sha, text: decoder.decode(base64ToBytes(data.content.replace(/\s/g, ''))) }; }
  catch { fail(502, 'A repository text file could not be decoded.'); }
}
async function writeFile(token, config, path, content, sha, message) {
  const result = await (await github(token, `${repoPath(config)}/contents/${encodePath(path)}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, content, branch: config.branch, ...(sha ? { sha } : {}) })
  })).json();
  if (!SHA.test(result.content?.sha || '')) fail(502, 'GitHub did not confirm this change. Reload to check the repository.');
  return result.content.sha;
}
function parseJsonFile(file, fallback = {}) {
  if (!file) return fallback;
  try { return JSON.parse(file.text.replace(/^\uFEFF/, '')); } catch { fail(502, 'A portfolio JSON file is invalid. Repair it before editing.'); }
}
const humanTitle = path => path.split('/').pop().replace(/\.[^.]+$/, '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').trim();
function parseVideoLines(text) {
  const items = [];
  for (let line of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    line = line.trim();
    if (!line || line.startsWith('#')) continue;
    const featured = line.startsWith('*');
    if (featured) line = line.slice(1).trim();
    const separator = line.indexOf('|');
    const title = separator >= 0 ? line.slice(0, separator).trim() : '';
    const text = separator >= 0 ? line.slice(separator + 1) : line;
    const url = text.match(/(?:https?:\/\/)?(?:www\.|m\.|music\.)?(?:youtube\.com|youtu\.be)\/[^\s|<>]+/i)?.[0];
    const id = youtubeId(url);
    if (id) items.push({ type: 'youtube', id, url: `https://www.youtube.com/watch?v=${id}`, ...(title ? { title, title_source: 'custom' } : {}), starred: featured });
  }
  return items;
}
async function readBlob(token, config, sha) {
  const blob = await (await github(token, `${repoPath(config)}/git/blobs/${sha}`)).json();
  if (blob.encoding !== 'base64' || typeof blob.content !== 'string' || blob.size > 1024 * 1024) fail(502, 'A portfolio text file is too large or unreadable.');
  try { return decoder.decode(base64ToBytes(blob.content.replace(/\s/g, ''))); } catch { fail(502, 'A portfolio text file could not be decoded.'); }
}
async function repositoryFiles(token, config) {
  const tree = await (await github(token, `${repoPath(config)}/git/trees/${encodeURIComponent(config.branch)}?recursive=1`)).json();
  if (tree.truncated || !Array.isArray(tree.tree)) fail(502, 'The repository tree is too large to edit safely.');
  return tree.tree.filter(file => file.type === 'blob' && file.mode === '100644');
}
async function categoryVideoLists(token, config, category, files, knownText = new Map()) {
  const textFiles = files.filter(file => file.path.startsWith(`assets/${FOLDERS[category]}/`) && /\.txt$/i.test(file.path)).sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  if (textFiles.length > 100) fail(502, 'Too many video lists. Combine the portfolio links into fewer text files.');
  const videoGroups = await Promise.all(textFiles.map(async file => parseVideoLines(knownText.has(file.path) ? knownText.get(file.path) : await readBlob(token, config, file.sha))));
  return new Map(textFiles.map((file, index) => [file.path, videoGroups[index]]));
}
async function content(token, config) {
  const [files, manifestFile, detailsFile] = await Promise.all([
    repositoryFiles(token, config),
    readFile(token, config, 'portfolio.json'), readFile(token, config, METADATA_FILE)
  ]);
  const manifest = parseJsonFile(manifestFile);
  const metadata = validateMetadata(parseJsonFile(detailsFile));
  const projects = { ui: [], scripting: [] };
  for (const [category, folder] of Object.entries(FOLDERS)) {
    const saved = new Map((Array.isArray(manifest[category]) ? manifest[category] : []).filter(plainObject).map(item => [(item.type === 'youtube' ? 'youtube:' + item.id : 'media:' + item.path), item]));
    const seen = new Set();
    const starredIdentities = [];
    const categoryFiles = files.filter(file => file.path.startsWith(`assets/${folder}/`)).sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
    const videoLists = await categoryVideoLists(token, config, category, categoryFiles);
    const discovered = categoryFiles.flatMap(file => validMediaPath(file.path, category) ? [{ type: 'media', path: file.path, title: humanTitle(file.path) }] : videoLists.get(file.path) || []);
    const sidecarFiles = new Map(categoryFiles.filter(file => /\.json$/i.test(file.path)).map(file => [file.path, file]));
    for (const item of discovered) {
      const identity = item.type === 'youtube' ? 'youtube:' + item.id : 'media:' + item.path;
      if (seen.has(identity)) continue;
      seen.add(identity);
      if (item.starred) starredIdentities.push(identity);
      const key = `${category}:${identity}`;
      const cached = saved.get(identity) || {};
      let sidecar = {};
      if (item.type === 'media' && sidecarFiles.has(item.path + '.json')) {
        sidecar = validateFields(parseJsonFile({ text: await readBlob(token, config, sidecarFiles.get(item.path + '.json').sha) }));
      }
      const base = { ...cached, ...item, hidden: false };
      delete base.order;
      if (item.type === 'media') base.title = cached.title || item.title;
      if (item.type === 'youtube' && !item.title) base.title = cached.title || 'UI animation demo';
      const details = { ...sidecar, ...(metadata[key] || {}) };
      const merged = { description: '', ...base, ...details, key };
      delete merged.starred;
      merged.previewUrl = item.type === 'youtube' ? `https://i.ytimg.com/vi/${item.id}/hqdefault.jpg` : `https://raw.githubusercontent.com/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/${encodePath(config.branch)}/${encodePath(item.path)}`;
      merged._explicitFeatured = Object.hasOwn(details, 'featured');
      merged._detailsFeatured = Object.hasOwn(metadata[key] || {}, 'featured');
      projects[category].push(merged);
    }
    const explicitFeatured = projects[category].find(item => item._detailsFeatured && item.featured && !item.hidden)?.key || projects[category].find(item => item._explicitFeatured && item.featured && !item.hidden)?.key;
    const starredKey = [...starredIdentities].reverse().map(identity => `${category}:${identity}`).find(key => projects[category].some(item => item.key === key && !item._explicitFeatured && !item.hidden));
    let chosen = explicitFeatured || starredKey;
    projects[category].sort((a, b) => (a.order ?? 1000001) - (b.order ?? 1000001));
    if (!chosen) chosen = projects[category].find(item => item.featured && !item._explicitFeatured && !item.hidden)?.key;
    if (!chosen) chosen = projects[category].find(item => !item.hidden && !item._explicitFeatured)?.key;
    for (const item of projects[category]) { item.featured = item.key === chosen; delete item._explicitFeatured; delete item._detailsFeatured; }
  }
  return { sha: detailsFile?.sha || null, metadata, projects, repository: { owner: config.owner, name: config.repo, branch: config.branch } };
}

async function route(request, env) {
  const config = configuration(env);
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;
  if (config && url.origin !== config.origin) fail(403, 'Use the configured private dashboard address.');
  if (!['GET', 'HEAD', 'POST', 'PUT'].includes(method)) fail(405, 'This method is not supported.');
  if (path === '/api/session' && method === 'GET') {
    if (!config) return json({ authenticated: false, configured: false, message: 'Private editing is disabled until the owner finishes the secure setup.' });
    const session = await sessionFor(request, env, config);
    if (!session) return json({ authenticated: false, configured: true, login: '/auth/login' });
    try {
      const owner = await verifyOwnerAndRepository(session.token, config);
      return json({ authenticated: true, configured: true, login: '/auth/login', user: { login: owner.login }, csrf: session.csrf });
    } catch (error) {
      if (error instanceof HttpError && [401, 403].includes(error.status)) return json({ authenticated: false, configured: true, login: '/auth/login', message: error.message }, 200, { 'Set-Cookie': cookie(SESSION_COOKIE, '', 0) });
      throw error;
    }
  }
  if (path === '/auth/login' && method === 'GET') { if (!config) fail(503, 'Private editing has not been configured.'); return login(request, env, config); }
  if (path === '/auth/callback' && method === 'GET') { if (!config) fail(503, 'Private editing has not been configured.'); return callback(request, env, config); }
  if (path.startsWith('/api/') || path === '/auth/logout') {
    if (!config) fail(503, 'Private editing has not been configured.');
    // Verify CSRF before sending any mutation request to GitHub.
    const localSession = await sessionFor(request, env, config);
    if (!localSession) fail(401, 'Sign in to your private dashboard.');
    if (method !== 'GET' && method !== 'HEAD') requireCsrf(request, config, localSession);
    if (path === '/auth/logout' && method === 'POST') {
      let revoked = false;
      try { revoked = await revokeToken(localSession.token, env, config); } catch { /* Cookie is cleared even if GitHub is unavailable. */ }
      return json({ authenticated: false, revoked, ...(!revoked ? { message: 'Signed out here. GitHub token revocation could not be confirmed; revoke the app authorization in GitHub if needed.' } : {}) }, 200, { 'Set-Cookie': cookie(SESSION_COOKIE, '', 0) });
    }
    const session = await authenticated(request, env, config);
    if (path === '/api/content' && method === 'GET') return json(await content(session.token, config));
    if (path === '/api/metadata' && method === 'PUT') {
      const body = await bodyJson(request);
      assertKeys(body, ['sha', 'metadata']);
      if (!Object.hasOwn(body, 'sha') || body.sha !== null && !SHA.test(body.sha || '')) fail(400, 'Include the current metadata version when saving.');
      const metadata = validateMetadata(body.metadata);
      const existing = await readFile(session.token, config, METADATA_FILE);
      if ((existing?.sha || null) !== body.sha) fail(409, 'Project details changed in another tab. Reload before saving again.');
      const sha = await writeFile(session.token, config, METADATA_FILE, bytesToBase64(encoder.encode(serializeMetadata(metadata))), body.sha, 'Update portfolio project details from private studio');
      return json({ sha, metadata });
    }
    if (path === '/api/upload' && method === 'POST') {
      const body = await bodyJson(request, MAX_BODY);
      assertKeys(body, ['category', 'filename', 'base64']);
      const upload = validateUpload(body.category, body.filename, body.base64);
      // Never replace an existing file without a separate explicit update contract.
      const existing = await fetch(`https://api.github.com${repoPath(config)}/contents/${encodePath(upload.path)}?ref=${encodeURIComponent(config.branch)}`, { redirect: 'error', headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${session.token}`, 'User-Agent': 'MikeTheRBLX-Private-Studio', 'X-GitHub-Api-Version': '2022-11-28' } });
      if (existing.ok) fail(409, 'An image with this filename already exists. Choose a different filename.');
      if (existing.status !== 404) fail(502, 'GitHub could not confirm the filename. Try again shortly.');
      await writeFile(session.token, config, upload.path, upload.base64, null, 'Add portfolio image from private studio');
      return json({ path: upload.path }, 201);
    }
    if (path === '/api/video' && method === 'POST') {
      const body = await bodyJson(request, 8192);
      assertKeys(body, ['category', 'url', 'title', 'featured']);
      if (!Object.hasOwn(FOLDERS, body.category)) fail(400, 'Choose UI or scripting.');
      const id = youtubeId(body.url);
      if (!id) fail(400, 'Enter a valid YouTube video link.');
      const title = body.title ?? '';
      if (typeof title !== 'string' || title.length > 200 || /[\r\n|\x00-\x1f]/.test(title)) fail(400, 'Video titles must contain at most 200 characters without line breaks or |.');
      if (body.featured !== undefined && typeof body.featured !== 'boolean') fail(400, 'Featured must be true or false.');
      const path = `assets/${FOLDERS[body.category]}/youtube.txt`;
      const file = await readFile(session.token, config, path);
      const current = file?.text || '';
      if (parseVideoLines(current).some(item => item.id === id)) fail(409, 'This video is already in this collection.');
      const videoLists = await categoryVideoLists(session.token, config, body.category, await repositoryFiles(session.token, config), new Map([[path, current]]));
      if ([...videoLists.values()].some(items => items.some(item => item.id === id))) fail(409, 'This video is already in this collection. Edit its existing project instead.');
      if (encoder.encode(current).length > 1024 * 1024 - 4096) fail(400, 'The video list has reached its size limit.');
      const line = `${body.featured ? '*' : ''}${title.trim() ? title.trim() + ' | ' : ''}https://www.youtube.com/watch?v=${id}\n`;
      await writeFile(session.token, config, path, bytesToBase64(encoder.encode(current + (current && !current.endsWith('\n') ? '\n' : '') + line)), file?.sha || null, 'Add portfolio video from private studio');
      return json({ id, path }, 201);
    }
    fail(404, 'This dashboard route does not exist.');
  }
  if (!['GET', 'HEAD'].includes(method)) fail(405, 'This method is not supported.');
  // Only the login shell and its styles/client code are public. No content or secrets are in these files.
  const publicAssets = ['/', '/index.html', '/admin.css', '/admin.js', '/favicon.ico'];
  if (!publicAssets.includes(path)) {
    if (!config) fail(503, 'Private editing has not been configured.');
    await authenticated(request, env, config);
  }
  if (!env.ASSETS?.fetch) fail(503, 'Dashboard assets are unavailable.');
  return env.ASSETS.fetch(request);
}
function securityHeaders(response) {
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'no-store');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Referrer-Policy', 'no-referrer');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  headers.set('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' https://i.ytimg.com https://raw.githubusercontent.com blob:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'; object-src 'none'");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
export default {
  async fetch(request, env) {
    try { return securityHeaders(await route(request, env)); }
    catch (error) {
      // Never log cookies, authorization codes, access tokens, request bodies or provider responses.
      const status = error instanceof HttpError ? error.status : 500;
      const message = error instanceof HttpError ? error.message : 'The private dashboard could not complete this request.';
      const response = json({ error: message }, status);
      if (new URL(request.url).pathname === '/auth/callback') response.headers.append('Set-Cookie', cookie(LOGIN_COOKIE, '', 0));
      return securityHeaders(response);
    }
  }
};
