
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

(async () => {
    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();

    // Set viewport to a reasonable size
    await page.setViewport({ width: 1280, height: 800 });

    const baseUrl = 'http://localhost:3000';
    const outDir = 'manual_admin';

    if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir);
    }

    try {
        console.log('Navigating to login...');
        await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle0' });

        console.log('Logging in...');
        await page.type('input[name="loginId"]', 'A0001'); // Adjust selector if needed
        await page.type('input[name="password"]', 'password'); // Adjust selector if needed

        // Try to find the button. It might be a button type="submit"
        const submitButton = await page.$('button[type="submit"]');
        if (submitButton) {
            await submitButton.click();
        } else {
            // Fallback: press enter
            await page.keyboard.press('Enter');
        }

        await page.waitForNavigation({ waitUntil: 'networkidle0' });
        console.log('Login complete (hopefully)');

        const routes = [
            { path: '/admin', name: '01_dashboard.png' },
            { path: '/admin/users', name: '02_users_list.png' },
            { path: '/admin/classrooms', name: '03_classrooms_list.png' },
            { path: '/admin/curriculum', name: '04_curriculum_list.png' },
            { path: '/admin/problems', name: '05_problems_list.png' },
            { path: '/admin/analytics', name: '06_analytics_dashboard.png' }
        ];

        for (const route of routes) {
            console.log(`Navigating to ${route.path}...`);
            await page.goto(`${baseUrl}${route.path}`, { waitUntil: 'networkidle0' });
            // Wait a bit for any animations or data fetching
            await new Promise(r => setTimeout(r, 2000));
            const screenshotPath = path.join(outDir, route.name);
            await page.screenshot({ path: screenshotPath, fullPage: false });
            console.log(`Saved screenshot to ${screenshotPath}`);
        }

    } catch (e) {
        console.error('Error during screenshot capture:', e);
    } finally {
        await browser.close();
    }
})();
