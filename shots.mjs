import { createServer } from 'node:http';
import { createReadStream, statSync, readFileSync, mkdirSync } from 'node:fs';
import { resolve, join, normalize, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const appRoot = resolve(__dirname, 'app');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

const server = createServer((req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    let pathname = decodeURIComponent(url.pathname);
    if (pathname.endsWith('/')) pathname += 'index.html';
    const filePath = resolve(join(appRoot, normalize(pathname)));
    if (filePath !== appRoot && !filePath.startsWith(appRoot + sep)) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    const stats = statSync(filePath);
    if (!stats.isFile()) {
      res.writeHead(404).end('Not Found');
      return;
    }
    const ext = extname(filePath).toLowerCase();
    const contentType = MIME[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    createReadStream(filePath).pipe(res);
  } catch {
    res.writeHead(404).end('Not Found');
  }
});

function getJpegDimensions(buffer) {
  let offset = 2;
  while (offset < buffer.length) {
    const marker = buffer.readUInt16BE(offset);
    const length = buffer.readUInt16BE(offset + 2);
    if (marker >= 0xFFC0 && marker <= 0xFFC3) {
      const height = buffer.readUInt16BE(offset + 5);
      const width = buffer.readUInt16BE(offset + 7);
      return { width, height };
    }
    offset += 2 + length;
  }
  return { width: 0, height: 0 };
}

async function run() {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 8080;
  const baseUrl = `http://127.0.0.1:${port}`;

  const requireFromTools = createRequire('/home/hatch/workspace/tools/shots/package.json');
  const { chromium } = requireFromTools('playwright-core');

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const shotsConfig = JSON.parse(readFileSync(resolve(__dirname, 'shots.json'), 'utf-8'));
  mkdirSync(resolve(__dirname, 'screenshots'), { recursive: true });

  let hasExternalRequests = false;
  let hasErrors = false;
  let timedOut = false;
  const shotResults = [];

  for (const shot of shotsConfig) {
    const context = await browser.newContext({
      viewport: shot.viewport
    });
    const page = await context.newPage();

    const requests = [];
    page.on('request', req => {
      requests.push(req.url());
      try {
        const u = new URL(req.url());
        if (u.hostname !== 'localhost' && u.hostname !== '127.0.0.1') {
          hasExternalRequests = true;
          console.error(`External request detected: ${req.url()}`);
        }
      } catch {
        hasExternalRequests = true;
      }
    });

    page.on('console', msg => {
      if (msg.type() === 'error') {
        hasErrors = true;
        console.error(`Console error: ${msg.text()}`);
      }
    });

    page.on('pageerror', err => {
      hasErrors = true;
      console.error(`Page error: ${err.message}`);
    });

    try {
      await page.goto(`${baseUrl}${shot.path}`, { waitUntil: 'domcontentloaded' });

      // Wait until the browser indicates page readiness
      let ready = false;
      for (let attempt = 0; attempt < 150; attempt++) {
        ready = await page.evaluate(() => window.__shotReady === true);
        if (ready) break;
        await new Promise(r => setTimeout(r, 100));
      }

      if (!ready) {
        timedOut = true;
        console.error(`Shot ${shot.file} timed out waiting for __shotReady`);
      }

      let applied = false;
      for (let attempt = 0; attempt < 150; attempt++) {
        applied = await page.evaluate(() => window.__shotApplied === true);
        if (applied) break;
        await new Promise(r => setTimeout(r, 100));
      }

      if (!applied) {
        timedOut = true;
        console.error(`Shot ${shot.file} timed out waiting for __shotApplied`);
      }

      await new Promise(r => setTimeout(r, 300));

      const outPath = resolve(__dirname, 'screenshots', shot.file);
      await page.screenshot({ path: outPath, type: 'jpeg', quality: 82 });

      const buf = readFileSync(outPath);
      const dims = getJpegDimensions(buf);
      shotResults.push({
        file: shot.file,
        size: buf.length,
        width: dims.width,
        height: dims.height
      });
    } catch (err) {
      hasErrors = true;
      console.error(`Error capturing ${shot.file}:`, err);
    } finally {
      await context.close();
    }
  }

  // Extra tracker proof
  const proofContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const proofPage = await proofContext.newPage();

  proofPage.on('request', req => {
    try {
      const u = new URL(req.url());
      if (u.hostname !== 'localhost' && u.hostname !== '127.0.0.1') {
        hasExternalRequests = true;
      }
    } catch {
      hasExternalRequests = true;
    }
  });

  proofPage.on('console', msg => {
    if (msg.type() === 'error') hasErrors = true;
  });
  proofPage.on('pageerror', () => { hasErrors = true; });

  try {
    await proofPage.goto(`${baseUrl}/index.html`, { waitUntil: 'domcontentloaded' });
    let ready = false;
    for (let i = 0; i < 150; i++) {
      ready = await proofPage.evaluate(() => window.__shotReady === true);
      if (ready) break;
      await new Promise(r => setTimeout(r, 100));
    }
    if (!ready) {
      console.error('Proof page timed out waiting for ready');
      hasErrors = true;
    }

    // Click checkbox of first trophy row
    const checkboxSelector = '#trophy-list .trophy-row input[type="checkbox"]';
    await proofPage.click(checkboxSelector);

    // Reload page
    await proofPage.reload({ waitUntil: 'domcontentloaded' });
    for (let i = 0; i < 150; i++) {
      ready = await proofPage.evaluate(() => window.__shotReady === true);
      if (ready) break;
      await new Promise(r => setTimeout(r, 100));
    }

    const isCheckedAfterReload = await proofPage.$eval(checkboxSelector, el => el.checked);
    if (!isCheckedAfterReload) {
      console.error('Proof failure: trophy not checked after reload');
      hasErrors = true;
    }

    // Export
    const downloadPromise = proofPage.waitForEvent('download', { timeout: 10000 });
    await proofPage.click('#export-btn');
    const download = await downloadPromise;
    const downloadPath = await download.path();

    // Clear localStorage
    await proofPage.evaluate(() => localStorage.clear());

    // Import
    await proofPage.setInputFiles('#import-input', downloadPath);
    await new Promise(r => setTimeout(r, 800));

    const isCheckedAfterImport = await proofPage.$eval(checkboxSelector, el => el.checked);
    if (!isCheckedAfterImport) {
      console.error('Proof failure: trophy not checked after import');
      hasErrors = true;
    }
  } catch (err) {
    console.error('Tracker proof error:', err);
    hasErrors = true;
  } finally {
    await proofContext.close();
    await browser.close();
    server.close();
  }

  if (hasExternalRequests || hasErrors || timedOut) {
    console.error('Validation failed: external requests, errors, or timeouts encountered.');
    process.exit(1);
  }

  for (const res of shotResults) {
    console.log(`${res.file}, size: ${res.size} bytes, dimensions: ${res.width}x${res.height}`);
  }
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
