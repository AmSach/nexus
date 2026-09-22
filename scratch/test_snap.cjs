const puppeteer = require('C:/Users/amans/.gemini/antigravity/scratch/nexus/node_modules/puppeteer-core');
const path = require('path');
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACTS_DIR = 'C:\\Users\\amans\\.gemini\\antigravity\\brain\\760db3b7-5853-4fdf-9bfa-fce40f961950';

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--disable-background-timer-throttling'
    ]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  console.log('Navigating directly to https://osnexus.vercel.app ...');
  await page.goto('https://osnexus.vercel.app', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await new Promise(r => setTimeout(r, 2000));

  console.log('Clicking Finance & Alpha tab...');
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const btn = btns.find(b => b.textContent.includes('Finance') || b.textContent.includes('Alpha'));
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 3000));

  const textContent = await page.evaluate(() => document.body.innerText.slice(0, 400));
  console.log('Body text sample:', textContent.replace(/\s+/g, ' '));

  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'live-test-finance.png') });
  console.log('Screenshot saved: live-test-finance.png');

  await browser.close();
})().catch(console.error);
