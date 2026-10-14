#!/usr/bin/env node
'use strict';

// Build-time content compiler. The editable source is ../portfolio-content.js.
const fs = require('node:fs/promises');
const path = require('node:path');
const vm = require('node:vm');
const {randomUUID} = require('node:crypto');

const FOLDERS = {ui: 'UI'};
const ASSET_FOLDERS = ['UI', 'NormalAssets', 'previews'];
const MEDIA = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.avif', '.mp4', '.webm', '.ogg', '.mov', '.m4v']);
const ASSETS = new Set([...MEDIA, '.ico', '.woff', '.woff2', '.ttf', '.otf']);
const PUBLIC_FILES = ['index.html', 'styles.css', 'site.js', 'portfolio.js', 'portfolio.json', 'google9f09677e001de9f7.html', 'sitemap.xml', 'robots.txt', 'CNAME', '_redirects'];
const DETAILS = new Set(['title', 'description', 'featured', 'hidden', 'order']);
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value) && Object.prototype.toString.call(value) === '[object Object]';
const error = (source, message) => { throw new Error(`${source}: ${message}`); };
const isInside = (root, target) => { const relative = path.relative(root, target); return relative !== '' && !relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative); };

function validateDetails(value, source) {
  if (!record(value)) error(source, 'use an object with project settings');
  for (const [key, item] of Object.entries(value)) {
    if (!DETAILS.has(key)) error(source, `unknown setting ${JSON.stringify(key)}`);
    if (key === 'title' && (typeof item !== 'string' || !item.trim() || item.length > 200)) error(source, 'title must contain 1–200 characters');
    if (key === 'description' && (typeof item !== 'string' || item.length > 5000)) error(source, 'description must be text, up to 5,000 characters');
    if ((key === 'featured' || key === 'hidden') && typeof item !== 'boolean') error(source, `${key} must be true or false`);
    if (key === 'order' && (typeof item !== 'number' || !Number.isFinite(item) || item < 0 || item > 1_000_000)) error(source, 'order must be a number from 0 to 1,000,000');
  }
  return {...value};
}

function validRelativeMedia(value) {
  return typeof value === 'string' && value.length <= 500 && !/[\\\x00-\x1f\x7f]/.test(value) &&
    !path.posix.isAbsolute(value) && !/^[A-Za-z]:/.test(value) &&
    value.split('/').every(part => part && part !== '.' && part !== '..') && MEDIA.has(path.posix.extname(value).toLowerCase());
}

function youtubeId(value) {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const url = new URL(value.includes('://') ? value : `https://${value}`);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port) return null;
    const parts = url.pathname.split('/').filter(Boolean);
    let id;
    if (['youtu.be', 'www.youtu.be'].includes(url.hostname)) id = parts[0];
    else if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com'].includes(url.hostname)) {
      id = parts[0] === 'watch' ? url.searchParams.get('v') : ['shorts', 'embed', 'live'].includes(parts[0]) ? parts[1] : '';
    }
    return VIDEO_ID.test(id || '') ? id : null;
  } catch { return null; }
}

function parseVideoEntry(value, source = 'YouTube entry') {
  const object = record(value);
  if (!object && typeof value !== 'string') error(source, 'use a YouTube link or an object containing url');
  let text = object ? value.url : value;
  if (typeof text !== 'string') error(source, 'url must be a YouTube link');
  text = text.trim();
  if (!object && (!text || text.startsWith('#'))) return null;
  const star = text.startsWith('*');
  if (star) text = text.slice(1).trim();
  const separator = text.indexOf('|');
  const inlineTitle = separator < 0 ? '' : text.slice(0, separator).trim();
  const url = separator < 0 ? text : text.slice(separator + 1).trim();
  const id = youtubeId(url);
  if (!id) error(source, 'enter a valid YouTube watch, short, Shorts or live-video link');
  const details = object ? Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'url')) : {};
  if (inlineTitle && !Object.hasOwn(details, 'title')) details.title = inlineTitle;
  validateDetails(details, source);
  if (star) details.featured = true;
  return {id, url: `https://www.youtube.com/watch?v=${id}`, ...details};
}

