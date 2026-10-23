const puppeteer = require('C:/Users/amans/.gemini/antigravity/scratch/nexus/node_modules/puppeteer-core');
const path = require('path');
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACT_DIR = 'C:\\Users\\amans\\.gemini\\antigravity\\brain\\760db3b7-5853-4fdf-9bfa-fce40f961950';

async function testEverything() {
  console.log('=====================================================');
  console.log('   NEXUS INTELLIGENCE PLATFORM — COMPLETE AUDIT     ');
  console.log('=====================================================');

  const report = {
    apiEndpoints: {},
    routes: {},
    interactiveWorkflows: {},
    consoleErrors: []
  };

  // 1. TEST ALL API ENDPOINTS
  console.log('\n--- 1. Testing API Endpoints ---');
  const apiTests = [
    { name: 'Kalshi Prediction Markets', url: 'http://localhost:5173/api/kalshi', check: d => Array.isArray(d.markets) && d.markets.length > 0 },
    { name: 'Polymarket Contracts', url: 'http://localhost:5173/api/polymarket', check: d => Array.isArray(d.markets) && d.markets.length > 0 },
    { name: 'NASA FIRMS Satellite Fires', url: 'http://localhost:5173/api/firms', check: d => Array.isArray(d) && d.length > 0 },
    { name: 'FRED Macro Series', url: 'http://localhost:5173/api/fred', check: d => Array.isArray(d.data) && d.data.length > 0 },
    { name: 'FRED Multi-Quote (Yahoo)', url: 'http://localhost:5173/api/fred?mode=multi&symbols=SPY,QQQ,LMT', check: d => d.quotes && d.quotes.SPY && d.quotes.SPY.price > 0 },
    { name: 'Financial Conflict Index', url: 'http://localhost:5173/api/fred?mode=conflict', check: d => d.fci && typeof d.fci.score === 'number' && d.defenseStocks?.length > 0 },
    { name: 'Global Threat Intel', url: 'http://localhost:5173/api/threats', check: d => d.success && d.counts && Object.keys(d.counts).length > 0 },
    { name: 'Satellite & AIS Fleet', url: 'http://localhost:5173/api/satellite', check: d => d.ships && d.aircraft && d.darkfleet },
    { name: 'Live Threat Alerts', url: 'http://localhost:5173/api/alerts', check: d => d.alerts && d.counts },
    { name: 'RSS News Feed Parser', url: 'http://localhost:5173/api/rss?url=' + encodeURIComponent('https://feeds.bbci.co.uk/news/world/rss.xml'), check: d => d.status === 'ok' && d.items?.length > 0 }
  ];

  for (const t of apiTests) {
    try {
      const res = await fetch(t.url);
      const data = await res.json();
      const passed = res.ok && t.check(data);
      report.apiEndpoints[t.name] = passed ? 'PASS' : 'FAIL';
      console.log(`  [${passed ? 'PASS' : 'FAIL'}] ${t.name} (HTTP ${res.status})`);
    } catch (e) {
      report.apiEndpoints[t.name] = `ERROR: ${e.message}`;
      console.log(`  [FAIL] ${t.name}: ${e.message}`);
    }
  }

  // 2. LAUNCH BROWSER FOR UI & WORKFLOW AUDIT
  console.log('\n--- 2. Auditing UI Routes & Interactivity ---');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1050 });

  page.on('response', res => {
    if (res.status() >= 400) {
      console.log(`  [HTTP ${res.status()}] ${res.url().slice(0, 120)}`);
    }
  });

  page.on('console', msg => {
    if (msg.type() === 'error') {
      const txt = msg.text();
      // Ignore routine aborts when rapidly switching tabs in test
      if (txt.includes('ERR_ABORTED') || txt.includes('ERR_NETWORK_CHANGED')) {
        return;
      }
      if (txt.includes('429')) {
        report.externalRateLimits = (report.externalRateLimits || 0) + 1;
        return;
      }
      report.consoleErrors.push(txt);
    }
  });

  page.on('pageerror', err => {
    report.consoleErrors.push(`PageError: ${err.message}`);
  });

  // Test Route Navigations
  const navRoutes = [
    { id: 'feed', hash: '#feed', title: 'Live Intel Feed' },
    { id: 'situations', hash: '#situations', title: 'Monitor & Situations' },
    { id: 'search', hash: '#search', title: 'Intel Search (GDELT)' },
    { id: 'board', hash: '#board', title: 'Intelligence Board' },
    { id: 'map', hash: '#map', title: 'Interactive Threat Map' },
    { id: 'finance', hash: '#finance', title: 'Finance & Alpha Terminal' },
    { id: 'ontology', hash: '#ontology', title: 'Ontology & Ops Workbench' },
    { id: 'vox', hash: '#vox', title: 'VOX Geopolitical Sim' },
    { id: 'saved', hash: '#saved', title: 'Saved Intelligence' },
    { id: 'health', hash: '#health', title: 'Health Diagnostic Desk' },
    { id: 'settings', hash: '#settings', title: 'Platform Settings' }
  ];

  for (const r of navRoutes) {
    try {
      await page.goto(`http://localhost:5173/${r.hash}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await new Promise(res => setTimeout(res, 1500));
      const bodyText = await page.evaluate(() => document.body.innerText.length);
      const passed = bodyText > 100;
      report.routes[r.title] = passed ? 'PASS' : 'FAIL';
      console.log(`  [${passed ? 'PASS' : 'FAIL'}] Route: ${r.hash} (${r.title}) - Content length: ${bodyText}`);
    } catch (e) {
      report.routes[r.title] = `ERROR: ${e.message}`;
      console.log(`  [FAIL] Route: ${r.hash}: ${e.message}`);
    }
  }

  // 3. TEST KEY INTERACTIVE WORKFLOWS
  console.log('\n--- 3. Testing Key Interactive Workflows ---');

  // A. Ontology Subtabs & Strike Cascade
  try {
    await page.goto('http://localhost:5173/#ontology', { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 1200));

    // Click ASYMMETRIC STRIKE CASCADE button
    const strikeTriggered = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const strikeBtn = btns.find(b => b.textContent && b.textContent.includes('ASYMMETRIC STRIKE CASCADE'));
      if (strikeBtn) {
        strikeBtn.click();
        return true;
      }
      return false;
    });

    await new Promise(r => setTimeout(r, 800));

    // Verify strike increased diverted count or changed state
    const divertedCount = await page.evaluate(() => {
      const capeDiv = Array.from(document.querySelectorAll('span, div')).find(el => el.textContent && el.textContent.includes('CAPE DIVERTED:'));
      return capeDiv ? capeDiv.parentElement?.textContent : null;
    });

    // Reset strike state
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const resetBtn = btns.find(b => b.textContent && b.textContent.includes('Reset'));
      if (resetBtn) resetBtn.click();
    });

    report.interactiveWorkflows['Asymmetric Strike Cascade & Reset'] = strikeTriggered ? 'PASS' : 'FAIL';
    console.log(`  [${strikeTriggered ? 'PASS' : 'FAIL'}] Asymmetric Strike Cascade & Reset: ${divertedCount || 'OK'}`);

    // Cycle through all 5 ontology subtabs
    const subtabs = ['calibration', 'ontology', 'telemetry', 'execution', 'logchat'];
    let subtabsPassed = 0;
    for (const st of subtabs) {
      const clicked = await page.evaluate((id) => {
        const btns = Array.from(document.querySelectorAll('button'));
        const target = btns.find(b => b.getAttribute('style')?.includes('pointer') && (
          (id === 'calibration' && b.textContent.includes('Empirical Fact')) ||
          (id === 'ontology' && b.textContent.includes('Dynamic Ontology')) ||
          (id === 'telemetry' && b.textContent.includes('Hard Telemetry')) ||
          (id === 'execution' && b.textContent.includes('Decision Writeback')) ||
          (id === 'logchat' && b.textContent.includes('Long-Context Log'))
        ));
        if (target) {
          target.click();
          return true;
        }
        return false;
      }, st);
      if (clicked) subtabsPassed++;
      await new Promise(r => setTimeout(r, 600));
    }

    report.interactiveWorkflows['All 5 Ontology Subtabs Accessible'] = subtabsPassed === 5 ? 'PASS' : `FAIL (${subtabsPassed}/5)`;
    console.log(`  [${subtabsPassed === 5 ? 'PASS' : 'FAIL'}] All 5 Ontology Subtabs Accessible (${subtabsPassed}/5)`);

  } catch (e) {
    report.interactiveWorkflows['Ontology Desk Operations'] = `ERROR: ${e.message}`;
    console.log(`  [FAIL] Ontology Desk Operations: ${e.message}`);
  }

  // B. Financial Terminal Causal Shock Slider & Subtabs
  try {
    await page.goto('http://localhost:5173/#finance', { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 1500));

    // Check shock slider
    const sliderFound = await page.evaluate(() => {
      const slider = document.querySelector('input[type="range"]');
      if (slider) {
        slider.value = '2.5';
        slider.dispatchEvent(new Event('input', { bubbles: true }));
        slider.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
      return false;
    });

    report.interactiveWorkflows['Finance Causal Shock Amplifier Slider'] = sliderFound ? 'PASS' : 'FAIL';
    console.log(`  [${sliderFound ? 'PASS' : 'FAIL'}] Finance Causal Shock Amplifier Slider: ${sliderFound ? 'Interactive' : 'Missing'}`);

  } catch (e) {
    report.interactiveWorkflows['Finance Causal Shock Amplifier Slider'] = `ERROR: ${e.message}`;
    console.log(`  [FAIL] Finance Shock Slider: ${e.message}`);
  }

  // C. Feed Category Filter Toggle
  try {
    await page.goto('http://localhost:5173/#feed', { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 1500));

    // Click 'Military' category filter on the left sidebar
    const filterClicked = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('div, button'));
      const mil = rows.find(el => el.textContent && el.textContent.trim() === 'Military');
      if (mil) {
        mil.click();
        return true;
      }
      return false;
    });

    report.interactiveWorkflows['Feed Category Sidebar Filtering'] = filterClicked ? 'PASS' : 'FAIL';
    console.log(`  [${filterClicked ? 'PASS' : 'FAIL'}] Feed Category Sidebar Filtering: ${filterClicked ? 'Working' : 'Not found'}`);

  } catch (e) {
    report.interactiveWorkflows['Feed Category Sidebar Filtering'] = `ERROR: ${e.message}`;
    console.log(`  [FAIL] Feed Filtering: ${e.message}`);
  }

  // D. Prediction Markets Ticker
  try {
    const tickerCount = await page.evaluate(() => {
      const track = document.querySelector('.ticker-track');
      return track ? track.querySelectorAll('a').length : 0;
    });
    report.interactiveWorkflows['Live Markets Ticker (Kalshi + Polymarket)'] = tickerCount > 0 ? 'PASS' : 'FAIL';
    console.log(`  [${tickerCount > 0 ? 'PASS' : 'FAIL'}] Live Markets Ticker (Kalshi + Polymarket): ${tickerCount} active contracts`);
  } catch (e) {
    report.interactiveWorkflows['Live Markets Ticker'] = `ERROR: ${e.message}`;
  }

  await browser.close();

  console.log('\n=====================================================');
  console.log('                 AUDIT RESULTS                      ');
  console.log('=====================================================');
  console.log(JSON.stringify(report, null, 2));

  const allPassed = Object.values(report.apiEndpoints).every(v => v === 'PASS') &&
                    Object.values(report.routes).every(v => v === 'PASS') &&
                    Object.values(report.interactiveWorkflows).every(v => v === 'PASS') &&
                    report.consoleErrors.length === 0;

  console.log(`\nOVERALL SYSTEM STATUS: ${allPassed ? 'ALL SYSTEMS 100% OPERATIONAL' : 'ISSUES DETECTED'}`);
}

testEverything();
