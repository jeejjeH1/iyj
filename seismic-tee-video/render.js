// Deterministic frame renderer: drives index.html in headless Chromium and captures each frame.
// usage:
//   node render.js stills 1.5,8,15 work/prev          -> PNG stills at given times
//   node render.js frames <start> <end> <dir> [fps]   -> numbered JPEG frames [start, end)
const { chromium } = require(process.env.PW || '/opt/node22/lib/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path');

const root = __dirname;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.otf': 'font/otf', '.css': 'text/css' };

(async () => {
  const [mode, a1, a2, a3, a4] = process.argv.slice(2);
  const srv = http.createServer((q, r) => {
    const f = path.join(root, decodeURIComponent(q.url.split('?')[0]));
    fs.readFile(f, (e, d) => {
      if (e) { r.writeHead(404); r.end(); return; }
      r.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' });
      r.end(d);
    });
  });
  await new Promise((res) => srv.listen(0, res));
  const port = srv.address().port;
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--font-render-hinting=none'] });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('console:', m.text()); });
  page.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
  await page.goto(`http://localhost:${port}/index.html`);
  await page.waitForFunction('window.ready === true', null, { timeout: 60000 });
  const cdp = await page.context().newCDPSession(page);
  const grab = async (file, jpeg) => {
    const { data } = await cdp.send('Page.captureScreenshot', jpeg ? { format: 'jpeg', quality: 94, optimizeForSpeed: true } : { format: 'png', optimizeForSpeed: true });
    fs.writeFileSync(file, Buffer.from(data, 'base64'));
  };
  const renderAt = (t) => page.evaluate((t) => { window.renderAt(t); const g = document.getElementById('c').getContext('webgl2'); const px = new Uint8Array(4); g.readPixels(0, 0, 1, 1, g.RGBA, g.UNSIGNED_BYTE, px); }, t);

  if (mode === 'stills') {
    const times = a1.split(',').map(Number);
    fs.mkdirSync(a2, { recursive: true });
    // warm-up so scene-local history (none expected) and shaders compile
    await renderAt(0);
    for (const t of times) {
      const t0 = Date.now();
      await renderAt(t);
      await grab(path.join(a2, `t${t.toFixed(2)}.png`), false);
      console.log('still', t, Date.now() - t0, 'ms');
    }
  } else if (mode === 'frames') {
    const start = +a1, end = +a2, dir = a3, fps = +(a4 || 30);
    fs.mkdirSync(dir, { recursive: true });
    const t0 = Date.now();
    for (let f = start; f < end; f++) {
      const file = path.join(dir, `f${String(f).padStart(5, '0')}.jpg`);
      if (fs.existsSync(file)) continue;
      await renderAt(f / fps);
      await grab(file + '.tmp', true);
      fs.renameSync(file + '.tmp', file);
      if ((f - start) % 30 === 0) console.log(`frame ${f}/${end} ${((Date.now() - t0) / (f - start + 1)).toFixed(0)} ms/frame`);
    }
  }
  await browser.close();
  srv.close();
})();