function validateConfig(config) {
  if (!record(config)) error('portfolio-content.js', 'module.exports must contain a settings object');
  for (const category of Object.keys(config)) if (!Object.hasOwn(FOLDERS, category)) error('portfolio-content.js', `unknown category ${JSON.stringify(category)}`);
  for (const [category, value] of Object.entries(config)) {
    if (!record(value)) error(category, 'use an object containing images and youtube');
    for (const field of Object.keys(value)) if (!['images', 'youtube'].includes(field)) error(category, `unknown setting ${JSON.stringify(field)}`);
    if (value.images !== undefined) {
      if (!record(value.images)) error(`${category}.images`, 'use an object keyed by image filename');
      for (const [filename, details] of Object.entries(value.images)) {
        if (!validRelativeMedia(filename)) error(`${category}.images`, `invalid image filename ${JSON.stringify(filename)}; use a filename relative to its category folder`);
        validateDetails(details, `${category}.images[${JSON.stringify(filename)}]`);
      }
    }
    if (Object.hasOwn(value, 'youtube')) {
      if (!Array.isArray(value.youtube)) error(`${category}.youtube`, 'use an array of YouTube entries');
      value.youtube.forEach((entry, index) => parseVideoEntry(entry, `${category}.youtube[${index}]`));
    }
  }
  return config;
}

async function loadConfig(root) {
  const filename = path.join(root, 'portfolio-content.js');
  let source;
  try { source = await fs.readFile(filename, 'utf8'); }
  catch (failure) { if (failure.code === 'ENOENT') return {}; throw failure; }
  const module = {exports: {}};
  try {
    new vm.Script(source.replace(/^\uFEFF/, ''), {filename}).runInNewContext({module}, {timeout: 1000});
  } catch (failure) {
    const location = String(failure.stack || '').split('\n').slice(0, 3).join('\n');
    throw new Error(`Check portfolio-content.js for a missing comma, quote or bracket.\n${location}\n${failure.message}`);
  }
  return validateConfig(module.exports);
}

async function statOrNull(filename) {
  try { return await fs.lstat(filename); } catch (failure) { if (failure.code === 'ENOENT') return null; throw failure; }
}

async function walk(folder, root) {
  const status = await statOrNull(folder);
  if (!status || status.isSymbolicLink() || !status.isDirectory()) return [];
  if (!isInside(root, await fs.realpath(folder))) return [];
  const files = [];
  for (const entry of await fs.readdir(folder, {withFileTypes: true})) {
    if (entry.isSymbolicLink()) continue;
    const filename = path.join(folder, entry.name);
    if (entry.isDirectory()) files.push(...await walk(filename, root));
    else if (entry.isFile() && isInside(root, await fs.realpath(filename))) files.push(filename);
  }
  return files.sort((left, right) => left.localeCompare(right, 'en', {numeric: true}));
}

function humanTitle(filename) {
  return path.posix.basename(filename, path.posix.extname(filename)).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').trim() || 'Roblox project';
}
const identity = item => item.type === 'youtube' ? `youtube:${item.id}` : `media:${item.path}`;
const slugify = text => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'project';

async function readPrevious(root) {
  try { const value = JSON.parse(await fs.readFile(path.join(root, 'portfolio.json'), 'utf8')); return record(value) ? value : {}; }
  catch { return {}; }
}

async function fetchTitle(id) {
  const query = new URLSearchParams({url: `https://www.youtube.com/watch?v=${id}`, format: 'json'});
  const response = await fetch(`https://www.youtube.com/oembed?${query}`, {signal: AbortSignal.timeout(5000), redirect: 'error'});
  if (!response.ok) throw new Error('YouTube title unavailable');
  const data = await response.json();
  return data.title;
}

async function atomicJSON(root, filename, data) {
  const target = path.join(root, filename);
  const existing = await statOrNull(target);
  if (existing?.isSymbolicLink() || existing && !existing.isFile()) error(filename, 'output must be a regular file');
  const content = JSON.stringify(data, null, 2) + '\n';
  // Leave identical output alone: this also avoids needless OneDrive sync locks.
  if (existing && await fs.readFile(target, 'utf8') === content) return;
  const temporary = path.join(root, `.portfolio-${randomUUID()}.tmp`);
  try {
    await fs.writeFile(temporary, content, {encoding: 'utf8', flag: 'wx'});
    for (let attempt = 0; ; attempt++) {
      try { await fs.rename(temporary, target); break; }
      catch (failure) {
        // A sync client may briefly hold the destination. Never delete the
        // previous valid manifest to work around a lock; retry for at most 750ms.
        if (!['EPERM', 'EACCES', 'EBUSY'].includes(failure.code) || attempt >= 4) throw failure;
        await new Promise(resolve => setTimeout(resolve, 50 * 2 ** attempt));
      }
    }
  } finally { await fs.rm(temporary, {force: true}); }
}

