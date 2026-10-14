'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { generate, build, youtubeId, parseVideoEntry, validateConfig } = require('./portfolio.cjs');
const { createServer } = require('./preview.cjs');

const ID_A = 'Wy2rbplQK28';
const ID_B = 'ibiyGn6kSrM';
const VIDEO_A = `https://www.youtube.com/watch?v=${ID_A}`;
const VIDEO_B = `https://youtu.be/${ID_B}`;
const REPO = path.resolve(__dirname, '..');

function fixture(t, config = { ui: { images: {}, youtube: [] } }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'portfolio-test-'));
  t.after(() => {
    // Each fixture is a uniquely created child of the OS temporary directory.
    const target = path.resolve(root);
    if (path.dirname(target) !== path.resolve(os.tmpdir()) || !path.basename(target).startsWith('portfolio-test-'))
      throw new Error('Refusing to clean an unexpected test path.');
    fs.rmSync(target, { recursive: true, force: true });
  });
  for (const category of ['UI', 'NormalAssets', 'previews']) fs.mkdirSync(path.join(root, 'assets', category), { recursive: true });
  if (config !== null) writeConfig(root, config);
  return root;
}

function write(root, relative, content = 'sample file') {
  const target = path.join(root, ...relative.split('/'));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

function writeConfig(root, config) { write(root, 'portfolio-content.js', `module.exports = ${JSON.stringify(config, null, 2)};\n`); }
function readManifest(root) { return JSON.parse(fs.readFileSync(path.join(root, 'portfolio.json'), 'utf8')); }
const offline = { offline: true, lookup: async () => { throw new Error('Offline generation must not make a request.'); } };

test('accepts YouTube watch, short, embed, live and youtu.be URLs', () => {
  for (const url of [VIDEO_A, VIDEO_B.replace(ID_B, ID_A), `https://youtube.com/shorts/${ID_A}`,
    `https://www.youtube.com/embed/${ID_A}`, `https://m.youtube.com/live/${ID_A}`,
    `https://music.youtube.com/watch?v=${ID_A}&feature=share`, `youtu.be/${ID_A}`]) {
    assert.equal(youtubeId(url), ID_A, url);
  }
});

test('rejects lookalike and unrelated YouTube hosts and invalid IDs', () => {
  for (const url of [`https://youtube.com.evil.test/watch?v=${ID_A}`, `https://evil.test/${ID_A}`,
    `https://youtube.com@evil.test/watch?v=${ID_A}`, 'https://youtu.be/short', 'javascript:alert(1)',
    `https://notyoutube.com/watch?v=${ID_A}`]) assert.equal(youtubeId(url), null, url);
});

test('parses a starred custom-title video string', () => {
  const entry = parseVideoEntry(`* Inventory animation | ${VIDEO_A}`, 'ui.youtube[0]');
  assert.equal(entry.id, ID_A);
  assert.equal(entry.title, 'Inventory animation');
  assert.equal(entry.featured, true);
});

test('parses video objects and gives a URL star priority over featured false', () => {
  const entry = parseVideoEntry({ url: `*${VIDEO_A}`, title: 'Inventory', description: 'Animated UI',
    featured: false, hidden: true, order: 2 }, 'ui.youtube[0]');
  assert.equal(entry.id, ID_A);
  assert.equal(entry.title, 'Inventory');
  assert.equal(entry.description, 'Animated UI');
  assert.equal(entry.featured, true);
  assert.equal(entry.hidden, true);
  assert.equal(entry.order, 2);
});

test('invalid video entries fail with their source location', () => {
  for (const entry of [{ url: 'https://example.com/watch?v=Wy2rbplQK28' }, 12, { title: 'Missing URL' }])
    assert.throws(() => parseVideoEntry(entry, 'ui.youtube[2]'), /ui\.youtube\[2\]/);
});

test('validates optional image fields and video objects', () => {
  assert.doesNotThrow(() => validateConfig({ ui: { images: { 'nested/Shop.png': { title: 'Shop UI',
    description: '', hidden: false, featured: true, order: 0 } }, youtube: [{ url: VIDEO_A, order: 1000000 }] } }));
});

test('rejects invalid metadata instead of silently publishing it', () => {
  const invalid = [ { title: '' }, { title: '  ' }, { title: 'a'.repeat(201) }, { title: 7 },
    { description: 'a'.repeat(5001) }, { description: 7 }, { featured: 'true' }, { hidden: 0 },
    { order: -1 }, { order: Infinity }, { order: NaN }, { order: 1000001 }, { order: '2' },
    { descripton: 'A misspelled field' } ];
  for (const details of invalid) assert.throws(() => validateConfig({ ui: { images: { 'Shop.png': details } } }),
    undefined, JSON.stringify(details));
});

test('rejects image metadata paths outside category folders', () => {
  for (const filename of ['../private.png', '/absolute.png', 'C:\\private.png', 'nested\\Shop.png',
    'nested/../Shop.png', 'nested//Shop.png', './Shop.png', 'youtube.txt'])
    assert.throws(() => validateConfig({ ui: { images: { [filename]: { title: 'Shop' } } } }), undefined, filename);
});

test('rejects incorrectly shaped authoring sections', () => {
  for (const config of [null, [], 'text', { ui: [] }, { ui: { images: [] } }, { ui: { youtube: 'a URL' } },
    { ui: { images: { 'Shop.png': [] } } }]) assert.throws(() => validateConfig(config));
});

test('discovers nested images automatically without metadata', async t => {
  const root = fixture(t);
  write(root, 'assets/UI/ShopMenu.png');
  write(root, 'assets/UI/nested/Inventory-grid.webp');
  write(root, 'assets/UI/ignored.txt', 'not a video');
  const result = await generate(root, offline);
  assert.equal(result.ui.length, 2);
  const shop = result.ui.find(item => item.path.endsWith('ShopMenu.png'));
  assert.equal(shop.title, 'Shop Menu');
  assert.equal(shop.description, '');
  assert.equal(shop.hidden, false);
  assert.ok(shop.slug);
  assert.equal(readManifest(root).ui.length, 2);
});

test('applies image titles, descriptions, order and hidden state', async t => {
  const root = fixture(t, { ui: { images: {
    'Shop.png': { title: 'Fantasy shop', description: 'Readable item prices.', order: 2 },
    'Inventory.png': { title: 'Inventory', hidden: true, order: 0 },
  }, youtube: [] } });
  write(root, 'assets/UI/Shop.png');
  write(root, 'assets/UI/Inventory.png');
  const result = await generate(root, offline);
  assert.equal(result.ui[0].path, 'assets/UI/Inventory.png');
  assert.equal(result.ui[0].hidden, true);
  assert.equal(result.ui[1].title, 'Fantasy shop');
  assert.equal(result.ui[1].description, 'Readable item prices.');
  assert.equal(result.ui[1].featured, true);
});

test('missing image metadata does not invent a project', async t => {
  const root = fixture(t, { ui: { images: { 'Missing.png': { title: 'Future project' } }, youtube: [] } });
  const result = await generate(root, offline);
  assert.equal(result.ui.length, 0);
});

test('configured videos support strings and descriptions', async t => {
  const root = fixture(t, { ui: { youtube: [ `Inventory animation | ${VIDEO_A}`,
    { url: VIDEO_B, title: 'Shop animation', description: 'Motion with clear feedback.' } ] } });
  const result = await generate(root, offline);
  assert.equal(result.ui.length, 2);
  assert.equal(result.ui[0].title, 'Inventory animation');
  assert.equal(result.ui[1].description, 'Motion with clear feedback.');
  assert.equal(result.ui[1].type, 'youtube');
  assert.equal(result.ui[1].id, ID_B);
});

test('only UI work is accepted in the content source', () => {
  assert.throws(() => validateConfig({ scripting: { youtube: [VIDEO_A] } }), /unknown category/);
});

test('omitted and empty YouTube lists do not read legacy text files', async t => {
  const root = fixture(t, { ui: { images: {} } });
  write(root, 'assets/UI/youtube.txt', `* Legacy demo | ${VIDEO_A}\n`);
  write(root, 'assets/Scripting/youtube.txt', VIDEO_B);
  let result = await generate(root, offline);
  assert.deepEqual(Object.keys(result), ['ui']);
  assert.equal(result.ui.length, 0);
  writeConfig(root, { ui: { youtube: [] } });
  result = await generate(root, offline);
  assert.equal(result.ui.length, 0);
});

test('adds responsive previews only when both safe WebP sizes exist', async t => {
  const root = fixture(t);
  write(root, 'assets/UI/Shop.png');
  write(root, 'assets/previews/Shop.png-800.webp');
  let result = await generate(root, offline);
  assert.equal(result.ui[0].preview, undefined);
  write(root, 'assets/previews/Shop.png-1600.webp');
  result = await generate(root, offline);
  assert.deepEqual(result.ui[0].preview, {
    small: 'assets/previews/Shop.png-800.webp', large: 'assets/previews/Shop.png-1600.webp',
  });
});
test('duplicate videos are included once with the first entry metadata', async t => {
  const root = fixture(t, { ui: { youtube: [`First title | ${VIDEO_A}`,
    { url: `https://youtu.be/${ID_A}`, title: 'Second title', featured: true }] } });
  const result = await generate(root, offline);
  assert.equal(result.ui.length, 1);
  assert.equal(result.ui[0].title, 'First title');
});

test('the last marked visible project wins and hidden projects cannot be featured', async t => {
  const root = fixture(t, { ui: { images: {
    'First.png': { featured: true }, 'Second.png': { featured: true },
  }, youtube: [{ url: VIDEO_A, featured: true }, { url: VIDEO_B, featured: true, hidden: true }] } });
  write(root, 'assets/UI/First.png');
  write(root, 'assets/UI/Second.png');
  const result = await generate(root, offline);
  assert.deepEqual(result.ui.filter(item => item.featured).map(item => item.id), [ID_A]);
  assert.equal(result.ui.find(item => item.id === ID_B).featured, false);
});

test('fallback featuring respects explicit false while a star overrides it', async t => {
  const root = fixture(t, { ui: { images: { 'First.png': { featured: false } }, youtube: [] } });
  write(root, 'assets/UI/First.png');
  write(root, 'assets/UI/Second.png');
  let result = await generate(root, offline);
  assert.deepEqual(result.ui.filter(item => item.featured).map(item => item.path), ['assets/UI/Second.png']);
  writeConfig(root, { ui: { images: { 'First.png': { featured: false } },
    youtube: [{ url: `*${VIDEO_A}`, featured: false }] } });
  result = await generate(root, offline);
  assert.deepEqual(result.ui.filter(item => item.featured).map(item => item.id), [ID_A]);
});

test('automatic featuring chooses the first eligible project after applying display order', async t => {
  const root = fixture(t, { ui: { images: {
    'A.png': { order: 3 }, 'B.png': { order: 1 }, 'C.png': { order: 0, featured: false },
  }, youtube: [] } });
  for (const filename of ['A.png', 'B.png', 'C.png']) write(root, `assets/UI/${filename}`);
  const result = await generate(root, offline);
  assert.deepEqual(result.ui.map(item => path.basename(item.path)), ['C.png', 'B.png', 'A.png']);
  assert.deepEqual(result.ui.filter(item => item.featured).map(item => path.basename(item.path)), ['B.png']);
});

test('removing metadata clears old title, description, hidden, order and feature state', async t => {
  const root = fixture(t, { ui: { images: {
    'A.png': { title: 'Old custom title', description: 'Old description', hidden: true, order: 12 },
    'B.png': { featured: true },
  }, youtube: [] } });
  write(root, 'assets/UI/A.png');
  write(root, 'assets/UI/B.png');
  const before = await generate(root, offline);
  const oldSlug = before.ui.find(item => item.path.endsWith('/A.png')).slug;
  writeConfig(root, { ui: { images: {}, youtube: [] } });
  const result = await generate(root, offline);
  const a = result.ui.find(item => item.path.endsWith('/A.png'));
  assert.equal(a.title, 'A');
  assert.equal(a.description, '');
  assert.equal(a.hidden, false);
  assert.equal(a.order, undefined);
  assert.equal(a.featured, true);
  assert.equal(a.slug, oldSlug);
  assert.equal(result.ui.find(item => item.path.endsWith('/B.png')).featured, false);
});

test('deleting an image or video removes it without retaining previous manifest projects', async t => {
  const root = fixture(t, { ui: { youtube: [VIDEO_A] } });
  write(root, 'assets/UI/Shop.png');
  await generate(root, offline);
  fs.unlinkSync(path.join(root, 'assets', 'UI', 'Shop.png'));
  writeConfig(root, { ui: { youtube: [] } });
  assert.equal((await generate(root, offline)).ui.length, 0);
});

test('explicit project order comes first and remaining filenames have a stable natural order', async t => {
  const root = fixture(t, { ui: { images: { 'Screen10.png': { order: 0 } }, youtube: [] } });
  for (const name of ['Screen10.png', 'Screen2.png', 'Screen1.png']) write(root, `assets/UI/${name}`);
  const result = await generate(root, offline);
  assert.deepEqual(result.ui.map(item => path.basename(item.path)), ['Screen10.png', 'Screen1.png', 'Screen2.png']);
});

test('adding a similarly named image never changes an existing shared slug', async t => {
  const root = fixture(t);
  write(root, 'assets/UI/Shop.png');
  const before = await generate(root, offline);
  write(root, 'assets/UI/Shop.jpg');
  const after = await generate(root, offline);
  assert.equal(after.ui.find(item => item.path.endsWith('Shop.png')).slug, before.ui[0].slug);
  assert.equal(new Set(after.ui.map(item => item.slug)).size, 2);
});

test('preserves the four UI projects and shared slugs when migrating to one page', async t => {
  const root = fixture(t);
  const previous = JSON.parse(fs.readFileSync(path.join(REPO, 'portfolio.json'), 'utf8'));
  const config = { ui: { images: {}, youtube: [] } };
  for (const item of previous.ui) {
    const fields = Object.fromEntries(['title', 'description', 'featured', 'hidden', 'order']
      .filter(field => item[field] !== undefined).map(field => [field, item[field]]));
    if (item.type === 'media') {
      write(root, item.path);
      config.ui.images[item.path.split('/').slice(2).join('/')] = fields;
    } else config.ui.youtube.push({ url: item.url, ...fields });
  }
  writeConfig(root, config);
  write(root, 'portfolio.json', JSON.stringify(previous));
  const result = await generate(root, offline);
  assert.deepEqual(Object.keys(result), ['ui']);
  assert.equal(result.ui.length, 4);
  assert.deepEqual(result.ui.map(item => item.slug), ['profile-overview', 'inventory', 'simulator-hud', 'game-hud']);
  for (const item of previous.ui) {
    const match = result.ui.find(candidate => item.type === 'youtube' ? candidate.id === item.id : candidate.path === item.path);
    assert.ok(match);
    assert.equal(match.slug, item.slug);
    assert.equal(match.title, item.title);
  }
});
test('fetches missing YouTube titles through the injected lookup and caches fetched titles', async t => {
  const root = fixture(t, { ui: { youtube: [VIDEO_A] } });
  let calls = 0;
  const lookup = async id => { assert.equal(id, ID_A); calls += 1; return 'Animated Inventory'; };
  const first = await generate(root, { lookup });
  assert.equal(first.ui[0].title, 'Animated Inventory');
  assert.equal(first.ui[0].title_source, 'youtube');
  const second = await generate(root, { lookup });
  assert.equal(second.ui[0].title, 'Animated Inventory');
  assert.equal(calls, 1);
});

test('removing a custom YouTube title permits its actual title to be fetched', async t => {
  const root = fixture(t, { ui: { youtube: [`Custom title | ${VIDEO_A}`] } });
  await generate(root, offline);
  writeConfig(root, { ui: { youtube: [VIDEO_A] } });
  const result = await generate(root, { lookup: async () => 'Real video title' });
  assert.equal(result.ui[0].title, 'Real video title');
  assert.equal(result.ui[0].title_source, 'youtube');
});

test('network failure and offline operation still generate a useful project title', async t => {
  const root = fixture(t, { ui: { youtube: [VIDEO_A] } });
  const first = await generate(root, { lookup: async () => { throw new Error('Unavailable'); } });
  assert.ok(first.ui[0].title);
  assert.equal(first.ui[0].title_source, 'fallback');
  const second = await generate(root, offline);
  assert.ok(second.ui[0].title);
  assert.equal(second.ui[0].id, ID_A);
});

test('a fallback YouTube title is retried on the next online update', async t => {
  const root = fixture(t, { ui: { youtube: [VIDEO_A] } });
  const first = await generate(root, { lookup: async () => { throw new Error('Temporary YouTube failure'); } });
  assert.equal(first.ui[0].title_source, 'fallback');
  let calls = 0;
  const second = await generate(root, { lookup: async id => { assert.equal(id, ID_A); calls += 1; return 'Recovered video title'; } });
  assert.equal(calls, 1);
  assert.equal(second.ui[0].title, 'Recovered video title');
  assert.equal(second.ui[0].title_source, 'youtube');
  assert.equal(second.ui[0].slug, first.ui[0].slug);
});

test('syntax errors leave the previous generated manifest intact', async t => {
  const root = fixture(t);
  write(root, 'portfolio.json', '{"ui": []}\n');
  const before = fs.readFileSync(path.join(root, 'portfolio.json'), 'utf8');
  write(root, 'portfolio-content.js', 'module.exports = { ui: BROKEN SYNTAX };');
  await assert.rejects(generate(root, offline), /portfolio-content\.js|syntax|unexpected/i);
  assert.equal(fs.readFileSync(path.join(root, 'portfolio.json'), 'utf8'), before);
});

test('invalid metadata leaves the previous generated manifest intact', async t => {
  const root = fixture(t, { ui: { images: { 'Shop.png': { hidden: 'yes' } } } });
  write(root, 'portfolio.json', '{"ui": []}\n');
  const before = fs.readFileSync(path.join(root, 'portfolio.json'), 'utf8');
  await assert.rejects(generate(root, offline));
  assert.equal(fs.readFileSync(path.join(root, 'portfolio.json'), 'utf8'), before);
});

test('build includes website files and media while excluding authoring, backend and repository files', async t => {
  const root = fixture(t, { ui: { images: { 'Shop.png': { title: 'Shop', description: 'A clear layout.' } }, youtube: [] } });
  for (const filename of ['index.html', 'portfolio.html', 'contact.html', 'tos.html', 'styles.css', 'site.js', 'portfolio.js', 'sitemap.xml', 'robots.txt', '_redirects', 'CNAME'])
    write(root, filename, `public ${filename}`);
  write(root, 'assets/UI/Shop.png');
  write(root, 'assets/NormalAssets/logo.webp');
  write(root, 'assets/previews/Shop.png-800.webp');
  write(root, 'assets/previews/Shop.png-1600.webp');
  write(root, 'assets/Scripting/private.png');
  for (const filename of ['admin/worker.mjs', 'admin/.dev.vars', '.git/config', 'assets/UI/youtube.txt',
    'assets/UI/Shop.png.json', 'project-details.json', 'README.md', '.env', 'scripts/private.cjs']) write(root, filename, 'private');
  await build(root, offline);
  const output = path.join(root, '_site');
  for (const filename of ['index.html', 'portfolio.json', 'assets/UI/Shop.png', 'assets/NormalAssets/logo.webp', 'assets/previews/Shop.png-800.webp', '_redirects', 'CNAME'])
    assert.ok(fs.existsSync(path.join(output, ...filename.split('/'))), filename);
  for (const filename of ['portfolio-content.js', 'admin', '.git', '.env', 'project-details.json', 'README.md',
    'scripts', 'portfolio.html', 'contact.html', 'tos.html', 'assets/Scripting', 'assets/UI/youtube.txt', 'assets/UI/Shop.png.json'])
    assert.equal(fs.existsSync(path.join(output, ...filename.split('/'))), false, filename);
  assert.equal(JSON.parse(fs.readFileSync(path.join(output, 'portfolio.json'))).ui[0].description, 'A clear layout.');
});

test('rebuilding removes stale output files and leaves source files untouched', async t => {
  const root = fixture(t);
  write(root, 'index.html', 'homepage');
  write(root, 'assets/UI/Shop.png');
  await build(root, offline);
  write(root, '_site/stale-private.txt', 'stale output');
  fs.unlinkSync(path.join(root, 'assets', 'UI', 'Shop.png'));
  await build(root, offline);
  assert.equal(fs.existsSync(path.join(root, '_site', 'stale-private.txt')), false);
  assert.equal(fs.existsSync(path.join(root, '_site', 'assets', 'UI', 'Shop.png')), false);
  assert.equal(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), 'homepage');
});

