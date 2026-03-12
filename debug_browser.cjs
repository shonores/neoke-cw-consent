const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  page.on('console', msg => {
    if (msg.type() === 'error' || msg.type() === 'warning' || msg.text().includes('[neoke')) {
      console.log(`[BROWSER ${msg.type().toUpperCase()}] ${msg.text()}`);
    }
  });

  page.on('pageerror', err => {
    console.error('[BROWSER EXCEPTION]', err.message);
  });

  try {
    console.log('Navigating to local dev server...');
    await page.goto('http://localhost:5173/');
    
    // Wait for the node input
    await page.waitForSelector('input[type="text"]', { timeout: 5000 });
    await page.type('input[type="text"]', 'b2b-poc');
    await page.keyboard.press('Enter');
    
    // Wait for API key input
    await page.waitForSelector('input[type="password"]', { timeout: 5000 });
    await page.waitForTimeout(500); // slight animation wait
    await page.type('input[type="password"]', 'dk_Uz4O7Vty17NZot4hdu5RIegRJnQUkeF3nmjNnXGbSOE');
    await page.keyboard.press('Enter');
    
    console.log('Waiting for dashboard to load and logs to appear...');
    await page.waitForTimeout(5000);
    
  } catch (err) {
    console.error('Error driving browser:', err);
  } finally {
    await browser.close();
  }
})();
