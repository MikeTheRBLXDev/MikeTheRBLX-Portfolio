'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const PUBLIC_FILES = new Set([
  'index.html', 'portfolio.html', 'contact.html', 'tos.html',
  'styles.css', 'site.js', 'portfolio.js', 'portfolio.json', 'sitemap.xml', 'robots.txt',
]);
const MEDIA_TYPES = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.avif': 'image/avif',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.ogg': 'video/ogg',
  '.mov': 'video/quicktime', '.m4v': 'video/x-m4v', '.ico': 'image/x-icon',
};
const TYPES = { ...MEDIA_TYPES, '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8', '.txt': 'text/plain; charset=utf-8' };

function publicPath(requestUrl) {
  let name;
  try { name = decodeURIComponent((requestUrl || '/').split(/[?#]/, 1)[0]); }
  catch { return null; }
  if (!name.startsWith('/') || name.startsWith('//') || /[\\\0]/.test(name)) return null;
  if (name === '/') name = '/index.html';
  const parts = name.slice(1).split('/');
  if (parts.some(part => !part || part === '.' || part === '..')) return null;
  const relative = parts.join('/');
  if (PUBLIC_FILES.has(relative) || /^google[a-z0-9]+\.html$/i.test(relative)) return relative;
  if (parts.length >= 3 && parts[0] === 'assets' && ['UI', 'Scripting', 'NormalAssets'].includes(parts[1])
      && MEDIA_TYPES[path.extname(relative).toLowerCase()]) return relative;
  return null;
}

function createServer(root) {
  const directory = fs.realpathSync(path.resolve(root));
  return http.createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    const fail = (status, message) => {
      response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end(request.method === 'HEAD' ? undefined : message);
    };
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.setHeader('Allow', 'GET, HEAD');
      fail(405, 'Method not allowed.');
      return;
    }
    const relative = publicPath(request.url);
    if (!relative) { fail(404, 'Not found.'); return; }
    let handle;
    try {
      // Check every component: asset directories must not link to private files.
      let current = directory;
      for (const part of relative.split('/')) {
        current = path.join(current, part);
        if ((await fs.promises.lstat(current)).isSymbolicLink()) { fail(404, 'Not found.'); return; }
      }
      const actual = await fs.promises.realpath(current);
      const fromRoot = path.relative(directory, actual);
      if (!fromRoot || fromRoot.startsWith(`..${path.sep}`) || fromRoot === '..' || path.isAbsolute(fromRoot)) {
        fail(404, 'Not found.'); return;
      }
      handle = await fs.promises.open(actual, 'r');
      const stat = await handle.stat();
      if (!stat.isFile()) { fail(404, 'Not found.'); return; }
      const headers = { 'Content-Type': TYPES[path.extname(actual).toLowerCase()] || 'application/octet-stream',
        'Accept-Ranges': 'bytes', 'Content-Length': stat.size };
      let start = 0;
      let end = stat.size - 1;
      let status = 200;
      if (request.headers.range) {
        const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range);
        if (!range || (!range[1] && !range[2])) { fail(416, 'Requested range is not available.'); return; }
        if (!range[1]) start = Math.max(0, stat.size - Number(range[2]));
        else start = Number(range[1]);
        if (range[1] && range[2]) end = Math.min(end, Number(range[2]));
        if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= stat.size) {
          response.setHeader('Content-Range', `bytes */${stat.size}`);
          fail(416, 'Requested range is not available.'); return;
        }
        status = 206;
        headers['Content-Length'] = end - start + 1;
        headers['Content-Range'] = `bytes ${start}-${end}/${stat.size}`;
      }
      response.writeHead(status, headers);
      if (request.method === 'HEAD' || stat.size === 0) { response.end(); return; }
      const stream = handle.createReadStream({ start, end, autoClose: false });
      await new Promise((resolve, reject) => {
        stream.once('error', reject);
        response.once('finish', resolve);
        response.once('close', () => { stream.destroy(); resolve(); });
        stream.pipe(response);
      });
    } catch (error) {
      if (!response.headersSent) fail(error.code === 'ENOENT' || error.code === 'ENOTDIR' ? 404 : 500,
        error.code === 'ENOENT' || error.code === 'ENOTDIR' ? 'Not found.' : 'Could not read this file.');
      else response.destroy();
    } finally { if (handle) await handle.close().catch(() => {}); }
  });
}

if (require.main === module) {
  const args = process.argv.slice(2);
  let root = path.resolve(__dirname, '..');
  let port = 4173;
  try {
    for (let index = 0; index < args.length; index += 1) {
      if (args[index] === '--root' && args[index + 1]) root = path.resolve(args[++index]);
      else if (args[index] === '--port' && args[index + 1]) port = Number(args[++index]);
      else throw new Error(`Unknown or incomplete option: ${args[index]}`);
    }
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Port must be from 1 to 65535.');
    const server = createServer(root);
    server.on('error', error => { console.error(`Preview stopped: ${error.message}`); process.exitCode = 1; });
    server.listen(port, '127.0.0.1', () => {
      console.log(`Open http://127.0.0.1:${port} in your browser.`);
      console.log('Keep this window open while previewing. Press Ctrl+C to stop.');
    });
  } catch (error) { console.error(`Preview stopped: ${error.message}`); process.exitCode = 1; }
}

module.exports = { createServer, publicPath };