async function generate(root, options = {}) {
  root = await fs.realpath(path.resolve(root));
  const config = await loadConfig(root);
  const previous = await readPrevious(root);
  const manifest = {};
  const cache = new Map();
  for (const category of Object.keys(FOLDERS)) for (const item of Array.isArray(previous[category]) ? previous[category] : []) {
    if (record(item)) cache.set(identity(item), item);
  }
  const lookup = options.lookup || fetchTitle;
  const previewFiles = new Set((await walk(path.join(root, 'assets', 'previews'), root)).map(filename => path.relative(root, filename).split(path.sep).join('/')));
  for (const [category, folderName] of Object.entries(FOLDERS)) {
    const settings = config[category] || {};
    const folder = path.join(root, 'assets', folderName);
    const files = await walk(folder, root);
    const imageSettings = settings.images || {};
    const items = [];
    const markers = [];
    const usedImages = new Set();
    const seenVideos = new Set();
    const markedImages = Object.keys(imageSettings).filter(key => imageSettings[key].featured === true);
    for (const filename of files) {
      if (!MEDIA.has(path.extname(filename).toLowerCase())) continue;
      const relative = path.relative(folder, filename).split(path.sep).join('/');
      const details = imageSettings[relative] || {};
      const item = {type: 'media', path: `assets/${folderName}/${relative}`, title: details.title || humanTitle(relative), description: '', hidden: false, ...details};
      const previewBase = `assets/previews/${path.basename(filename)}`;
      const preview = {small: `${previewBase}-800.webp`, large: `${previewBase}-1600.webp`};
      if (previewFiles.has(preview.small) && previewFiles.has(preview.large)) item.preview = preview;
      usedImages.add(relative);
      items.push(item);
    }
    // Image feature priority follows the order of entries in the editable file.
    for (const filename of markedImages) if (usedImages.has(filename)) markers.push(`media:assets/${folderName}/${filename}`);
    for (const filename of Object.keys(imageSettings)) if (!usedImages.has(filename)) options.onWarning?.(`${category}: settings for ${filename} have no matching image; ignored`);
    const videos = (settings.youtube || []).map((entry, index) => parseVideoEntry(entry, `${category}.youtube[${index}]`)).filter(Boolean);
    for (const entry of videos) {
      if (seenVideos.has(entry.id)) { options.onWarning?.(`${category}: duplicate YouTube video ${entry.id}; first entry kept`); continue; }
      seenVideos.add(entry.id);
      const saved = cache.get(`youtube:${entry.id}`);
      let title = entry.title;
      let titleSource = 'custom';
      if (!title && !['custom', 'fallback'].includes(saved?.title_source) && typeof saved?.title === 'string' && saved.title.trim()) { title = saved.title; titleSource = saved.title_source || 'youtube'; }
      if (!title && !options.offline) {
        try { title = await lookup(entry.id); if (typeof title !== 'string' || !title.trim() || title.length > 200) throw new Error('Invalid title'); titleSource = 'youtube'; }
        catch { title = null; }
      }
      if (!title) { title = 'Roblox video demo'; titleSource = 'fallback'; }
      const item = {type: 'youtube', ...entry, title, title_source: titleSource, description: entry.description || '', hidden: entry.hidden === true};
      items.push(item);
      if (entry.featured === true) markers.push(identity(item));
    }
    items.sort((a, b) => (a.order ?? 1_000_001) - (b.order ?? 1_000_001));
    const eligible = items.filter(item => !item.hidden && item.featured !== false);
    const eligibleKeys = new Set(eligible.map(identity));
    const featured = [...markers].reverse().find(key => eligibleKeys.has(key)) || (eligible[0] && identity(eligible[0]));
    const categoryCache = new Map((Array.isArray(previous[category]) ? previous[category] : []).filter(record).map(item => [identity(item), item]));
    const preserved = new Map();
    for (const item of items) {
      const saved = categoryCache.get(identity(item)) || cache.get(identity(item));
      if (typeof saved?.slug === 'string' && saved.slug.length && !/[\x00-\x1f]/.test(saved.slug)) preserved.set(identity(item), saved.slug);
    }
    const reserved = new Map([...preserved].map(([key, slug]) => [slug, key]));
    const usedSlugs = new Set();
    for (const item of items) {
      const key = identity(item);
      const base = preserved.get(key) || item.id || slugify(item.title);
      let slug = base, suffix = 2;
      while (usedSlugs.has(slug) || reserved.has(slug) && reserved.get(slug) !== key) slug = `${base}-${suffix++}`;
      usedSlugs.add(slug);
      item.slug = slug;
      item.featured = key === featured;
    }
    manifest[category] = items;
  }
  await atomicJSON(root, 'portfolio.json', manifest);
  return manifest;
}