test('a failed build preserves the previous public output', async t => {
  const root = fixture(t);
  write(root, 'index.html', 'public homepage');
  await build(root, offline);
  writeConfig(root, { ui: { youtube: [{ url: 'https://example.com/not-youtube' }] } });
  await assert.rejects(build(root, offline));
  assert.equal(fs.readFileSync(path.join(root, '_site', 'index.html'), 'utf8'), 'public homepage');
});

test('build refuses an output directory linked outside the project', async t => {
  const root = fixture(t);
  const outside = fixture(t);
  write(root, 'index.html', 'homepage');
  write(outside, 'keep.txt', 'unrelated files must survive');
  try { fs.symlinkSync(outside, path.join(root, '_site'), process.platform === 'win32' ? 'junction' : 'dir'); }
  catch (error) { if (['EPERM', 'EACCES', 'ENOSYS'].includes(error.code)) { t.skip('This environment cannot create directory links.'); return; } throw error; }
  await assert.rejects(build(root, offline), /symbolic|symlink|link|outside|unsafe|regular directory/i);
  assert.equal(fs.readFileSync(path.join(outside, 'keep.txt'), 'utf8'), 'unrelated files must survive');
});

test('automatic media discovery does not traverse linked asset directories', async t => {
  const root = fixture(t);
  const outside = fixture(t);
  write(outside, 'private.png', 'private external image');
  try { fs.symlinkSync(outside, path.join(root, 'assets', 'UI', 'linked'), process.platform === 'win32' ? 'junction' : 'dir'); }
  catch (error) { if (['EPERM', 'EACCES', 'ENOSYS'].includes(error.code)) { t.skip('This environment cannot create directory links.'); return; } throw error; }
  assert.equal((await generate(root, offline)).ui.length, 0);
});

