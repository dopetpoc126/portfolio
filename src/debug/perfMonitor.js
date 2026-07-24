/**
 * Zenith performance HUD + export API for automated runs (Playwright).
 * Enable: ?perf=1  or  localStorage.setItem('zenithPerf','1') + reload
 * Disable: ?perf=0  or  localStorage.removeItem('zenithPerf')
 */

const RING = 120;

function quantile(sorted, q) {
    if (!sorted.length) return 0;
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1))));
    return sorted[idx];
}

export function startZenithPerfMonitor(ctx) {
    const {
        getScrollY,
        getVelocity,
        getMaxScroll,
        getScrollPct,
        getRendererPixelRatio,
        getCanvasSize,
        getLenisLimit
    } = ctx;

    const frameDts = [];
    let longTaskCount = 0;
    let longTaskMs = 0;
    let longObserver = null;

    try {
        longObserver = new PerformanceObserver((list) => {
            for (const e of list.getEntries()) {
                longTaskCount += 1;
                longTaskMs += e.duration || 0;
            }
        });
        longObserver.observe({ entryTypes: ['longtask'] });
    } catch {
        /* Safari / some builds */
    }

    const hud = document.createElement('div');
    hud.id = 'zenith-perf-hud';
    Object.assign(hud.style, {
        position: 'fixed',
        left: '8px',
        bottom: '8px',
        zIndex: '2147483646',
        fontFamily: 'ui-monospace, JetBrains Mono, monospace',
        fontSize: '10px',
        lineHeight: '1.35',
        color: '#0f0',
        background: 'rgba(0,0,0,0.82)',
        border: '1px solid #0a0',
        padding: '8px 10px',
        maxWidth: 'min(96vw, 420px)',
        pointerEvents: 'none',
        whiteSpace: 'pre-wrap',
        textShadow: '0 0 6px #000'
    });
    document.body.appendChild(hud);

    let last = performance.now();
    let rafId = 0;
    let running = true;
    let scrollMin = Infinity;
    let scrollMax = -Infinity;
    let scrollSamples = 0;
    let startedAt = performance.now();

    let mainLoopTicks = 0;
    let mainLoopTicksWindowStart = performance.now();
    let mainLoopTicksInWindow = 0;
    const mainTick = () => {
        mainLoopTicks += 1;
        mainLoopTicksInWindow += 1;
    };
    window.__ZENITH_PERF_TICK__ = mainTick;

    const tick = (now) => {
        if (!running) return;
        const dt = now - last;
        last = now;
        frameDts.push(dt);
        if (frameDts.length > RING) frameDts.shift();

        const y = getScrollY();
        const pct = getScrollPct();
        scrollMin = Math.min(scrollMin, pct);
        scrollMax = Math.max(scrollMax, pct);
        scrollSamples += 1;

        rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);

    const hudInterval = window.setInterval(() => {
        const dts = [...frameDts].sort((a, b) => a - b);
        const mean = dts.length ? dts.reduce((a, b) => a + b, 0) / dts.length : 0;
        const now = performance.now();
        const winDt = now - mainLoopTicksWindowStart;
        const mainHz = winDt > 0 ? (mainLoopTicksInWindow / winDt) * 1000 : 0;
        mainLoopTicksWindowStart = now;
        mainLoopTicksInWindow = 0;

        const p95 = quantile(dts, 0.95);

        const mem = performance.memory
            ? `heap ${(performance.memory.usedJSHeapSize / 1048576).toFixed(1)} / ${(performance.memory.jsHeapSizeLimit / 1048576).toFixed(0)} MB`
            : 'heap n/a';

        const cs = getCanvasSize();
        const env = [
            `px ${window.devicePixelRatio} → rPR ${getRendererPixelRatio()}`,
            `css ${window.innerWidth}×${window.innerHeight}`,
            `canvas ${cs.width}×${cs.height} (buf)`,
            `lenis.limit ${getLenisLimit()}`
        ].join('\n');

        hud.textContent = [
            'ZENITH PERF ( ?perf=0 to off )',
            `mainLoop ~${mainHz.toFixed(0)}/s (want ~60)  |  HUD-rAF mean ${mean.toFixed(0)}ms p95 ${p95.toFixed(0)} (starves when main busy)`,
            `scroll % ${(getScrollPct() * 100).toFixed(2)}  y ${getScrollY().toFixed(0)}  v ${getVelocity().toFixed(2)}`,
            `range % ${(scrollMin * 100).toFixed(1)}–${(scrollMax * 100).toFixed(1)} (n=${scrollSamples})`,
            `longTasks ${longTaskCount} (${longTaskMs.toFixed(0)}ms)`,
            mem,
            env
        ].join('\n');
    }, 300);

    const buildReport = () => {
        const cs = getCanvasSize();
        const dts = [...frameDts].sort((a, b) => a - b);
        const mean = dts.length ? dts.reduce((a, b) => a + b, 0) / dts.length : 0;
        const elapsed = Math.max(performance.now() - startedAt, 1);
        const avgMainHz = (mainLoopTicks / elapsed) * 1000;

        return {
            capturedAt: new Date().toISOString(),
            wallTimeMs: performance.now() - startedAt,
            frameSamples: dts.length,
            mainLoopHzAvg: avgMainHz,
            mainLoopTicksTotal: mainLoopTicks,
            hudRafMeanMs: mean,
            hudRafP95Ms: quantile(dts, 0.95),
            hudRafP99Ms: quantile(dts, 0.99),
            hudRafJankOver26ms: dts.filter((d) => d > 26).length,
            hudRafFpsIllusion: mean > 0 ? 1000 / mean : null,
            longTaskCount,
            longTaskMsTotal: longTaskMs,
            scrollPctMin: scrollMin === Infinity ? null : scrollMin,
            scrollPctMax: scrollMax === -Infinity ? null : scrollMax,
            scrollSamples,
            scrollY: getScrollY(),
            scrollVelocity: getVelocity(),
            scrollMax: getMaxScroll(),
            env: {
                innerWidth: window.innerWidth,
                innerHeight: window.innerHeight,
                devicePixelRatio: window.devicePixelRatio,
                rendererPixelRatio: getRendererPixelRatio(),
                canvasDrawingBufferWidth: cs.width,
                canvasDrawingBufferHeight: cs.height,
                lenisLimit: getLenisLimit()
            },
            memory: performance.memory
                ? {
                    usedJSHeapSize: performance.memory.usedJSHeapSize,
                    totalJSHeapSize: performance.memory.totalJSHeapSize,
                    jsHeapSizeLimit: performance.memory.jsHeapSizeLimit
                }
                : null
        };
    };

    const stop = () => {
        running = false;
        cancelAnimationFrame(rafId);
        window.clearInterval(hudInterval);
        delete window.__ZENITH_PERF_TICK__;
        try {
            longObserver?.disconnect();
        } catch {
            /* noop */
        }
        hud.remove();
    };

    window.__ZENITH_PERF__ = {
        getReport: buildReport,
        stop,
        logReport: () => {
            const r = buildReport();
            console.table(r.env);
            console.log('[ZENITH_PERF]', JSON.stringify(r, null, 2));
            return r;
        }
    };

    console.info(
        '%cZENITH PERF',
        'background:#040;color:#0f0;padding:4px 8px',
        'HUD on. window.__ZENITH_PERF__.logReport()  |  ?perf=0 to disable'
    );

    return { stop, getReport: buildReport };
}
