#!/usr/bin/env node
/**
 * Desktop vs mobile scroll / frame behaviour (Chromium via Playwright).
 *
 * Prereqs:
 *   npm i -D playwright
 *   npx playwright install chromium
 *
 * Terminal 1:  npm run dev
 * Terminal 2:  set PERF_BASE=http://127.0.0.1:5173   (PowerShell: $env:PERF_BASE="http://127.0.0.1:5173")
 *               npm run perf:compare
 *
 * Optional: PERF_WHEEL_STEPS=50 PERF_WHEEL_DELTA=100 PERF_WAIT_MS=8000
 */

import { chromium } from 'playwright';

const BASE = process.env.PERF_BASE || 'http://127.0.0.1:5173';
const WHEEL_STEPS = Number(process.env.PERF_WHEEL_STEPS || 45);
const WHEEL_DELTA = Number(process.env.PERF_WHEEL_DELTA || 140);
const WAIT_BOOT_MS = Number(process.env.PERF_WAIT_MS || 12000);

const profiles = [
    {
        name: 'desktop-1080p-dpr2',
        viewport: { width: 1920, height: 1080 },
        deviceScaleFactor: 2,
        userAgent: undefined
    },
    {
        name: 'mobile-iphone-ish-dpr3',
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        userAgent:
            'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
    },
    {
        name: 'tablet-narrow-dpr2',
        viewport: { width: 820, height: 1180 },
        deviceScaleFactor: 2,
        userAgent: undefined
    }
];

async function captureOne(profile) {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        viewport: profile.viewport,
        deviceScaleFactor: profile.deviceScaleFactor,
        userAgent: profile.userAgent
    });
    const page = await context.newPage();

    const gotoUrl = `${BASE.replace(/\/$/, '')}/?perf=1`;
    await page.goto(gotoUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

    await page.waitForFunction(
        () => window.__ZENITH_PERF__ && typeof window.__ZENITH_PERF__.getReport === 'function',
        { timeout: WAIT_BOOT_MS }
    );

    await page.waitForTimeout(2500);

    for (let i = 0; i < WHEEL_STEPS; i += 1) {
        await page.mouse.wheel(0, WHEEL_DELTA);
        await page.waitForTimeout(32);
    }

    await page.waitForTimeout(1500);

    const report = await page.evaluate(() => {
        const api = window.__ZENITH_PERF__;
        return api ? api.getReport() : { error: 'no __ZENITH_PERF__' };
    });

    await browser.close();
    return { profile: profile.name, report };
}

function rowSummary(name, r) {
    if (!r || r.error) return { name, error: r?.error || 'empty' };
    const e = r.env || {};
    return {
        name,
        mainHz: r.mainLoopHzAvg?.toFixed(1),
        hudRafP95: r.hudRafP95Ms?.toFixed(0),
        longTasks: r.longTaskCount,
        bufW: e.canvasDrawingBufferWidth,
        bufH: e.canvasDrawingBufferHeight,
        rPR: e.rendererPixelRatio,
        dPR: e.devicePixelRatio,
        cssW: e.innerWidth,
        scrollSpanPct: r.scrollPctMin != null
            ? `${(r.scrollPctMin * 100).toFixed(0)}–${(r.scrollPctMax * 100).toFixed(0)}`
            : 'n/a'
    };
}

async function main() {
    console.log(`PERF_BASE=${BASE}`);
    const results = [];
    for (const p of profiles) {
        process.stdout.write(`Running ${p.name} ... `);
        try {
            const { report } = await captureOne(p);
            results.push({ profile: p.name, report });
            console.log('ok');
        } catch (err) {
            console.log('FAIL', err.message);
            results.push({ profile: p.name, error: String(err) });
        }
    }

    console.log('\n--- Summary (mainHz ~60 is healthy; high hudRafP95 = main-thread stalls) ---\n');
    const table = results.map((x) => rowSummary(x.profile, x.report));
    console.table(table);

    console.log('\n--- Full JSON (last profile) ---\n');
    const last = results[results.length - 1];
    if (last?.report) console.log(JSON.stringify(last.report, null, 2));
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