async function request(server, url, method = 'GET', headers = {}) {
  const address = server.address();
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: address.port, path: url, method, headers }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks).toString() }));
    });
    req.on('error', reject);
    req.end();
  });
}

async function previewFixture(t) {
  const root = fixture(t);
  write(root, 'index.html', 'Public homepage');
  write(root, 'portfolio.json', '{"ui":[]}');
  write(root, 'assets/UI/Inventory UI.png', 'image bytes');
  write(root, '.git/config', 'private git content');
  write(root, 'admin/worker.mjs', 'backend source');
  write(root, 'assets/UI/youtube.txt', 'private authoring text');
  write(root, 'assets/Scripting/private.png', 'private scripting work');
  write(root, 'assets/previews/Inventory.png-800.webp', 'preview bytes');
  const server = createServer(root);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  return { root, server };
}

test('preview serves the homepage, JSON and encoded image paths with correct content types', async t => {
  const { server } = await previewFixture(t);
  const home = await request(server, '/?preview=1');
  assert.equal(home.status, 200);
  assert.equal(home.body, 'Public homepage');
  assert.match(home.headers['content-type'], /text\/html/);
  assert.equal(home.headers['cache-control'], 'no-store');
  const json = await request(server, '/portfolio.json');
  assert.equal(json.status, 200);
  assert.match(json.headers['content-type'], /application\/json/);
  const image = await request(server, '/assets/UI/Inventory%20UI.png');
  assert.equal(image.status, 200);
  assert.equal(image.body, 'image bytes');
  assert.equal(image.headers['content-type'], 'image/png');
});