async function safeRemoveBuildFolder(root, target) {
  if (path.dirname(target) !== root || !path.basename(target).startsWith('.portfolio-build-')) error('build', 'refusing to remove an unexpected directory');
  const status = await statOrNull(target);
  if (status?.isSymbolicLink()) error('build', 'temporary output must not be a link');
  if (status) await fs.rm(target, {recursive: true, force: true});
}

async function build(root, options = {}) {
  root = await fs.realpath(path.resolve(root));
  const destination = path.join(root, '_site');
  const existing = await statOrNull(destination);
  if (existing?.isSymbolicLink()) error('_site', 'symbolic links are not allowed for build output');
  if (existing && !existing.isDirectory()) error('_site', 'build output must be a regular directory');
  const manifest = await generate(root, options);
  const staging = await fs.mkdtemp(path.join(root, '.portfolio-build-'));
  const backup = `${staging}-previous`;
  let movedPrevious = false;
  try {
    for (const filename of PUBLIC_FILES) {
      const source = path.join(root, filename);
      const status = await statOrNull(source);
      if (status?.isFile() && !status.isSymbolicLink()) await fs.copyFile(source, path.join(staging, filename));
    }
    for (const folder of ASSET_FOLDERS) {
      for (const source of await walk(path.join(root, 'assets', folder), root)) {
        if (!ASSETS.has(path.extname(source).toLowerCase())) continue;
        const target = path.join(staging, path.relative(root, source));
        await fs.mkdir(path.dirname(target), {recursive: true});
        await fs.copyFile(source, target);
      }
    }
    if (existing) { await fs.rename(destination, backup); movedPrevious = true; }
    try { await fs.rename(staging, destination); }
    catch (failure) { if (movedPrevious) { await fs.rename(backup, destination); movedPrevious = false; } throw failure; }
    if (movedPrevious) await safeRemoveBuildFolder(root, backup);
    return manifest;
  } finally { await safeRemoveBuildFolder(root, staging); }
}

module.exports = {generate, build, youtubeId, parseVideoEntry, validateConfig, PUBLIC_FILES, MEDIA, ASSETS};

if (require.main === module) {
  const args = process.argv.slice(2);
  const rootFlag = args.indexOf('--root');
  const root = rootFlag < 0 ? path.resolve(__dirname, '..') : args[rootFlag + 1];
  if (!root || args.some((value, index) => !['--root', '--build', '--offline'].includes(value) && !(rootFlag >= 0 && index === rootFlag + 1))) {
    console.error('Usage: node scripts/portfolio.cjs [--build] [--offline] [--root PATH]');
    process.exitCode = 1;
  } else {
    const action = args.includes('--build') ? build : generate;
    action(root, {offline: args.includes('--offline'), onWarning: message => console.warn(message)}).then(manifest => {
      console.log(`Updated portfolio: ${Object.values(manifest).reduce((total, items) => total + items.length, 0)} projects.`);
      if (args.includes('--build')) console.log('Public website built in _site.');
    }).catch(failure => { console.error(`Portfolio update stopped: ${failure.message}`); process.exitCode = 1; });
  }
}
