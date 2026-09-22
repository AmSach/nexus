const puppeteer = require('C:/Users/amans/.gemini/antigravity/scratch/nexus/node_modules/puppeteer-core');
const path = require('path');
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACTS_DIR = 'C:\\Users\\amans\\.gemini\\antigravity\\brain\\760db3b7-5853-4fdf-9bfa-fce40f961950';

(async () => {
  console.log('1. Launching Chrome with SwiftShader & fresh cache...');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding'
    ]
  });

  const page = await browser.newPage();
  await page.setCacheEnabled(false);
  await page.setViewport({ width: 1440, height: 900 });

  const freshUrl = 'https://osnexus.vercel.app/?t=' + Date.now();
  console.log('2. Navigating to:', freshUrl);
  await page.goto(freshUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await new Promise(r => setTimeout(r, 3000));

  console.log('3. Clicking Finance & Alpha in sidebar...');
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const btn = btns.find(b => b.textContent.includes('Finance') || b.textContent.includes('Alpha'));
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 2500));

  console.log('4. Capturing live-macro-chokepoints.png...');
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'live-macro-chokepoints.png') });
  console.log('-> Saved live-macro-chokepoints.png');

  console.log('5. Clicking Correlations sub-tab...');
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const btn = btns.find(b => b.textContent.includes('Correlations'));
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 1500));
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'live-macro-correlations.png') });
  console.log('-> Saved live-macro-correlations.png');

  console.log('6. Clicking Alpha Desk sub-tab...');
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const btn = btns.find(b => b.textContent.includes('Alpha Desk'));
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 1500));
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'live-macro-alpha.png') });
  console.log('-> Saved live-macro-alpha.png');

  console.log('7. Clicking Stress-Test sub-tab...');
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const btn = btns.find(b => b.textContent.includes('Stress-Test'));
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 1500));
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'live-macro-stress.png') });
  console.log('-> Saved live-macro-stress.png');

  console.log('8. Switching to View Mode tab...');
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const btn = btns.find(b => b.textContent.trim() === 'View Mode');
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 2500));
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'live-viewmode-optimized.png') });
  console.log('-> Saved live-viewmode-optimized.png');

  console.log('9. Switching to Map tab...');
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const btn = btns.find(b => b.textContent.trim() === 'Map');
    if (btn) btn.click();
  });
  await page.waitForSelector('canvas', { timeout: 15000 });
  await new Promise(r => setTimeout(r, 2500));

  console.log('10. Opening Actionable Intel panel...');
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const btn = btns.find(b => b.textContent.includes('ACTIONABLE INTEL'));
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 1500));

  console.log('11. Switching to Economic tab in Actionable Intel...');
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const btn = btns.find(b => b.textContent.includes('Economic'));
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 1500));
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'live-globe-economic.png') });
  console.log('-> Saved live-globe-economic.png');

  console.log('ALL VERIFICATION COMPLETE!');
  await browser.close();
})().catch(err => {
  console.error('Fatal verification error:', err);
  process.exit(1);
});