test('preview rejects backend, repository, authoring, directory listings and traversal requests', async t => {
  const { server } = await previewFixture(t);
  for (const url of ['/admin/worker.mjs', '/.git/config', '/portfolio-content.js', '/assets/UI/youtube.txt',
    '/assets/Scripting/private.png', '/assets/UI/', '/../.git/config', '/assets/UI/%2e%2e/%2e%2e/.git/config', '/assets%5cUI%5cInventory%20UI.png',
    '/%ZZ', '/assets/UI/%00.png', '//index.html']) {
    const result = await request(server, url);
    assert.equal(result.status, 404, url);
    assert.equal(result.body.includes('private'), false, url);
  }
});

test('preview supports HEAD and byte ranges and rejects other methods', async t => {
  const { server } = await previewFixture(t);
  const head = await request(server, '/index.html', 'HEAD');
  assert.equal(head.status, 200);
  assert.equal(head.body, '');
  assert.equal(Number(head.headers['content-length']), 'Public homepage'.length);
  const range = await request(server, '/assets/UI/Inventory%20UI.png', 'GET', { Range: 'bytes=0-4' });
  assert.equal(range.status, 206);
  assert.equal(range.body, 'image');
  assert.equal(range.headers['content-range'], 'bytes 0-4/11');
  assert.equal((await request(server, '/index.html', 'POST')).status, 405);
});

