#!/usr/bin/env node
// Renders scene.html frame by frame in headless Chromium (WebGL) and encodes with ffmpeg.
//   node render.js --preview 1.5 8.5 ...   -> preview_<t>.jpg
//   node render.js                         -> money_10k_1month_silent.mp4 (then mix.py adds audio)
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

const ROOT = __dirname;
const FPS = 30;
const WORKERS = parseInt(process.env.WORKERS || '3', 10);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.woff2': 'font/woff2', '.woff': 'font/woff' };

function serve() {
  return new Promise((res) => {
    const srv = http.createServer((req, rsp) => {
      const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
      if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { rsp.writeHead(404); return rsp.end(); }
      rsp.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
      fs.createReadStream(p).pipe(rsp);
    });
    srv.listen(0, '127.0.0.1', () => res(srv));
  });
}

async function openPage(browser, port) {
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  page.on('pageerror', (e) => console.error('pageerror', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.error('console', m.text()); });
  await page.goto(`http://127.0.0.1:${port}/scene.html`);
  await page.waitForFunction(() => window.READY || window.ERR, null, { timeout: 120000 });
  const err = await page.evaluate(() => window.ERR);
  if (err) throw new Error(err);
  return page;
}

const frame = async (page, t) => Buffer.from((await page.evaluate((t) => window.renderFrame(t), t)).split(',')[1], 'base64');

(async () => {
  const srv = await serve();
  const port = srv.address().port;
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const args = process.argv.slice(2);
  if (args[0] === '--preview') {
    const page = await openPage(browser, port);
    for (const t of args.slice(1)) {
      const t0 = Date.now();
      fs.writeFileSync(path.join(ROOT, 'previews', `preview_${t}.jpg`), await frame(page, parseFloat(t)));
      console.log('frame', t, Date.now() - t0, 'ms');
    }
  } else {
    const END = 58.2;
    const N = Math.round(END * FPS);
    const per = Math.ceil(N / WORKERS);
    const tStart = Date.now();
    let done = 0;
    await Promise.all([...Array(WORKERS).keys()].map(async (w) => {
      const a = w * per, b = Math.min(N, a + per);
      const page = await openPage(browser, port);
      const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
        '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p', path.join(ROOT, 'build', `part${w}.mp4`)], { stdio: ['pipe', 'inherit', 'inherit'] });
      for (let f = a; f < b; f++) {
        const buf = await frame(page, f / FPS);
        if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
        if (++done % 60 === 0) console.log(`${done}/${N} frames, ${((Date.now() - tStart) / 1000).toFixed(0)}s`);
      }
      ff.stdin.end();
      await new Promise((r) => ff.on('close', r));
    }));
    fs.writeFileSync(path.join(ROOT, 'build', 'parts.txt'), [...Array(WORKERS).keys()].map((w) => `file 'part${w}.mp4'`).join('\n'));
    await new Promise((r) => spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', path.join(ROOT, 'build', 'parts.txt'), '-c', 'copy', path.join(ROOT, 'build', 'silent.mp4')], { stdio: 'inherit' }).on('close', r));
    console.log('done in', ((Date.now() - tStart) / 1000).toFixed(0), 's');
  }
  await browser.close();
  srv.close();
})().catch((e) => { console.error(e); process.exit(1); });