test('preview never follows asset symlinks to private source files', async t => {
  const { root, server } = await previewFixture(t);
  write(root, '.git/Private.png', 'private image');
  const source = path.join(root, '.git');
  const link = path.join(root, 'assets', 'UI', 'linked');
  try { fs.symlinkSync(source, link, process.platform === 'win32' ? 'junction' : 'dir'); }
  catch (error) { if (['EPERM', 'EACCES', 'ENOSYS'].includes(error.code)) { t.skip('This environment cannot create directory links.'); return; } throw error; }
  assert.equal((await request(server, '/assets/UI/linked/Private.png')).status, 404);
});

test('preview redirects old page URLs to single-page sections', async t => {
  const { server } = await previewFixture(t);
  for (const [page, target] of [['portfolio', '/?from=work'], ['contact', '/#contact'], ['tos', '/#tos']]) {
    for (const suffix of ['', '.html']) {
      const response = await request(server, `/${page}${suffix}?old=1`);
      assert.equal(response.status, 301);
      assert.equal(response.headers.location, target);
      assert.equal(response.body, '');
    }
  }
});

test('preview serves optimized WebP files without exposing content source', async t => {
  const { server } = await previewFixture(t);
  const response = await request(server, '/assets/previews/Inventory.png-800.webp');
  assert.equal(response.status, 200);
  assert.equal(response.headers['content-type'], 'image/webp');
  assert.equal(response.body, 'preview bytes');
});
test('identical content updates leave the existing manifest file untouched', async t => {
  const root = fixture(t);
  write(root, 'assets/UI/Shop.png');
  await generate(root, offline);
  const manifestPath = path.join(root, 'portfolio.json');
  const olderTime = new Date('2024-01-01T00:00:00Z');
  fs.utimesSync(manifestPath, olderTime, olderTime);
  const previousTime = fs.statSync(manifestPath).mtimeMs;
  await generate(root, offline);
  assert.equal(fs.statSync(manifestPath).mtimeMs, previousTime);
});

test('transient destination locks are retried without removing the previous manifest', async t => {
  const root = fixture(t);
  write(root, 'portfolio.json', '{"ui":[]}\n');
  write(root, 'assets/UI/Shop.png');
  const previous = fs.readFileSync(path.join(root, 'portfolio.json'), 'utf8');
  const originalRename = fs.promises.rename;
  let attempts = 0;
  fs.promises.rename = async (source, target) => {
    if (target === path.join(root, 'portfolio.json') && ++attempts <= 2) {
      assert.equal(fs.readFileSync(target, 'utf8'), previous);
      const failure = new Error('Temporary sync lock'); failure.code = 'EPERM'; throw failure;
    }
    return originalRename(source, target);
  };
  try {
    const result = await generate(root, offline);
    assert.equal(attempts, 3);
    assert.equal(result.ui.length, 1);
    assert.equal(readManifest(root).ui.length, 1);
  } finally { fs.promises.rename = originalRename; }
});