import './styles/base.css';
import * as THREE from 'three';
import { initCircularText } from './components/CircularText.js';

document.addEventListener('DOMContentLoaded', async () => {
    // Prevent browser from trying to restore previous scroll position and fighting Lenis
    if ('scrollRestoration' in history) {
        history.scrollRestoration = 'manual';
    }
    window.scrollTo(0, 0);
    try {
        const gsap = (await import('gsap')).default;
        const { ScrollTrigger } = await import('gsap/ScrollTrigger');

        gsap.registerPlugin(ScrollTrigger);
        ScrollTrigger.clearScrollMemory('manual');

        // ─────────────────────────────────────────────────────────────────────

        // Industry Standard Fix for Mobile/iOS thread jank
        if (window.innerWidth < 1025) {
            // ScrollTrigger.normalizeScroll(true);
            ScrollTrigger.config({ ignoreMobileResize: true });
        }

        const canvas = document.querySelector('#gl-canvas');
        if (!canvas) throw new Error('Canvas #gl-canvas not found');

        // Start Beams 3D shader immediately for the splash screen loader
        const splashCanvas = document.getElementById('balatro-canvas');
        let splashLoader = null;
        if (splashCanvas) {
            const BeamsLoader = (await import('./gl/BeamsLoader.js')).default;
            splashLoader = new BeamsLoader(splashCanvas, {
                beamWidth: 2,
                beamHeight: 15,
                beamNumber: 12,
                lightColor: '#ffffff',
                speed: 2,
                noiseIntensity: 1.75,
                scale: 0.2,
                rotation: 0
            });
        }

        // Debug border to check visibility
        // canvas.style.border = '1px solid red';

        const ScrollManager = (await import('./managers/ScrollManager')).default;
        const scrollMath = await import('./utils/scrollCameraMath.js');
        const GLManager = (await import('./gl/GLManager')).default;
        const Suns = (await import('./gl/Suns')).default;
        const haptics = (await import('./utils/Haptics')).default;
        const CinematicManager = (await import('./utils/CinematicManager')).default;
        const HeroFormation = (await import('./utils/HeroFormation')).default;
        // const HeroText = (await import('./gl/HeroText')).default;
        const loadFalloutModule = () => import('./gl/Fallout').then(({ default: Fallout }) => Fallout);
        const loadCityModule = () => import('./gl/City').then(({ default: City }) => City);
        const loadSatellitesModule = () => import('./gl/Satellites').then(({ default: Satellites }) => Satellites);
        const loadProjectCardsModule = () => import('./gl/ProjectCards').then(({ default: ProjectCards }) => ProjectCards);

        const scroll = new ScrollManager();
        scroll.scrollTo(0, { immediate: true });
        scroll.stop(); // Block scrolling while loading

        const gl = new GLManager(canvas);
        const cinematic = new CinematicManager();
        const heroFormation = new HeroFormation(gl.scene, canvas);



        // --- LOADING SEQUENCE (ORCHESTRATION) ---
        const loader = document.getElementById('loader');
        const loaderBar = document.getElementById('loader-progress');
        const loaderPct = document.getElementById('loader-pct');
        const loaderText = document.getElementById('loader-text');

        let suns, city, satellites, fallout, projectCardsSystem, heroText;
        let domHeroContent = null;
        let domSplitText = null;
        let domAboutSection = document.querySelector('.battlefield-hud');
        let domContactSection = document.getElementById('contact');
        let loaderFinished = false;
        let canFracture = false;
        let introStarted = false;
        let backgroundBootstrapStarted = false;
        let warmupScheduled = false;
        let cityLoadPromise = null;
        let satellitesInitStarted = false;
        let falloutInitStarted = false;
        let projectCardsInitStarted = false;
        let ejectionPulseTriggered = false;
        let speedLines = null;
        let debris = null;

        const scheduleDeferredTask = (callback, delay = 0) => {
            window.setTimeout(() => {
                if (window.requestIdleCallback) {
                    window.requestIdleCallback(() => callback(), { timeout: 1500 });
                } else {
                    window.setTimeout(callback, 0);
                }
            }, delay);
        };

        const getScrollPct = () => Math.min((scroll.scroll || 0) / scroll.getMaxScroll(), 1.0);

        const setLoaderProgress = (pct, text) => {
            if (loaderBar) loaderBar.style.width = `${pct}%`;
            if (loaderPct) loaderPct.innerText = `${pct.toString().padStart(2, '0')}%`;
            if (text && loaderText) loaderText.innerText = text;
        };

        // ── Section Navigation (Touch Swipe + Mouse Wheel) ─────────────────
        // Single source of truth is the navbar link click handler.
        // Touch swipe up   → trigger .click() on next section link
        // Touch swipe down → trigger .click() on previous section link
        // Mouse wheel down → trigger .click() on next section link
        // Mouse wheel up   → trigger .click() on previous section link

        // NAV_KEYS index: 0=hero 1=about 2=projects 3=experience 4=exp-node-1 5=exp-node-2 6=exp-node-3 7=contact
        // exp-node-1/2/3 are invisible nav points inside the experience flight zone.
        // Swipe between them uses the same Lenis-driven section jump as all other sections —
        // no more native-scroll free-scroll zone fighting.
        const NAV_KEYS = ['hero', 'about', 'projects', 'experience', 'exp-node-1', 'exp-node-2', 'exp-node-3', 'contact'];
        const NAV_DEFAULTS = {
            hero: 0.00, about: 0.05, projects: 0.27,
            experience: 0.70,
            'exp-node-1': 0.71, 'exp-node-2': 0.73, 'exp-node-3': 0.75,
            contact: 1.00
        };

        // Section index — single writer: IntersectionObserver (set up inside initSectionNav).
        let _sectionIdx = 0;

        // _navLocked gates all navigation input for the full duration of an in-flight
        // scroll animation. Cleared by the animation itself via _navUnlock(), not a
        // fixed timeout — so swipe-spam and mid-flight re-triggers are impossible.
        let _navLocked = false;
        let _navLockSetAt = 0;
        let _navUnlockTimer = null;

        const _lockNav = (durationMs) => {
            _navLocked = true;
            _navLockSetAt = performance.now();
            clearTimeout(_navUnlockTimer);
            _navUnlockTimer = setTimeout(() => { _navLocked = false; }, durationMs);
        };

        const _unlockNav = () => {
            clearTimeout(_navUnlockTimer);
            _navLocked = false;
            window._programmaticScroll = false;
        };

        const navigateToIdx = (idx, navLinks) => {
            if (_navLocked) return;
            const clamped = Math.max(0, Math.min(idx, NAV_KEYS.length - 1));
            if (clamped === _sectionIdx) return;

            const hrefMap = ['#hero', '#about', '#projects', '#experience', '#exp-node-1', '#exp-node-2', '#exp-node-3', '#contact'];
            const link = document.querySelector(`.hud-nav a[href="${hrefMap[clamped]}"]`);
            if (!link) return;

            _sectionIdx = clamped;
            link.click();
        };

        const initSectionNav = () => {
            // Narrow exclusion list — interactive controls only.
            // Dropping `a`, `nav`, `.hud-nav` means swipes that START near nav links
            // are now tracked. Keep `button` and `input` so taps on controls don't
            // accidentally trigger a section jump.
            const EXCLUDED = 'button, input, #projects-fullscreen, .social-hub-container, [data-lenis-prevent]';
            const SCROLL_EXEMPT = '#projects-fullscreen, .social-hub-container, [data-lenis-prevent]';

            const navLinks = Array.from(document.querySelectorAll('.hud-nav a'));

            // ── Section index tracking: hybrid IntersectionObserver + scroll-pct ──
            //
            // This site is mostly WebGL-driven. Several nav targets (#projects,
            // #experience, #contact) have no real DOM element with height, so
            // IntersectionObserver can never fire for them. Strategy:
            //
            //   • DOM sections (#hero, #work→about): IntersectionObserver at 40%
            //     visibility. These are real full-viewport sections.
            //   • WebGL-only sections (projects, experience, contact): scroll-pct
            //     thresholds, updated by a passive scroll listener. The observer
            //     result always wins when it fires; the scroll-pct path only runs
            //     when scroll is past the last observable section.
            //
            // NAV_KEYS index:  0=hero  1=about  2=projects  3=experience  4=contact

            // Observable DOM elements for indices 0 and 1.
            // #about nav link → section is actually id="work"
            const observedPairs = [
                { el: document.querySelector('#hero'), idx: 0 },
                { el: document.querySelector('#work'), idx: 1 },
            ];

            const sectionObserver = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const pair = observedPairs.find(p => p.el === entry.target);
                        if (pair) _sectionIdx = pair.idx;
                    }
                });
            }, { threshold: 0.4 });

            observedPairs.forEach(p => p.el && sectionObserver.observe(p.el));

            // Scroll-pct fallback for WebGL sections.
            // NAV_KEYS: 0=hero 1=about 2=projects 3=experience 4=exp-node-1 5=exp-node-2 6=exp-node-3 7=contact
            const syncScrollPctIdx = () => {
                if (_navLocked) return;
                const pct = getScrollPct();
                const targets = window._navTargets || NAV_DEFAULTS;
                if (pct >= (targets.contact          ?? 1.00)) { _sectionIdx = 7; return; }
                if (pct >= (targets['exp-node-3']    ?? 0.75)) { _sectionIdx = 6; return; }
                if (pct >= (targets['exp-node-2']    ?? 0.73)) { _sectionIdx = 5; return; }
                if (pct >= (targets['exp-node-1']    ?? 0.71)) { _sectionIdx = 4; return; }
                if (pct >= (targets.experience       ?? 0.70)) { _sectionIdx = 3; return; }
                if (pct >= (targets.projects         ?? 0.27)) { _sectionIdx = 2; return; }
                if (pct >= (targets.about            ?? 0.05)) { _sectionIdx = 1; return; }
                // Below about threshold — DOM IntersectionObserver owns hero (idx 0).
                // Don't override here; IO will set it when #hero is visible.
            };

            // Passive scroll listener — runs syncScrollPctIdx when outside DOM sections.
            window.addEventListener('scroll', syncScrollPctIdx, { passive: true });
            // No isExpFreeZone / free-scroll zone — exp nodes are full Lenis section jumps.

            // ── Mobile Touch Swipe (Triggers navbar link .click()) ──────
            let touchStartY = 0;
            let touchStartX = 0;
            let isTracking = false;
            let _directionLocked = false; // true once we've confirmed it's a vertical swipe

            const SWIPE_THRESHOLD = 25;
            const DIRECTION_LOCK_RATIO = 0.8;

            document.addEventListener('touchstart', (e) => {
                if (e.target.closest(EXCLUDED)) return;
                if (!e.touches || e.touches.length !== 1) return;
                touchStartY = e.touches[0].clientY;
                touchStartX = e.touches[0].clientX;
                isTracking = true;
                _directionLocked = false;
                // Only clear a stale nav lock — not one from an animation still in flight.
                // We track when the lock was set and only force-clear after 800ms.
                if (_navLocked && _navLockSetAt && (performance.now() - _navLockSetAt) > 800) {
                    _unlockNav();
                }
            }, { passive: false });

            document.addEventListener('touchmove', (e) => {
                if (!isTracking || !e.touches || e.touches.length !== 1) return;
                if (e.target.closest(EXCLUDED)) return;

                const dy = e.touches[0].clientY - touchStartY;
                const dx = e.touches[0].clientX - touchStartX;

                // Once we detect a clear vertical intent, lock out native scroll for the rest
                // of this gesture so the swipe stays clean.
                if (!_directionLocked && (Math.abs(dy) > 8 || Math.abs(dx) > 8)) {
                    _directionLocked = true;
                    if (Math.abs(dy) > Math.abs(dx) * DIRECTION_LOCK_RATIO) {
                        e.preventDefault();
                    }
                } else if (_directionLocked && Math.abs(dy) > Math.abs(dx) * DIRECTION_LOCK_RATIO) {
                    e.preventDefault();
                }
            }, { passive: false });

            document.addEventListener('touchend', (e) => {
                if (!isTracking) return;
                isTracking = false;
                _directionLocked = false;
                if (e.target.closest(EXCLUDED)) return;
                if (_navLocked) return;

                const t = e.changedTouches ? e.changedTouches[0] : null;
                if (!t) return;

                const dy = t.clientY - touchStartY;
                const dx = t.clientX - touchStartX;

                if (Math.abs(dy) < SWIPE_THRESHOLD) return;
                if (Math.abs(dx) > Math.abs(dy) * DIRECTION_LOCK_RATIO) return;

                const currentIndex = _sectionIdx;
                const targetIndex = dy < 0
                    ? Math.min(currentIndex + 1, navLinks.length - 1)
                    : Math.max(currentIndex - 1, 0);

                if (targetIndex !== currentIndex && navLinks[targetIndex]) {
                    navLinks[targetIndex].click();
                }
            }, { passive: true });

            // ── Wheel (desktop / laptop) ────────────────────────────────────
            // On desktop, Lenis handles smooth scrolling natively — no section
            // hijacking needed. We only intercept wheel inside scroll-exempt zones
            // (projects overlay, social container) to prevent them leaking to Lenis.
            document.addEventListener('wheel', (e) => {
                if (e.target.closest(SCROLL_EXEMPT)) {
                    // Let the element scroll itself; don't propagate to Lenis.
                    return;
                }
                // All other wheel events: let Lenis handle them freely.
                // Do NOT call e.preventDefault() here — that would kill Lenis.
            }, { passive: true });
        };
        // ─────────────────────────────────────────────────────────────────────


        const finishLoading = () => {
            if (loaderFinished) return;
            loaderFinished = true;
            setLoaderProgress(100, 'Ready');

            ScrollTrigger.refresh();
            if (scroll.lenis) scroll.lenis.resize();

            setTimeout(() => {
                if (loader) loader.classList.add('loader-hidden');
                if (splashLoader) {
                    splashLoader.destroy();
                    splashLoader = null;
                }
                scroll.start();
                initSectionNav();
                canFracture = true;
                ScrollTrigger.refresh();
                if (scroll.lenis) scroll.lenis.resize();

                // ── Post-load warmup: pre-render the camera path so first scroll is smooth ──
                // Mobile: call updateScene directly at the about scroll pct — zero scroll
                // position changes, zero impact on swipe state or _sectionIdx.
                // Desktop: Lenis animated scroll behind the now-hidden loader glass.
                if (scroll.isTouch) {
                    // Just drive the scene math at the about position — no DOM scroll involved
                    const warmPct = window._navTargets?.about ?? 0.05;
                    updateScene(warmPct, 0, true);
                    // One frame later, snap back to hero position
                    requestAnimationFrame(() => updateScene(0, 0, true));
                } else {
                    // Desktop: Lenis warmup scroll — loader is already hidden but fading,
                    // this runs during the CSS transition so user sees nothing wrong.
                    const maxScroll = scroll.getMaxScroll();
                    const aboutPx = Math.max((window._navTargets?.about ?? 0.05) * maxScroll, 80);
                    scroll.scrollTo(aboutPx, {
                        duration: 0.8,
                        easing: (t) => t * t,
                        onComplete: () => {
                            scroll.scrollTo(0, {
                                duration: 0.6,
                                easing: (t) => 1 - Math.pow(1 - t, 3),
                            });
                        },
                    });
                }
                // ─────────────────────────────────────────────────────────────
            }, 2600);
        };

        const beginIntro = () => {
            if (introStarted) return;
            introStarted = true;

            domHeroContent = document.querySelector('.hero-content');
            domSplitText = document.querySelector('.split-text');
            domAboutSection = document.querySelector('.battlefield-hud');
            domContactSection = document.getElementById('contact');

            if (domHeroContent) {
                // Old text elements removed — circular text ring is used instead
            }

            // Init circular text ring — projection loop handles position/size every frame
            const ringFontWt = '700';
            initCircularText('#circular-text-ring', {
                text: '* SCROLL DOWN * SHRIYAN * ANDROID DEV * ',
                spinDuration: 18,
                size: 200, // placeholder — corrected by projection on first frame
                fontSize: '32px',
                fontWeight: ringFontWt,
            });
            const ring = document.getElementById('circular-text-ring');
            if (ring) { ring.style.transform = 'none'; }

            // Fade the ring in with the hero intro
            gsap.fromTo('#circular-text-ring',
                { opacity: 0, scale: 0.85 },
                { opacity: 1, scale: 1, duration: 1.4, ease: 'power3.out', delay: 0.3 }
            );

            if (suns) suns.ignition();
        };

        // ── Cockpit HUD 2D Canvas Drawing Routine ──
        const drawCockpitHUDCanvas = (city, norm, bankAngle) => {
            if (!city || !city.hudCanvas || !city.hudCtx || !city.hudTexture) return;

            const ctx = city.hudCtx;
            const w = city.hudCanvas.width;
            const h = city.hudCanvas.height;

            ctx.clearRect(0, 0, w, h);

            // Pure black background — with AdditiveBlending, black = fully transparent.
            // Only the colored glow elements add light on top of the cockpit geometry.
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, w, h);

            // Subtle grid etched into the glass (very faint)
            ctx.strokeStyle = 'rgba(0, 255, 136, 0.07)';
            ctx.lineWidth = 1;
            const gridSize = 40;
            ctx.beginPath();
            for (let x = 0; x < w; x += gridSize) {
                ctx.moveTo(x, 0); ctx.lineTo(x, h);
            }
            for (let y = 0; y < h; y += gridSize) {
                ctx.moveTo(0, y); ctx.lineTo(w, y);
            }
            ctx.stroke();

            // No full border rect — it makes the overlay look like a painted-on box.
            // Only corner brackets remain to suggest a targeting frame.

            // Target corners
            ctx.strokeStyle = 'rgba(0, 255, 136, 0.55)';
            ctx.lineWidth = 5;
            const len = 28;
            // Top Left
            ctx.beginPath(); ctx.moveTo(15, 15 + len); ctx.lineTo(15, 15); ctx.lineTo(15 + len, 15); ctx.stroke();
            // Top Right
            ctx.beginPath(); ctx.moveTo(w - 15, 15 + len); ctx.lineTo(w - 15, 15); ctx.lineTo(w - 15 - len, 15); ctx.stroke();
            // Bottom Left
            ctx.beginPath(); ctx.moveTo(15, h - 15 - len); ctx.lineTo(15, h - 15); ctx.lineTo(15 + len, h - 15); ctx.stroke();
            // Bottom Right
            ctx.beginPath(); ctx.moveTo(w - 15, h - 15 - len); ctx.lineTo(w - 15, h - 15); ctx.lineTo(w - 15 - len, h - 15); ctx.stroke();

            // Center Artificial Horizon
            ctx.save();
            ctx.translate(w / 2, h / 2 - 20);
            ctx.rotate(-bankAngle * 4.0); // Roll orientation

            ctx.strokeStyle = 'rgba(0, 255, 136, 0.5)';
            ctx.lineWidth = 3;

            // Horizon line
            ctx.beginPath();
            ctx.moveTo(-130, 0); ctx.lineTo(-45, 0);
            ctx.moveTo(45, 0); ctx.lineTo(130, 0);
            ctx.stroke();

            // Pitch bar +10
            const pitchOffset = Math.sin(norm * Math.PI) * 35;
            ctx.beginPath();
            ctx.moveTo(-75, -50 + pitchOffset); ctx.lineTo(-45, -50 + pitchOffset); ctx.lineTo(-45, -40 + pitchOffset);
            ctx.moveTo(75, -50 + pitchOffset); ctx.lineTo(45, -50 + pitchOffset); ctx.lineTo(45, -40 + pitchOffset);
            ctx.stroke();

            // Pitch bar -10 (dashed)
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.moveTo(-75, 50 + pitchOffset); ctx.lineTo(-45, 50 + pitchOffset); ctx.lineTo(-45, 40 + pitchOffset);
            ctx.moveTo(75, 50 + pitchOffset); ctx.lineTo(45, 50 + pitchOffset); ctx.lineTo(45, 40 + pitchOffset);
            ctx.stroke();
            ctx.setLineDash([]);

            // Pitch ladder labels
            ctx.fillStyle = 'rgba(0, 255, 136, 0.6)';
            ctx.font = '11px "JetBrains Mono", monospace';
            ctx.fillText("+10", -100, -47 + pitchOffset);
            ctx.fillText("+10", 85, -47 + pitchOffset);
            ctx.fillText("-10", -100, 53 + pitchOffset);
            ctx.fillText("-10", 85, 53 + pitchOffset);

            // Central reticle circle
            ctx.strokeStyle = '#00ff88';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(0, 0, 30, 0, Math.PI * 2);
            ctx.stroke();

            // Central dot
            ctx.fillStyle = '#00ff88';
            ctx.beginPath();
            ctx.arc(0, 0, 5, 0, Math.PI * 2);
            ctx.fill();

            ctx.restore();

            // Heading Tape
            ctx.strokeStyle = 'rgba(0, 255, 136, 0.4)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(120, 60); ctx.lineTo(w - 120, 60);
            ctx.stroke();

            const hdg = Math.round(270 + norm * 40);
            ctx.fillStyle = '#00ff88';
            ctx.font = '14px "JetBrains Mono", monospace';
            ctx.textAlign = 'center';
            ctx.fillText("260   270   280   290   300   310   320", w / 2, 45);
            ctx.font = 'bold 24px "JetBrains Mono", monospace';
            ctx.fillText(`${hdg}°`, w / 2, 90);

            // Left Panel: SPD
            const isRedAlert = false; // Disable corny red HUD flashbang
            const baseSpd = Math.round(norm * 1480);
            let spd = baseSpd;
            if (norm >= 0.72 && norm <= 0.84) {
                // Flickering speeds during impact
                spd = Math.floor(Math.random() * 900) + 1200;
            }
            ctx.textAlign = 'left';
            ctx.font = '12px "JetBrains Mono", monospace';
            ctx.fillStyle = isRedAlert ? '#ff3300' : 'rgba(0, 255, 136, 0.6)';
            ctx.fillText("Speed (kts)", 40, 140);
            ctx.font = 'bold 42px "JetBrains Mono", monospace';
            ctx.fillStyle = isRedAlert ? '#ff3300' : '#00ff88';
            ctx.fillText(String(spd).padStart(4, '0'), 40, 185);

            // Right Panel: ALT
            const alt = Math.round(2400 + norm * 35600);
            ctx.textAlign = 'right';
            ctx.font = '12px "JetBrains Mono", monospace';
            ctx.fillStyle = isRedAlert ? '#ff3300' : 'rgba(0, 255, 136, 0.6)';
            ctx.fillText("Altitude (ft)", w - 40, 140);
            ctx.font = 'bold 42px "JetBrains Mono", monospace';
            ctx.fillStyle = isRedAlert ? '#ff3300' : '#00ff88';
            ctx.fillText(String(alt).padStart(5, '0'), w - 40, 185);

            // Center status & G-Force
            let gForce = (1 + Math.sin(norm * Math.PI) * 4.5).toFixed(1);
            if (isRedAlert) {
                gForce = (18.5 + Math.random() * 5.0).toFixed(1); // wild G-Force spikes on crash!
            }
            ctx.textAlign = 'center';
            ctx.font = 'bold 18px "JetBrains Mono", monospace';
            ctx.fillStyle = isRedAlert ? '#ff3300' : '#00ff88';
            ctx.fillText(`G-Load: ${gForce}G`, w / 2, h - 150);

            // Radar display (Sweep animation)
            const rx = w / 2;
            const ry = h - 80;
            const rad = 45;
            ctx.strokeStyle = isRedAlert ? 'rgba(255, 51, 0, 0.35)' : 'rgba(0, 255, 136, 0.35)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(rx, ry, rad, 0, Math.PI * 2);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(rx, ry, rad * 0.5, 0, Math.PI * 2);
            ctx.stroke();

            const sweep = (Date.now() / 800) % (Math.PI * 2);
            ctx.strokeStyle = isRedAlert ? 'rgba(255, 51, 0, 0.8)' : 'rgba(0, 255, 136, 0.8)';
            ctx.beginPath();
            ctx.moveTo(rx, ry);
            ctx.lineTo(rx + Math.cos(sweep) * rad, ry + Math.sin(sweep) * rad);
            ctx.stroke();

            // Target status
            let tgtStatus = 'Tracking';
            if (norm >= 0.40 && norm < 0.72) tgtStatus = 'Locked';
            else if (norm >= 0.72 && norm < 0.84) tgtStatus = 'Impact';
            else if (norm >= 0.84) tgtStatus = 'Clear';

            ctx.font = 'bold 14px "JetBrains Mono", monospace';
            ctx.fillStyle = (tgtStatus === 'Impact' || tgtStatus === 'Clear') ? '#ff3300' : '#00ff88';
            ctx.fillText(`Target: ${tgtStatus}`, rx, ry + rad + 24);

            // Status
            ctx.font = '12px "JetBrains Mono", monospace';
            ctx.fillStyle = isRedAlert ? 'rgba(255, 51, 0, 0.65)' : 'rgba(0, 255, 136, 0.65)';
            ctx.textAlign = 'left';
            ctx.fillText("Portfolio — Shriyan", 40, h - 35);
            ctx.fillText("Online", 40, h - 18);

            ctx.textAlign = 'right';
            ctx.fillText("Scan: active", w - 40, h - 35);
            ctx.fillText("Fuel: 89%", w - 40, h - 18);

            // Large center warnings during red alert
            if (isRedAlert) {
                ctx.fillStyle = 'rgba(255, 30, 0, 0.2)';
                ctx.fillRect(0, 0, w, h);

                ctx.fillStyle = '#ff1100';
                ctx.font = 'bold 36px "JetBrains Mono", monospace';
                ctx.textAlign = 'center';
                ctx.fillText("■ IMPACT ■", w / 2, h / 2 - 45);
                ctx.font = '14px "JetBrains Mono", monospace';
                ctx.fillText("Critical impact detected", w / 2, h / 2 + 10);
            }

            city.hudTexture.needsUpdate = true;
        };

        // SHARED SCENE UPDATE LOGIC — camera math lives in scrollCameraMath.js (no per-frame closures).
        const sectionBoundaries = [0, 0.16, 0.60, 0.85, 1.0];

        const DRIVE_START = 0.167; // 200vh pre-drive / 1200vh total (200 + 1000vh drive)

        // Cockpit constants — defined here so both driving phase and segment 2 can access them
        const cockpitX = -7.3523;
        const cockpitY = 2.4282;
        const cockpitZ = -24.3457;
        const cockpitRotY = Math.PI / 2;
        const cockpitRotX = 0.08;

        const createSpeedLines = (scene) => {
            const group = new THREE.Group();
            const lineMat = new THREE.MeshBasicMaterial({
                color: 0xffffff, // Cinematic white
                transparent: true,
                opacity: 0
            });

            const numLines = 45; // Fewer, distinct speed lines
            const lines = [];

            // Shared geometry for thin white box "sticks" (1.6m long, 3cm thick)
            const boxGeo = new THREE.BoxGeometry(1.6, 0.03, 0.03);
            const GROUP_Z = -25;

            for (let i = 0; i < numLines; i++) {
                const mesh = new THREE.Mesh(boxGeo, lineMat);

                const x = (Math.random() - 0.5) * 40;
                const y = cockpitY + 0.3 + (Math.random() - 0.5) * 3.5;
                // Safety corridor of 0.9m on both sides: prevents lines from bleeding inside the cockpit
                const side = Math.random() < 0.5 ? -1 : 1;
                const zOffset = 0.9 + Math.random() * 2.2; // Spans from 0.9m to 3.1m away from cockpit centerline
                const z = cockpitZ + GROUP_Z + side * zOffset;

                mesh.position.set(x, y, z);
                group.add(mesh);
                lines.push({
                    mesh,
                    baseX: x,
                    y,
                    z
                });
            }

            scene.add(group);
            return { group, lineMat, lines, numLines };
        };

        const createDebris = (scene) => {
            const group = new THREE.Group();
            const debrisMat = new THREE.MeshStandardMaterial({
                color: 0xff4500,
                emissive: 0xff2200,
                roughness: 0.1,
                metalness: 0.9,
                transparent: true,
                opacity: 1.0
            });

            const particles = [];
            const numShards = 40;
            for (let i = 0; i < numShards; i++) {
                const w = 0.15 + Math.random() * 0.45;
                const h = 0.06 + Math.random() * 0.18;
                const d = 0.15 + Math.random() * 0.45;
                const geo = new THREE.BoxGeometry(w, h, d);
                const mesh = new THREE.Mesh(geo, debrisMat);

                mesh.position.set(0, 0, 0);
                group.add(mesh);

                particles.push({
                    mesh,
                    vx: (Math.random() - 0.5) * 35 - 15, // strong outward blast
                    vy: (Math.random() - 0.2) * 18 + 6,
                    vz: (Math.random() - 0.5) * 26,
                    rx: (Math.random() - 0.5) * 22,
                    ry: (Math.random() - 0.5) * 22,
                    rz: (Math.random() - 0.5) * 22
                });
            }
            scene.add(group);
            group.visible = false;
            return { group, particles };
        };

        const updateScene = (scrollPct, velocity = 0, isWarmup = false) => {
            const isMobileScreen = window.innerWidth < 1025;

            // ── Remap scroll into two zones ──
            // Zone A (0→DRIVE_START): all existing phases, remapped to 0→1
            // Zone B (DRIVE_START→1): driving phase
            const isDriving = scrollPct >= DRIVE_START;
            const scenePct = isDriving
                ? 1.0  // clamp existing phases at their end state
                : scrollPct / DRIVE_START; // remap 0→DRIVE_START into 0→1
            const drivePct = isDriving
                ? (scrollPct - DRIVE_START) / (1.0 - DRIVE_START) // 0→1 within drive zone
                : 0;

            // Reset speed lines, debris, car visibility, and skills HUD when not in driving phase
            if (!isDriving) {
                window._expNodesCleared = false;
                if (city && city.f1Model) {
                    city.f1Model.visible = true;
                }
                if (debris) {
                    debris.group.visible = false;
                }
                if (speedLines) {
                    speedLines.lineMat.opacity = 0;
                }
                // Hide runway
                if (window._runwayGroup) window._runwayGroup.visible = false;
                if (window._pathTube) window._pathTube.visible = false;
                // Reset obstacle meshes so they replay when re-entering
                if (window._expObstacles) {
                    window._expObstacles.forEach(obs => {
                        obs.hit = false;
                        obs.hitT = 0;
                        obs.locked = false;
                        obs.lockFlashT = 0;
                        obs.gateLines.visible = true;
                        obs.dot.visible = true;
                        obs.label.visible = true;
                        obs.conn.visible = true;
                        obs.ring1.visible = true;
                        obs.ring2.visible = true;
                        obs.gateMat.opacity = 0;
                        obs.tickMat.opacity = 0;
                        obs.dotMat.opacity = 0;
                        obs.labelMat.opacity = 0;
                        obs.connMat.opacity = 0;
                        obs.ringMat1.opacity = 0;
                        obs.ringMat2.opacity = 0;
                        obs.ring1.scale.setScalar(1);
                        obs.ring2.scale.setScalar(1);
                        obs.shards.forEach(s => {
                            s.mesh.visible = false;
                            s.mesh.position.set(0, 0, 0);
                            s.mesh.scale.setScalar(1);
                        });
                    });
                }
            }

            if (city && city.rescueJetReady && city.rescueJet) {
                city.rescueJet.visible = isDriving;
            }

            // --- CAMERA LOGIC (PRD 6. Scroll Hook) ---
            let wpStart = { x: 0, y: 0, z: 40 };
            let wpArchive = { x: 5, y: -36, z: 51 };
            let wpAbout = { x: 56, y: -37, z: -43 };
            let wpConnect = { x: 96, y: -38, z: -117 };

            // Array of 10 points tracing from archive to about
            let pathPoints = [];
            let connectPathPoints = [];

            if (city && city.modelReady) {
                const wA = city.getWaypoint('archive');
                if (wA) wpArchive = wA;
                const wAb = city.getWaypoint('about');
                if (wAb) wpAbout = wAb;
                const wC = city.getWaypoint('connect');
                if (wC) wpConnect = wC;

                const keys = ['archive', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'about'];
                pathPoints = keys.map(k => city.getWaypoint(k) || wpArchive);

                const connectKeys = ['about', 'about_connect_p1', 'about_connect_p2', 'about_connect_p3', 'about_connect_p4', 'about_connect_p5', 'connect'];
                connectPathPoints = connectKeys.map(k => city.getWaypoint(k) || wpAbout);
            } else {
                for (let i = 0; i < 10; i++) pathPoints.push(wpArchive);
                for (let i = 0; i < 7; i++) connectPathPoints.push(wpAbout);
            }

            // Tilt Adjustment: Works (Archive) P1 rotation (Restored to a spacious 60 degrees)
            const rotP1 = Math.PI * (60 / 180);
            const cityTurnRot = Math.PI / 8 + (Math.PI / 2);
            const aboutTurnRot = cityTurnRot - Math.PI;

            const setCameraFov = (targetFov, isCockpit = false) => {
                const aspect = gl.camera.aspect || (window.innerWidth / window.innerHeight);
                const refAspect = 1.777; // Desktop 16:9 reference
                let effectiveFov = targetFov;

                if (aspect < refAspect) {
                    const isMobilePortrait = aspect < 1.0;
                    const maxAllowedFov = isMobilePortrait
                        ? (isCockpit ? Math.min(targetFov + 12, 108) : Math.min(targetFov + 4, 74))
                        : (isCockpit ? 110 : 85);
                    const radV = (targetFov * Math.PI) / 360;
                    const hFovRad = 2 * Math.atan(Math.tan(radV) * refAspect);
                    const mobileVRad = 2 * Math.atan(Math.tan(hFovRad / 2) / Math.max(aspect, 0.35));
                    effectiveFov = (mobileVRad * 180) / Math.PI;
                    effectiveFov = Math.min(Math.max(effectiveFov, targetFov), maxAllowedFov);
                }

                if (Math.abs(gl.camera.fov - effectiveFov) < 0.01) return;
                gl.camera.fov = scrollMath.lerp(gl.camera.fov, effectiveFov, 0.14);
                gl.camera.updateProjectionMatrix();
            };
            const speedFov = scrollMath.clamp01(Math.abs(velocity) * 0.018) * 5;

            // ── Driving phase — three sub-phases ──
            if (isDriving) {
                const trainX = -2.21 - 9.49999988079071; // -11.71
                const trainY = 2.8740861808376628 - 1.3583739129027417; // 1.5157
                const trainZ = 0.823518420500778 - (-0.015480863694178476); // 0.839

                const parkedX = -13.557; // parked at rack
                const portalX = trainX - 9.48;  // tunnel portal world X (trainX + -9.48)
                const smashFlash = document.getElementById('smash-flash');

                const SUB_A = 0.06, SUB_B = 0.12, SUB_C = 0.24, SUB_D = 0.29, SUB_E = 0.41, SUB_F = 0.57;

                // ── Cockpit HUD (keep fullscreen DOM hidden; we now render onto the 3D plane) ──
                const cockpitHud = document.getElementById('cockpit-hud');
                if (cockpitHud) {
                    cockpitHud.style.opacity = '0';
                    cockpitHud.style.display = 'none';
                }


                // Lazy initialize speed lines and debris meshes
                if (!speedLines && gl.scene) {
                    speedLines = createSpeedLines(gl.scene);
                }
                if (!debris && gl.scene) {
                    debris = createDebris(gl.scene);
                }

                // car train-local constants (never changes until ejection)
                const CAR_LOCAL_Y = 0.11602419564293629;
                const CAR_LOCAL_Z = -0.15858486492682247;

                // Pre-ejection: keep car in trainModel, moving in train-local X
                if (drivePct < SUB_D) {
                    if (city && city.f1Model) {
                        if (city.f1Model.parent !== city.trainModel) {
                            city.trainModel.add(city.f1Model);
                        }
                        city.f1Model.position.set(4.369307666888172, CAR_LOCAL_Y, CAR_LOCAL_Z);
                        city.f1Model.rotation.set(0, -Math.PI / 2, 0);
                    }
                    if (city && city.rescueJetReady && city.rescueJet) {
                        city.rescueJet.position.y = -999;
                        if (city.rescueJetMat) city.rescueJetMat.opacity = 0;
                    }
                }

                // ── Sub-A 0.00→0.15: drive cockpit → rack ──
                // ── Sub-B 0.15→0.50: park + tilt right to look at rack ──
                // ── Sub-C 0.50→0.62: restore look + fast sprint toward portal ──
                // ── Sub-D 0.62→0.67: SMASH through portal (flash + FOV spike) ──
                // ── Sub-E 0.67→0.78: float — car tumbles, jet rises, camera falls onto jet ──
                // ── Sub-F 0.78→1.00: locked in cockpit, jet flies forward ──

                if (drivePct < SUB_A) {
                    // Drive forward cockpit → rack
                    const t = scrollMath.smoothstep(drivePct / SUB_A);
                    const driveX = scrollMath.lerp(cockpitX, parkedX, t);
                    gl.camera.position.set(driveX, cockpitY + Math.sin(t * Math.PI * 4) * 0.015, cockpitZ);
                    gl.camera.rotation.order = 'YXZ';
                    gl.camera.rotation.y = cockpitRotY;
                    gl.camera.rotation.x = cockpitRotX;
                    gl.camera.rotation.z = Math.sin(t * Math.PI * 3) * 0.006;
                    // Slightly wider base FOV (68°) for Redbull F1 Car sequence
                    setCameraFov(68 + scrollMath.clamp01(Math.abs(velocity) * 0.025) * 8);
                    if (city && city.f1Model) city.f1Model.position.x = driveX - trainX;
                    if (smashFlash) smashFlash.style.opacity = '0';

                } else if (drivePct < SUB_B) {
                    // Park + tilt right toward rack (cubic ease-out for fast initial tilt)
                    const norm = (drivePct - SUB_A) / (SUB_B - SUB_A);
                    const t = 1 - Math.pow(1 - norm, 3);
                    gl.camera.position.set(parkedX, cockpitY, cockpitZ);
                    gl.camera.rotation.order = 'YXZ';
                    gl.camera.rotation.y = scrollMath.lerp(cockpitRotY, Math.PI * 0.25, t);
                    gl.camera.rotation.x = scrollMath.lerp(cockpitRotX, -0.12, t);
                    gl.camera.rotation.z = 0;
                    setCameraFov(scrollMath.lerp(68, 74, t));
                    if (city && city.f1Model) city.f1Model.position.x = parkedX - trainX;
                    if (smashFlash) smashFlash.style.opacity = '0';

                } else if (drivePct < SUB_C) {
                    // Restore look + fast sprint to portal — smoothstep easing
                    const norm = (drivePct - SUB_B) / (SUB_C - SUB_B);
                    const t = scrollMath.smoothstep(norm);
                    const sprintX = scrollMath.lerp(parkedX, portalX + 2.0, t);
                    const speedFovBoost = t * 18;
                    gl.camera.position.set(sprintX, cockpitY + Math.sin(norm * Math.PI * 8) * 0.012, cockpitZ);
                    gl.camera.rotation.order = 'YXZ';
                    gl.camera.rotation.y = scrollMath.lerp(Math.PI * 0.25, cockpitRotY, scrollMath.smoothstep(scrollMath.clamp01(norm * 3)));
                    gl.camera.rotation.x = scrollMath.lerp(-0.12, cockpitRotX, scrollMath.smoothstep(scrollMath.clamp01(norm * 3)));
                    gl.camera.rotation.z = Math.sin(norm * Math.PI * 6) * 0.01;
                    setCameraFov(68 + speedFovBoost);
                    if (city && city.f1Model) city.f1Model.position.x = sprintX - trainX;
                    if (smashFlash) smashFlash.style.opacity = '0';

                } else if (drivePct < SUB_D) {
                    // SMASH — punch through portal
                    const norm = (drivePct - SUB_C) / (SUB_D - SUB_C);
                    const flashAmt = norm < 0.4
                        ? scrollMath.smoothstep(norm / 0.4)
                        : 1.0 - scrollMath.smoothstep((norm - 0.4) / 0.6);
                    if (smashFlash) smashFlash.style.opacity = flashAmt.toFixed(3);
                    const smashX = scrollMath.lerp(portalX + 2.0, portalX - 3.0, scrollMath.smoothstep(norm));
                    gl.camera.position.set(smashX, cockpitY, cockpitZ);
                    gl.camera.rotation.order = 'YXZ';
                    gl.camera.rotation.y = cockpitRotY;
                    gl.camera.rotation.x = cockpitRotX + Math.sin(norm * Math.PI) * 0.08;
                    gl.camera.rotation.z = Math.sin(norm * Math.PI * 4) * 0.04;
                    setCameraFov(68 + flashAmt * 35);
                    if (city && city.f1Model) {
                        // Slide the car forward out of the train nose during the smash
                        city.f1Model.position.set(smashX - trainX - norm * 4.5, 0.11602419564293629, -0.15858486492682247);
                        city.f1Model.rotation.set(0, -Math.PI / 2, 0);
                    }

                } else if (drivePct < SUB_E) {
                    // ── Sub-E: ejection + tumble ──
                    const norm = (drivePct - SUB_D) / (SUB_E - SUB_D);
                    if (smashFlash) smashFlash.style.opacity = '0';

                    // On first entry: reparent car from trainModel → city.group with correct local coords
                    // city.group is at world (0, 0, -25), so:
                    //   local X = world X = smashX = portalX - 3.0
                    //   local Y = world Y (baseY=0)
                    //   local Z = world Z + 25 = trainZ - 0.158 (trainZ is already city.group local)
                    if (city && city.f1Model && city.f1Model.parent === city.trainModel) {
                        city.group.add(city.f1Model);
                        city.f1Model.position.set(portalX - 7.5, trainY + 0.11602419564293629, trainZ - 0.15858486492682247);
                        city.f1Model.rotation.set(0, -Math.PI / 2, 0);
                    }

                    // Camera locked in cockpit — X is FIXED (no drift)
                    const camX = portalX - 3.0;
                    const camY = cockpitY; // anchor: jet positioned so cockpit is at this height
                    const PILOT_Y = 0.3; // ← raise/lower POV above cockpit center (only moves camera, not jet)

                    // Spawn jet with camera at cockpit:
                    // city.group.position.z = -25 (world), so jet local Z ≠ jet world Z.
                    // cockpitOffset (model-viewer mm, scale=0.008, rotY=PI/2):
                    //   worldX += localZ*scale  worldY += localY*scale  worldZ += -localX*scale
                    const GROUP_Z = -25;
                    const jetScale = (city && city.rescueJetReady && city.rescueJet) ? city.rescueJet.scale.x : 0.008;
                    const CKPT_OX = -5156.59 * jetScale;
                    const CKPT_OY = 296.72 * jetScale;
                    const CKPT_OZ = 322.07 * jetScale;
                    const camWorldZ = cockpitZ + GROUP_Z; // world Z for the cockpit
                    if (city && city.rescueJet) {
                        const jetX = camX - CKPT_OX;
                        const jetY = camY - CKPT_OY;   // jet anchored to camY — cockpit lands at camY
                        const jetZ = camWorldZ - GROUP_Z - CKPT_OZ;
                        city.rescueJet.position.set(jetX, jetY, jetZ);
                        city.rescueJet.rotation.set(0, Math.PI / 2, 0);
                        if (city.rescueJetMat) city.rescueJetMat.opacity = 1;
                    }

                    // Camera transition across the void from the track to the jet cockpit
                    //   Stage 1 (0.0 → 0.5): Fly across the Z-void from track (trainZ) to jet entry point
                    //   Stage 2 (0.5 → 1.0): Drop down from entry point into the seat
                    const seatCamX = portalX - 3.0;
                    const seatCamY = cockpitY + PILOT_Y;
                    const seatCamZ = cockpitZ + GROUP_Z; // -49.35

                    const entryCamX = seatCamX + 0.235;
                    const entryCamY = seatCamY + 1.30;
                    const entryCamZ = seatCamZ - 0.053;

                    let curCamX, curCamY, curCamZ;
                    let targetRotationX;

                    if (norm < 0.5) {
                        const t = norm / 0.5;
                        // Fly across the void
                        curCamX = scrollMath.lerp(portalX - 3.0, entryCamX, t);
                        curCamY = scrollMath.lerp(trainY + 0.3, entryCamY, t);
                        curCamZ = scrollMath.lerp(trainZ - 0.15858486492682247 + GROUP_Z, entryCamZ, t); // Smooth world Z from -24.32 to -49.40

                        // Look down and slightly forward during the leap
                        targetRotationX = scrollMath.lerp(cockpitRotX, 0.35, t);
                    } else {
                        const t = (norm - 0.5) / 0.5;
                        // Drop down into seat
                        curCamX = scrollMath.lerp(entryCamX, seatCamX, t);
                        curCamY = scrollMath.lerp(entryCamY, seatCamY, t);
                        curCamZ = scrollMath.lerp(entryCamZ, seatCamZ, t);

                        // Level out rotation to seated pitch (0.04)
                        targetRotationX = scrollMath.lerp(0.35, 0.04, t);
                    }

                    gl.camera.position.set(curCamX, curCamY, curCamZ);
                    gl.camera.rotation.order = 'YXZ';
                    gl.camera.rotation.y = cockpitRotY;
                    gl.camera.rotation.x = targetRotationX;
                    gl.camera.rotation.z = 0;

                    // Smooth FOV transition (lerps from Sub-D's 55 to seated 110)
                    setCameraFov(scrollMath.lerp(55, 110, norm), true);

                    // Update the 3D HUD canvas with Sub-E static values
                    drawCockpitHUDCanvas(city, 0, 0);


                    // F1 ejection: surge forward and fly diagonally towards the jet's Z-line
                    if (city && city.f1Model) {
                        const startX = portalX - 7.5;          // Matches the end of Sub-D portal eject!
                        const startY = trainY + 0.11602419564293629;
                        const endX = portalX - 21.0; // Fly further ahead so it lands in front of the jet!
                        const endY = cockpitY + 0.3; // Match Sub-F eye level height!

                        // Cubic ease-out curve for fast launch ahead of the camera!
                        const tCar = 1 - Math.pow(1 - norm, 3);
                        const tSpin = scrollMath.smoothstep(scrollMath.clamp01((norm - 0.3) / 0.7));

                        const carX = scrollMath.lerp(startX, endX, tCar);
                        const carY = scrollMath.lerp(startY, endY, tCar) + Math.sin(norm * Math.PI) * 1.5;
                        // Tied to the camera's local Z coordinate inside city.group to prevent double-transformation glitches
                        const carZ = curCamZ - GROUP_Z + 1.6 * tCar;

                        city.f1Model.position.set(carX, carY, carZ);

                        // Seamless scale up from 80.0 (original) to 120.0 to counteract perspective compression
                        const carScale = scrollMath.lerp(80.0, 120.0, norm);
                        city.f1Model.scale.setScalar(carScale);

                        // Rotation: stays flat until spin phase kicks in
                        city.f1Model.rotation.y = -Math.PI / 2 + tSpin * 1.5 + Math.sin(tSpin * Math.PI * 2) * 0.4;
                        city.f1Model.rotation.x = tSpin * 0.6 + Math.sin(tSpin * Math.PI * 3) * 0.2;
                        city.f1Model.rotation.z = tSpin * 0.4 + Math.sin(tSpin * Math.PI * 2) * 0.15;
                    }

                } else if (drivePct < SUB_F) {
                    // ── Sub-F: locked in cockpit, F1 floats ahead ──
                    const norm = (drivePct - SUB_E) / (SUB_F - SUB_E);
                    if (smashFlash) smashFlash.style.opacity = '0';

                    // Safety: if still in trainModel (e.g. jumped here via fast scroll), move it cleanly
                    if (city && city.f1Model && city.f1Model.parent === city.trainModel) {
                        city.group.add(city.f1Model);
                        city.f1Model.position.set(portalX - 21.0, cockpitY + 0.3, trainZ - 0.15858486492682247);
                        city.f1Model.rotation.set(0.6, -Math.PI / 2 + 1.5, 0.4);
                    }

                    const GROUP_Z = -25;
                    const jetScale = (city && city.rescueJetReady && city.rescueJet) ? city.rescueJet.scale.x : 0.008;
                    const CKPT_OX = -5156.59 * jetScale;
                    const CKPT_OY = 296.72 * jetScale;
                    const CKPT_OZ = 322.07 * jetScale;

                    // ── Collision check & shake choreography ──
                    const isColliding = norm >= 0.72 && norm <= 0.84; // Perfect alignment with crossing at norm=0.78

                    if (smashFlash) {
                        smashFlash.style.opacity = '0'; // Completely disable full-screen red flashbang
                    }

                    // Jet advances at a smooth, steady cinematic speed (26 units total)
                    const jetAdvance = scrollMath.smoothstep(norm) * 26.0;
                    const camX = portalX - 3.0 - jetAdvance;

                    // Straight path flight (no lateral swoop to avoid the car - we fly directly through it!)
                    const camWorldZ = cockpitZ + GROUP_Z;

                    const bankAngle = Math.sin(norm * Math.PI * 2) * 0.05;

                    const camY = cockpitY;
                    const PILOT_Y = 0.3;

                    // Car Z: stays fixed slightly to the left (world Z = -47.75) to prevent tire clipping
                    const carFixedZ = cockpitZ + 1.6;

                    // Car braking: starts moving, decelerates sharply via ease-out cubic.
                    // Total car travel: 3 units (just crawling to a stop under braking)
                    const carBrakeCurve = 1 - Math.pow(1 - Math.min(norm / 0.8, 1.0), 3); // ease-out cubic, finishes at norm=0.8
                    const carX = portalX - 21.0 - carBrakeCurve * 3.0; // brakes from -21 to -24, then stationary

                    if (city && city.rescueJet) {
                        const jetX = camX - CKPT_OX;
                        const jetY = camY - CKPT_OY;
                        const jetZ = camWorldZ - GROUP_Z - CKPT_OZ;
                        city.rescueJet.position.set(jetX, jetY, jetZ);
                        city.rescueJet.rotation.set(bankAngle * 0.3, Math.PI / 2, bankAngle);
                        if (city.rescueJetMat) city.rescueJetMat.opacity = 1;
                    }

                    // Camera sits PILOT_Y above cockpit center (with shake if colliding!)
                    const shakeX = isColliding ? (Math.random() - 0.5) * 0.05 : 0;
                    const shakeY = isColliding ? (Math.random() - 0.5) * 0.05 : 0;
                    const shakeZ = isColliding ? (Math.random() - 0.5) * 0.05 : 0;

                    gl.camera.position.set(camX + shakeX, camY + PILOT_Y + shakeY, camWorldZ + shakeZ);
                    gl.camera.rotation.order = 'YXZ';
                    gl.camera.rotation.y = cockpitRotY + Math.sin(norm * Math.PI * 2) * 0.018 + (isColliding ? (Math.random() - 0.5) * 0.04 : 0);
                    gl.camera.rotation.x = 0.04 + bankAngle * 0.25 + (isColliding ? (Math.random() - 0.5) * 0.04 : 0);
                    gl.camera.rotation.z = bankAngle;

                    // Fov lerps from 110 (seated) to 100 to keep view cinematic and wide
                    setCameraFov(scrollMath.lerp(110, 100, scrollMath.smoothstep(norm)), true);
                    drawCockpitHUDCanvas(city, norm, bankAngle);

                    // Animate speed lines: hypersonic light streaks passing cockpit
                    if (speedLines) {
                        let opacity = 0;
                        if (norm < 0.72) {
                            opacity = scrollMath.clamp01((norm - 0.3) / 0.42) * 0.85;
                        } else if (norm <= 0.84) {
                            opacity = 0.85;
                        } else {
                            opacity = scrollMath.lerp(0.85, 0, (norm - 0.84) / 0.16);
                        }
                        speedLines.lineMat.opacity = opacity;

                        // Shift each thick white line individually past the camera (flowing backwards cleanly)
                        const elapsed = Date.now() * 0.08; // smooth backwards speed
                        speedLines.lines.forEach(l => {
                            let relX = (l.baseX - elapsed) % 40;
                            if (relX < -20) relX += 40;
                            if (relX > 20) relX -= 40;
                            l.mesh.position.x = camX + relX;
                        });
                        speedLines.group.position.set(0, 0, 0); // locked to world space
                    }

                    // F1 car breakup debris on impact (norm >= 0.78)
                    if (city && city.f1Model) {
                        if (norm >= 0.78) {
                            // Hide original F1 car
                            city.f1Model.visible = false;

                            if (debris) {
                                debris.group.visible = true;

                                const crashX = portalX - 24.0;
                                const crashY = cockpitY + 0.3;
                                const crashZ = carFixedZ;
                                debris.group.position.set(crashX, crashY, crashZ);

                                const tExplode = (norm - 0.78) / 0.22;
                                debris.particles.forEach(p => {
                                    p.mesh.position.set(p.vx * tExplode * 0.4, p.vy * tExplode * 0.4, p.vz * tExplode * 0.4);
                                    p.mesh.rotation.set(p.rx * tExplode, p.ry * tExplode, p.rz * tExplode);

                                    const scale = scrollMath.clamp01(1.0 - tExplode);
                                    p.mesh.scale.setScalar(scale);
                                });
                            }
                        } else {
                            // Show F1 car
                            city.f1Model.visible = true;
                            city.f1Model.position.set(carX, cockpitY + 0.3, carFixedZ); // Eye-level height
                            city.f1Model.scale.setScalar(120.0);
                            city.f1Model.rotation.set(0, 0, 0); // Sideways blocking the track

                            if (debris) {
                                debris.group.visible = false;
                            }
                        }
                    }
                } else {
                    // ── Sub-G / Sub-H: pull up to top-down, then straight flight through experience nodes ──
                    //
                    // Sub-G  0.86 → 0.92  camera rises from cockpit to overhead view, jet stationary
                    // Sub-H  0.92 → 1.00  jet flies straight in -X, crashing through 4 experience obstacle boxes

                    const SUB_G_END = 0.63;
                    if (smashFlash) smashFlash.style.opacity = '0';

                    const GROUP_Z = -25;
                    const jetScale = (city && city.rescueJetReady && city.rescueJet) ? city.rescueJet.scale.x : 0.008;
                    const CKPT_OX = -5156.59 * jetScale;
                    const CKPT_OY = 296.72 * jetScale;
                    const CKPT_OZ = 322.07 * jetScale;

                    const finalCamX = portalX - 38.0;
                    const finalCamWorldZ = cockpitZ + GROUP_Z;

                    // ── Normalised progress for each phase ──
                    const isPullingUp = drivePct < SUB_G_END;
                    const pullNorm = isPullingUp
                        ? (drivePct - SUB_F) / (SUB_G_END - SUB_F)
                        : 1.0;
                    const easeG = scrollMath.smoothstep(pullNorm);
                    const flyNorm = isPullingUp
                        ? 0
                        : (drivePct - SUB_G_END) / (1.0 - SUB_G_END); // 0→1 straight flight

                    // ── Flight Path to Aircraft Carrier Landing ──
                    const FLY_X_TRAVEL = 240.0; // unified flight travel distance
                    const jetFlyX = finalCamX - flyNorm * FLY_X_TRAVEL; // jet advances in -X

                    // ── Experience project data ──
                    const EXP_NODES = [
                        {
                            title: 'ADRIG AI',
                            role: 'Software Development Engineer',
                            type: 'INTERNSHIP',
                            year: '2026',
                            stack: 'On-site · Chennai · Full Stack',
                            desc: 'SDE Intern at ADRIG AI Technologies Pvt. Ltd. Building production software at an AI-focused company. May 2026 – Present.',
                            status: '● Current',
                        },
                        {
                            title: 'ANDROID CLUB',
                            role: 'Outreach — VIT Chennai',
                            type: 'LEADERSHIP',
                            year: '2025',
                            stack: 'Part-time · Hybrid · Chennai',
                            desc: 'Outreach member at Android Club VITC. Managing community engagement and representing the club across events. Apr 2025 – Present.',
                            status: '● Current',
                        },
                        {
                            title: 'LLMVERSE',
                            role: 'Runner-Up 2',
                            type: 'HACKATHON',
                            year: '2025',
                            stack: 'AI · LLM · 12-Hour Sprint',
                            desc: 'Runner-Up 2 at LLMverse — a 12-hour hackathon organised by the Artificial Intelligence Club, VIT Chennai. Feb 2025.',
                            status: '● Awarded',
                        },
                    ];

                    // ── Lazy-init obstacle meshes ──
                    // Reset if node count has changed (e.g. after data update)
                    if (window._expObstacles && window._expObstacles.length !== EXP_NODES.length) {
                        window._expObstacles.forEach(obs => {
                            if (obs.group && obs.group.parent) obs.group.parent.remove(obs.group);
                        });
                        window._expObstacles = null;
                    }
                    if (!window._expObstacles && gl && gl.scene) {
                        const spacing = 16.0; // unified spacing
                        const GATE_Y = cockpitY + 0.05;
                        const GATE_SPAN = isMobileScreen ? 1.8 : 7.0; // tight gate span on mobile

                        // ── Clean Space Flight Path ──
                        window._runwayGroup = null;
                        window._pathTube = null;

                        window._expObstacles = EXP_NODES.map((node, i) => {
                            const obsWorldX = finalCamX - spacing * (i + 1);
                            const group = new THREE.Group();
                            group.position.set(obsWorldX, GATE_Y, finalCamWorldZ);

                            // ── Label side: desktop alternates left/right (+Z / -Z), mobile places ALL cards on screen right (-Z) ──
                            const labelSide = isMobileScreen ? -1 : ((i % 2 === 0) ? 1 : -1);

                            // ── Gate: target lock bar ──
                            const WING_CLEAR = isMobileScreen ? 1.5 : 3.6;
                            const gateBarPts = isMobileScreen ? [
                                new THREE.Vector3(0, 0, 2.0),  // connects from jet right wingtip on screen left
                                new THREE.Vector3(0, 0, -2.0), // connects to target lock dot on screen right
                            ] : [
                                new THREE.Vector3(0, 0, labelSide * WING_CLEAR),
                                new THREE.Vector3(0, 0, labelSide * GATE_SPAN),
                            ];
                            const gateBarGeo = new THREE.BufferGeometry().setFromPoints(gateBarPts);
                            const gateMat = new THREE.LineBasicMaterial({ color: 0xff4d00, transparent: true, opacity: 0 });
                            const gateLines = new THREE.Line(gateBarGeo, gateMat);
                            group.add(gateLines);

                            // Tick marks on the label side only
                            const tickMat = new THREE.LineBasicMaterial({ color: 0xff4d00, transparent: true, opacity: 0 });
                            const tickGroup = new THREE.Group();
                            const tickPositions = isMobileScreen ? [-2.0, -4.5] : [labelSide * (GATE_SPAN * 0.6), labelSide * GATE_SPAN];
                            for (const tz of tickPositions) {
                                const pts = [
                                    new THREE.Vector3(0, 0, tz),
                                    new THREE.Vector3(0.5, 0, tz),
                                ];
                                const tg = new THREE.BufferGeometry().setFromPoints(pts);
                                tickGroup.add(new THREE.Line(tg, tickMat));
                            }
                            // Target lock impact dot at gate lock point
                            const dotGeo = new THREE.PlaneGeometry(0.5, 0.5);
                            const dotMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 });
                            const dot = new THREE.Mesh(dotGeo, dotMat);
                            dot.rotation.x = -Math.PI / 2;
                            dot.position.z = isMobileScreen ? -2.0 : (labelSide * GATE_SPAN);
                            group.add(dot);

                            // ── Tactical MFD Label Panel ──
                            // Desktop: PANEL_W 34.0 (length) x PANEL_H 15.0 (width), Canvas 1600x750
                            // Mobile: Complete tall portrait redesign (PANEL_W 16.0 x PANEL_H 14.0, Canvas 1000x1350) positioned at LABEL_Z = -8.2 (right half of mobile viewport)
                            const PANEL_W = isMobileScreen ? 16.0 : 34.0;
                            const PANEL_H = isMobileScreen ? 14.0 : 15.0;
                            const LABEL_Z = isMobileScreen ? -8.2 : (labelSide * (GATE_SPAN + PANEL_W * 0.5 + 2.5));

                            const CANVAS_TOKENS = {
                                COLOR_BG: '#06070a',
                                COLOR_ORANGE: '#ff4d00',
                                COLOR_CYAN: '#00ffcc',
                                COLOR_TEXT: '#ffffff',
                                COLOR_TEXT_MUTED: 'rgba(240, 245, 255, 0.85)',
                                FONT_MONO: '"JetBrains Mono", monospace',
                                FONT_SANS: '"Inter", sans-serif'
                            };

                            const CW = isMobileScreen ? 1000 : 1600;
                            const CH = isMobileScreen ? 1350 : 750;
                            const lc = document.createElement('canvas');
                            lc.width = CW;
                            lc.height = CH;
                            const lx = lc.getContext('2d');

                            // 1. Dark Cockpit MFD Glass Background
                            lx.fillStyle = CANVAS_TOKENS.COLOR_BG;
                            lx.fillRect(0, 0, CW, CH);

                            // Tactical grid background
                            lx.strokeStyle = 'rgba(255, 77, 0, 0.04)';
                            lx.lineWidth = 1;
                            const gSize = 32;
                            for (let gx = 0; gx < CW; gx += gSize) {
                                lx.beginPath(); lx.moveTo(gx, 0); lx.lineTo(gx, CH); lx.stroke();
                            }
                            for (let gy = 0; gy < CH; gy += gSize) {
                                lx.beginPath(); lx.moveTo(0, gy); lx.lineTo(CW, gy); lx.stroke();
                            }

                            if (isMobileScreen) {
                                // ── MOBILE TALL PORTRAIT CARD CANVAS DRAWING (1000x1350) ──
                                // 1. Deep Obsidian MFD Background
                                lx.fillStyle = '#07090e';
                                lx.fillRect(0, 0, CW, CH);

                                // Subtle diagonal cyan grid matrix
                                lx.strokeStyle = 'rgba(0, 255, 204, 0.05)';
                                lx.lineWidth = 1.5;
                                for (let d = -CH; d < CW + CH; d += 48) {
                                    lx.beginPath(); lx.moveTo(d, 0); lx.lineTo(d + CH, CH); lx.stroke();
                                }

                                // Solid orange accent stripe on left edge
                                lx.fillStyle = '#ff4d00';
                                lx.fillRect(0, 0, 14, CH);

                                // Outer Chamfered Neon Frame
                                const ch = 36;
                                lx.strokeStyle = '#ff4d00';
                                lx.lineWidth = 6;
                                lx.beginPath();
                                lx.moveTo(ch, 12);
                                lx.lineTo(CW - 12, 12);
                                lx.lineTo(CW - 12, CH - ch);
                                lx.lineTo(CW - ch, CH - 12);
                                lx.lineTo(12, CH - 12);
                                lx.lineTo(12, ch);
                                lx.closePath();
                                lx.stroke();

                                // Inner Cyan HUD Border
                                lx.strokeStyle = 'rgba(0, 255, 204, 0.45)';
                                lx.lineWidth = 2.5;
                                lx.beginPath();
                                lx.moveTo(ch + 8, 22);
                                lx.lineTo(CW - 22, 22);
                                lx.lineTo(CW - 22, CH - ch - 8);
                                lx.lineTo(CW - ch - 8, CH - 22);
                                lx.lineTo(22, CH - 22);
                                lx.lineTo(22, ch + 8);
                                lx.closePath();
                                lx.stroke();

                                // Heavy Corner Brackets
                                const bLen = 54;
                                lx.strokeStyle = 'rgba(255, 77, 0, 0.95)';
                                lx.lineWidth = 5;
                                lx.beginPath(); lx.moveTo(26, 36); lx.lineTo(26 + bLen, 36); lx.stroke();
                                lx.beginPath(); lx.moveTo(36, 26); lx.lineTo(36, 26 + bLen); lx.stroke();
                                lx.beginPath(); lx.moveTo(CW - 26 - bLen, 30); lx.lineTo(CW - 30, 30); lx.lineTo(CW - 30, 30 + bLen); lx.stroke();
                                lx.beginPath(); lx.moveTo(CW - 30, CH - 30 - bLen); lx.lineTo(CW - 30, CH - 30); lx.lineTo(CW - 30 - bLen, CH - 30); lx.stroke();
                                lx.beginPath(); lx.moveTo(30, CH - 30 - bLen); lx.lineTo(30, CH - 30); lx.lineTo(30 + bLen, CH - 30); lx.stroke();

                                const padX = 52;

                                // ── Top Header Section ──
                                lx.font = 'bold 38px "JetBrains Mono", monospace';
                                lx.fillStyle = '#00ffcc';
                                lx.textAlign = 'left';
                                lx.fillText(`Experience ${String(i + 1).padStart(2, '0')}`, padX, 76);

                                // Year Pill Badge on Right
                                lx.font = 'bold 32px "JetBrains Mono", monospace';
                                const yearTxt = `${node.year}`;
                                const yearW = lx.measureText(yearTxt).width + 36;
                                lx.fillStyle = 'rgba(255, 77, 0, 0.2)';
                                lx.fillRect(CW - padX - yearW, 40, yearW, 52);
                                lx.strokeStyle = 'rgba(255, 77, 0, 0.7)';
                                lx.lineWidth = 2;
                                lx.strokeRect(CW - padX - yearW, 40, yearW, 52);
                                lx.fillStyle = '#ffaa77';
                                lx.textAlign = 'center';
                                lx.fillText(yearTxt, CW - padX - yearW / 2, 76);

                                // Top Divider Rule
                                const rule1Y = 114;
                                const grad1 = lx.createLinearGradient(padX, 0, CW - padX, 0);
                                grad1.addColorStop(0, 'rgba(255, 77, 0, 0.85)');
                                grad1.addColorStop(0.6, 'rgba(0, 255, 204, 0.4)');
                                grad1.addColorStop(1, 'rgba(255, 77, 0, 0.1)');
                                lx.strokeStyle = grad1;
                                lx.lineWidth = 3;
                                lx.beginPath(); lx.moveTo(padX, rule1Y); lx.lineTo(CW - padX, rule1Y); lx.stroke();

                                // ── Title & Role Section ──
                                lx.fillStyle = '#ffffff';
                                lx.shadowColor = 'rgba(255, 77, 0, 0.8)';
                                lx.shadowBlur = 18;
                                // Scale font down if title is too wide
                                let titleFontSizeM = 120;
                                lx.font = `900 ${titleFontSizeM}px "Syne", sans-serif`;
                                const titleMaxWidthM = CW - padX * 2;
                                while (lx.measureText(node.title).width > titleMaxWidthM && titleFontSizeM > 48) {
                                    titleFontSizeM -= 6;
                                    lx.font = `900 ${titleFontSizeM}px "Syne", sans-serif`;
                                }
                                lx.textAlign = 'left';
                                lx.fillText(node.title, padX, rule1Y + 140);
                                lx.shadowBlur = 0;

                                lx.font = 'bold 40px "JetBrains Mono", monospace';
                                lx.fillStyle = '#00ffcc';
                                lx.fillText(`${node.role.toUpperCase()}`, padX, rule1Y + 204);

                                // ── Tech Stack Badges Section ──
                                const stackHeaderY = rule1Y + 280;
                                lx.font = 'bold 32px "JetBrains Mono", monospace';
                                lx.fillStyle = '#ff4d00';
                                lx.fillText('Tech Stack', padX, stackHeaderY);

                                const stackItems = node.stack.split('·').map(s => s.trim());
                                let stackX = padX;
                                let stackY = stackHeaderY + 24;
                                lx.font = 'bold 34px "JetBrains Mono", monospace';
                                stackItems.forEach(item => {
                                    const tw = lx.measureText(item).width;
                                    const pw = tw + 36;
                                    const ph = 54;
                                    if (stackX + pw > CW - padX) {
                                        stackX = padX;
                                        stackY += 68;
                                    }
                                    lx.fillStyle = 'rgba(255, 77, 0, 0.16)';
                                    lx.fillRect(stackX, stackY, pw, ph);
                                    lx.strokeStyle = 'rgba(0, 255, 204, 0.6)';
                                    lx.lineWidth = 2;
                                    lx.strokeRect(stackX, stackY, pw, ph);
                                    lx.fillStyle = '#ffffff';
                                    lx.textAlign = 'left';
                                    lx.fillText(item, stackX + 18, stackY + 38);
                                    stackX += pw + 16;
                                });

                                // Middle Divider Rule
                                const rule2Y = Math.max(stackY + 84, rule1Y + 480);
                                lx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
                                lx.lineWidth = 2;
                                lx.beginPath(); lx.moveTo(padX, rule2Y); lx.lineTo(CW - padX, rule2Y); lx.stroke();

                                // ── Overview Section ──
                                const briefY = rule2Y + 60;
                                lx.font = 'bold 36px "JetBrains Mono", monospace';
                                lx.fillStyle = '#ff4d00';
                                lx.fillText('Overview', padX, briefY);

                                lx.fillStyle = 'rgba(255, 240, 230, 0.96)';
                                lx.font = '700 38px "Inter", sans-serif';
                                const descWords = node.desc.split(' ');
                                let descLine = '', descY = briefY + 54;
                                for (const w of descWords) {
                                    const test = descLine + w + ' ';
                                    if (lx.measureText(test).width > CW - padX * 2 && descLine) {
                                        lx.fillText(descLine.trim(), padX, descY);
                                        descLine = w + ' ';
                                        descY += 54;
                                        if (descY > CH - 140) break;
                                    } else {
                                        descLine = test;
                                    }
                                }
                                if (descLine.trim() && descY <= CH - 140) lx.fillText(descLine.trim(), padX, descY);

                                // ── Bottom Footer Status Section ──
                                const footerY = CH - 84;
                                lx.strokeStyle = 'rgba(255, 77, 0, 0.4)';
                                lx.lineWidth = 2.5;
                                lx.beginPath(); lx.moveTo(padX, footerY); lx.lineTo(CW - padX, footerY); lx.stroke();

                                // Glowing Green Target Status Dot
                                lx.fillStyle = '#00ff88';
                                lx.beginPath(); lx.arc(padX + 12, footerY + 36, 10, 0, Math.PI * 2); lx.fill();

                                lx.font = 'bold 34px "JetBrains Mono", monospace';
                                lx.fillStyle = '#ff4d00';
                                lx.textAlign = 'left';
                                lx.fillText(`${node.status}`, padX + 36, footerY + 46);

                                lx.font = 'bold 28px "JetBrains Mono", monospace';
                                lx.fillStyle = 'rgba(0, 255, 204, 0.7)';
                                lx.textAlign = 'right';
                                lx.fillText(`Experience ${String(i + 1).padStart(2, '0')}`, CW - padX, footerY + 46);
                            } else {
                                // ── DESKTOP LANDSCAPE CARD CANVAS DRAWING (1600x750) ──
                                const ch = 32;
                                lx.strokeStyle = '#ff4d00';
                                lx.lineWidth = 5;
                                lx.beginPath();
                                lx.moveTo(ch, 6);
                                lx.lineTo(CW - 6, 6);
                                lx.lineTo(CW - 6, CH - ch);
                                lx.lineTo(CW - ch, CH - 6);
                                lx.lineTo(6, CH - 6);
                                lx.lineTo(6, ch);
                                lx.closePath();
                                lx.stroke();

                                lx.strokeStyle = 'rgba(255, 77, 0, 0.35)';
                                lx.lineWidth = 2;
                                lx.beginPath();
                                lx.moveTo(ch + 8, 16);
                                lx.lineTo(CW - 16, 16);
                                lx.lineTo(CW - 16, CH - ch - 8);
                                lx.lineTo(CW - ch - 8, CH - 16);
                                lx.lineTo(16, CH - 16);
                                lx.lineTo(16, ch + 8);
                                lx.closePath();
                                lx.stroke();

                                const barSegs = 6;
                                const barX = 24;
                                const barStartY = 80;
                                const barH = CH - 160;
                                const segH = (barH - (barSegs - 1) * 6) / barSegs;
                                for (let sb = 0; sb < barSegs; sb++) {
                                    lx.fillStyle = sb < 4 ? '#ff4d00' : 'rgba(255, 77, 0, 0.25)';
                                    lx.fillRect(barX, barStartY + sb * (segH + 6), 8, segH);
                                }

                                const bl = 48;
                                lx.strokeStyle = 'rgba(255, 77, 0, 0.85)';
                                lx.lineWidth = 4;
                                lx.beginPath(); lx.moveTo(20, 36); lx.lineTo(20 + bl, 36); lx.stroke();
                                lx.beginPath(); lx.moveTo(36, 20); lx.lineTo(36, 20 + bl); lx.stroke();
                                lx.beginPath(); lx.moveTo(CW - 20 - bl, 32); lx.lineTo(CW - 32, 32); lx.lineTo(CW - 32, 32 + bl); lx.stroke();
                                lx.beginPath(); lx.moveTo(CW - 32, CH - 32 - bl); lx.lineTo(CW - 32, CH - 32); lx.lineTo(CW - 32 - bl, CH - 32); lx.stroke();
                                lx.beginPath(); lx.moveTo(32, CH - 32 - bl); lx.lineTo(32, CH - 32); lx.lineTo(32 + bl, CH - 32); lx.stroke();

                                lx.font = 'bold 30px "JetBrains Mono", monospace';
                                lx.fillStyle = 'rgba(255, 77, 0, 0.7)';
                                lx.textAlign = 'left';
                                lx.fillText(`Experience ${String(i + 1).padStart(2, '0')}`, 60, 60);

                                const typeLabel = node.type || 'PROJECT';
                                lx.font = 'bold 24px "JetBrains Mono", monospace';
                                const badgeX = 540, badgeY = 32, badgeW = 180, badgeH = 38;
                                lx.fillStyle = 'rgba(255, 77, 0, 0.15)';
                                lx.fillRect(badgeX, badgeY, badgeW, badgeH);
                                lx.strokeStyle = '#ff4d00';
                                lx.lineWidth = 2;
                                lx.strokeRect(badgeX, badgeY, badgeW, badgeH);
                                lx.fillStyle = '#ff4d00';
                                lx.textAlign = 'center';
                                lx.fillText(`[ ${typeLabel.toUpperCase()} ]`, badgeX + badgeW / 2, badgeY + 26);

                                lx.font = 'bold 30px "JetBrains Mono", monospace';
                                lx.fillStyle = 'rgba(255, 77, 0, 0.8)';
                                lx.textAlign = 'right';
                                lx.fillText(`${node.year}  ·  Chennai`, CW - 48, 60);

                                lx.strokeStyle = 'rgba(255, 77, 0, 0.3)';
                                lx.lineWidth = 2.5;
                                lx.beginPath(); lx.moveTo(60, 84); lx.lineTo(CW - 48, 84); lx.stroke();

                                lx.fillStyle = '#ffffff';
                                lx.shadowColor = 'rgba(255, 77, 0, 0.6)';
                                lx.shadowBlur = 16;
                                // Scale font down if title is too wide to fit the card
                                let titleFontSize = 136;
                                lx.font = `900 ${titleFontSize}px "Syne", sans-serif`;
                                const titleMaxWidth = CW - 120; // 60px padding each side
                                while (lx.measureText(node.title).width > titleMaxWidth && titleFontSize > 48) {
                                    titleFontSize -= 6;
                                    lx.font = `900 ${titleFontSize}px "Syne", sans-serif`;
                                }
                                lx.textAlign = 'left';
                                lx.fillText(node.title, 60, 220);
                                lx.shadowBlur = 0;

                                lx.fillStyle = '#00ffcc';
                                lx.font = 'bold 40px "JetBrains Mono", monospace';
                                lx.fillText(`${node.role.toUpperCase()}`, 60, 280);

                                lx.strokeStyle = 'rgba(255, 77, 0, 0.25)';
                                lx.lineWidth = 2;
                                lx.beginPath(); lx.moveTo(60, 308); lx.lineTo(CW - 48, 308); lx.stroke();

                                const stackItems = typeof node.stack === 'string' ? node.stack.split('·').map(s => s.trim()) : [];
                                let stackX = 60;
                                const stackY = 332;
                                lx.font = 'bold 26px "JetBrains Mono", monospace';
                                stackItems.forEach(item => {
                                    const tw = lx.measureText(item).width;
                                    const pw = tw + 36;
                                    const ph = 44;
                                    lx.fillStyle = 'rgba(255, 77, 0, 0.12)';
                                    lx.fillRect(stackX, stackY, pw, ph);
                                    lx.strokeStyle = 'rgba(255, 77, 0, 0.5)';
                                    lx.lineWidth = 1.5;
                                    lx.strokeRect(stackX, stackY, pw, ph);
                                    lx.fillStyle = '#ffaa77';
                                    lx.textAlign = 'left';
                                    lx.fillText(item, stackX + 18, stackY + 31);
                                    stackX += pw + 18;
                                });

                                lx.font = 'bold 30px "JetBrains Mono", monospace';
                                lx.fillStyle = '#ff4d00';
                                lx.fillText('Overview', 60, 436);

                                lx.fillStyle = 'rgba(240, 245, 255, 0.85)';
                                lx.font = '30px "Inter", sans-serif';
                                const descWords = node.desc.split(' ');
                                let descLine = '', descY = 482;
                                for (const w of descWords) {
                                    const test = descLine + w + ' ';
                                    if (lx.measureText(test).width > CW - 120 && descLine) {
                                        lx.fillText(descLine.trim(), 60, descY);
                                        descLine = w + ' ';
                                        descY += 44;
                                        if (descY > CH - 120) break;
                                    } else {
                                        descLine = test;
                                    }
                                }
                                if (descLine.trim()) lx.fillText(descLine.trim(), 60, descY);

                                lx.strokeStyle = 'rgba(255, 77, 0, 0.3)';
                                lx.lineWidth = 2;
                                lx.beginPath(); lx.moveTo(60, CH - 76); lx.lineTo(CW - 48, CH - 76); lx.stroke();

                                lx.fillStyle = '#00ff88';
                                lx.beginPath(); lx.arc(76, CH - 38, 9, 0, Math.PI * 2); lx.fill();
                                lx.font = 'bold 30px "JetBrains Mono", monospace';
                                lx.fillStyle = '#ff4d00';
                                lx.textAlign = 'left';
                                lx.fillText(`${node.status}`, 98, CH - 28);

                                lx.font = '26px "JetBrains Mono", monospace';
                                lx.fillStyle = 'rgba(255, 77, 0, 0.55)';
                                lx.textAlign = 'right';
                                lx.fillText(`Experience ${String(i + 1).padStart(2, '0')}`, CW - 48, CH - 28);
                            }

                            lx.setTransform(1, 0, 0, 1, 0, 0);

                            if (group._prevTex) {
                                group._prevTex.dispose();
                            }
                            const lTex = new THREE.CanvasTexture(lc);
                            lTex.flipY = true;
                            group._prevTex = lTex;

                            const labelGeo = new THREE.PlaneGeometry(PANEL_W, PANEL_H);
                            const labelMat = new THREE.MeshBasicMaterial({
                                map: lTex, transparent: true, depthWrite: false, side: THREE.DoubleSide,
                            });
                            const label = new THREE.Mesh(labelGeo, labelMat);
                            label.rotation.x = -Math.PI / 2; // flat on XZ plane, readable from top-down
                            label.rotation.z = Math.PI / 2;   // correct texture orientation
                            label.position.set(0, 0.05, LABEL_Z);
                            label.visible = false;
                            group.add(label);

                            // ── Tactical Elbow Connector Line ──
                            const connStart = labelSide * GATE_SPAN;
                            const connEnd = LABEL_Z - labelSide * (PANEL_W * 0.5 + 0.2);
                            const elbowZ = connStart + labelSide * (isMobileScreen ? 1.0 : 1.8);
                            const connPts = [
                                new THREE.Vector3(0, 0, connStart),
                                new THREE.Vector3(-0.6, 0, elbowZ),
                                new THREE.Vector3(-0.6, 0, connEnd),
                            ];
                            const connGeo = new THREE.BufferGeometry().setFromPoints(connPts);
                            const connMat = new THREE.LineBasicMaterial({ color: 0xff4d00, transparent: true, opacity: 0 });
                            const conn = new THREE.Line(connGeo, connMat);
                            conn.visible = false;
                            group.add(conn);

                            // ── Shatter shards — flat on XZ ──
                            const shards = [];
                            for (let s = 0; s < 24; s++) {
                                const sm = new THREE.Mesh(
                                    new THREE.PlaneGeometry(0.2 + Math.random() * 0.7, 0.08 + Math.random() * 0.3),
                                    new THREE.MeshBasicMaterial({ color: 0xff4d00, transparent: true, opacity: 1 })
                                );
                                sm.rotation.x = -Math.PI / 2;
                                sm.rotation.z = Math.random() * Math.PI * 2;
                                sm.visible = false;
                                group.add(sm);
                                shards.push({
                                    mesh: sm,
                                    vx: (Math.random() - 0.5) * 20,
                                    vy: 0,
                                    vz: (Math.random() - 0.5) * 20,
                                    rz: (Math.random() - 0.5) * 6,
                                });
                            }

                            gl.scene.add(group);

                            // ── Lock-on pulse rings — centred on the gate (jet impact point) ──
                            const ringMat1 = new THREE.MeshBasicMaterial({ color: 0xff4d00, transparent: true, opacity: 0, side: THREE.DoubleSide });
                            const ringMat2 = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide });
                            const ring1 = new THREE.Mesh(new THREE.RingGeometry(1.8, 2.0, 48), ringMat1);
                            const ring2 = new THREE.Mesh(new THREE.RingGeometry(0.8, 0.95, 48), ringMat2);
                            ring1.rotation.x = -Math.PI / 2;
                            ring2.rotation.x = -Math.PI / 2;
                            ring1.position.y = 0.03;
                            ring2.position.y = 0.03;
                            group.add(ring1);
                            group.add(ring2);

                            // ── Mobile customization: hide 3D side labels & connectors, keep center target rings ──
                            if (isMobileScreen) {
                                gateLines.visible = false;
                                tickGroup.visible = false;
                                dot.visible = false;
                                conn.visible = false;
                                label.visible = false;
                            }

                            return {
                                group, gateLines, gateMat, tickMat, dotMat, dot,
                                label, labelMat, conn, connMat,
                                ring1, ringMat1, ring2, ringMat2,
                                shards, worldX: obsWorldX, data: node, index: i,
                                hit: false, hitT: 0,
                                // lock-on state
                                locked: false, lockFlashT: 0,
                            };
                        });
                    }

                    // ── Camera & Turnaround Math ──
                    const OVERHEAD_HEIGHT = 32.0;
                    const startCamY = cockpitY + 0.3;
                    const targetCamY = cockpitY + OVERHEAD_HEIGHT;

                    // Remove landing strip if present
                    if (window._landingStrip) {
                        window._landingStrip.visible = false;
                    }
                    let camX, camY, camZ, pitchX, yawY, bankZ, targetFov, speedLineOpacity;

                    if (isPullingUp) {
                        camY = scrollMath.lerp(startCamY, targetCamY, easeG);
                        pitchX = scrollMath.lerp(0.04, -Math.PI / 2, easeG);
                        yawY = Math.PI / 2;
                        bankZ = 0;
                        targetFov = scrollMath.lerp(100, 72, easeG);
                        speedLineOpacity = scrollMath.lerp(0.85, 0.0, easeG);
                        camX = finalCamX;
                        camZ = finalCamWorldZ;
                    } else {
                        // ── Sub-H: Experience Gates → Cockpit Dive → Cockpit Carrier Landing → Carrier Hotspot ──
                        const cScale = 0.008;
                        const turnEndX = finalCamX - 0.80 * FLY_X_TRAVEL;
                        const carrierX = finalCamX - 220.0;
                        const carrierY = cockpitY - 1.0;
                        const carrierZ = finalCamWorldZ - GROUP_Z;

                        if (city && city.carrierModel && city.carrierReady) {
                            city.carrierModel.position.set(carrierX, carrierY, carrierZ);
                            city.carrierModel.rotation.y = -Math.PI / 2;
                            city.carrierModel.scale.setScalar(cScale);
                            city.carrierModel.visible = flyNorm > 0.20;
                        }

                        // Hotspots on carrier deck
                        const S = cScale;
                        const h1 = { ox: 2044.7567 * S, oy: 128.2941 * S, oz: -39.0343 * S };
                        const h2 = { ox: 2063.74944 * S, oy: 128.294756 * S, oz: -223.967208 * S };
                        const h3 = { ox: 1676.6043 * S, oy: 128.2941 * S, oz: 11.4416 * S };
                        const h4 = { ox: 87.2635 * S, oy: 128.2942 * S, oz: 87.2635 * S };

                        const JET_DECK_Y_OFFSET = -0.35;
                        const RUNWAY_Z_OFFSET = -1.35;

                        const td = { x: carrierX + h1.ox, y: carrierY + h1.oy - JET_DECK_Y_OFFSET, z: carrierZ + h1.oz + RUNWAY_Z_OFFSET };
                        const pov = { x: carrierX - 8.0, y: carrierY + h2.oy + 2.2, z: carrierZ + h2.oz + 2.5 };
                        const wp1 = { x: td.x, y: td.y, z: td.z };
                        const wp2 = { x: td.x, y: td.y, z: td.z };

                        const glToWZ = (glz) => finalCamWorldZ + (glz - carrierZ);

                        const phase1End = 0.35;
                        const phase2End = 0.48;

                        // Track whether all experience nodes have been passed.
                        // Used by touch/wheel handlers to re-enable section navigation
                        // after the flight sequence completes.
                        window._expNodesCleared = !isPullingUp && flyNorm >= phase1End;

                        const diveNorm = scrollMath.clamp01((flyNorm - phase1End) / (phase2End - phase1End));
                        const easeDive = scrollMath.smoothstep(diveNorm);

                        speedLineOpacity = 0;
                        bankZ = 0;

                        let jX, jY, jZ, jYaw, jPitch = 0;

                        if (flyNorm < phase1End) {
                            // Phase 1: Top-down overhead flight through ALL experience gates (BEAKAN, ANADROME 1, ANADROME 2, ZENITH)
                            const curJetFlyX = finalCamX - flyNorm * FLY_X_TRAVEL;
                            // On Mobile, jet flies directly down the CENTER of the screen (Z = 0.0) below camera
                            const mobileJetLaneZ = 0.0;

                            jX = curJetFlyX - CKPT_OX;
                            jY = cockpitY - CKPT_OY;
                            jZ = finalCamWorldZ - GROUP_Z + mobileJetLaneZ - CKPT_OZ;
                            jYaw = Math.PI / 2;

                            camX = curJetFlyX;
                            camY = targetCamY;
                            camZ = finalCamWorldZ;
                            pitchX = -Math.PI / 2;
                            yawY = Math.PI / 2;
                            targetFov = 72;
                        } else if (flyNorm < phase2End) {
                            // Phase 2: Deck Spectator Transition (starts AFTER passing node 4 ZENITH!)
                            const mobileJetLaneZ = 0.0;
                            const startPhase2X = finalCamX - phase1End * FLY_X_TRAVEL - CKPT_OX;
                            const startPhase2Y = cockpitY - CKPT_OY;
                            const startPhase2Z = finalCamWorldZ - GROUP_Z + mobileJetLaneZ - CKPT_OZ;

                            const entryX = td.x + 100.0;
                            const entryY = td.y + 10.0;
                            const entryZ = td.z;

                            jX = scrollMath.lerp(startPhase2X, entryX, easeDive);
                            jY = scrollMath.lerp(startPhase2Y, entryY, easeDive);
                            jZ = scrollMath.lerp(startPhase2Z, entryZ, easeDive);
                            jYaw = Math.PI / 2;
                            jPitch = scrollMath.lerp(0.0, -0.06, easeDive);

                            camX = scrollMath.lerp(finalCamX - flyNorm * FLY_X_TRAVEL, pov.x, easeDive);
                            camY = scrollMath.lerp(targetCamY, pov.y, easeDive);
                            camZ = scrollMath.lerp(finalCamWorldZ, glToWZ(pov.z), easeDive);

                            pitchX = scrollMath.lerp(-Math.PI / 2, -0.08, easeDive);
                            yawY = scrollMath.lerp(Math.PI / 2, -75 * Math.PI / 180, easeDive);
                            targetFov = scrollMath.lerp(72, 60, easeDive);

                            if (city && city.cockpitHUDCanvas) city.cockpitHUDCanvas.style.opacity = '0';
                        } else {
                            // Phase 3: Spectator Carrier Landing
                            const landNorm = scrollMath.clamp01((flyNorm - phase2End) / (1.0 - phase2End));
                            const appNorm = scrollMath.clamp01(landNorm / 0.50);
                            const appT = scrollMath.smoothstep(appNorm);

                            const curJetScale = scrollMath.lerp(0.008, 0.0032, appNorm);

                            if (landNorm < 0.50) {
                                jX = scrollMath.lerp(td.x + 100.0, td.x, appT);
                                jY = scrollMath.lerp(td.y + 10.0, td.y, appT);
                                jZ = td.z;
                                jPitch = scrollMath.lerp(-0.06, 0.0, appT);
                            } else {
                                jX = td.x;
                                jY = td.y;
                                jZ = td.z;
                                jPitch = 0.0;
                            }
                            jYaw = Math.PI / 2;

                            camX = pov.x;
                            camY = pov.y;
                            camZ = glToWZ(pov.z);

                            pitchX = -0.08;
                            yawY = -75 * Math.PI / 180;
                            targetFov = 60;

                            if (city && city.cockpitHUDCanvas) city.cockpitHUDCanvas.style.opacity = '0';
                        }

                        if (city && city.rescueJet) {
                            const flyScaleNorm = scrollMath.clamp01((flyNorm - 0.45) / 0.175);
                            const scaleVal = flyNorm < 0.45 ? 0.008 : scrollMath.lerp(0.008, 0.0032, flyScaleNorm);
                            city.rescueJet.scale.setScalar(scaleVal);
                            city.rescueJet.position.set(jX, jY, jZ);
                            city.rescueJet.rotation.set(jPitch, jYaw, 0);
                            if (city.rescueJetMat) city.rescueJetMat.opacity = 1.0;
                        }
                    }

                    gl.camera.position.set(camX, camY, camZ);
                    gl.camera.rotation.order = 'YXZ';
                    gl.camera.rotation.y = yawY;
                    gl.camera.rotation.x = pitchX;
                    gl.camera.rotation.z = bankZ || 0;

                    setCameraFov(targetFov);

                    // Speed lines
                    if (speedLines) {
                        speedLines.lineMat.opacity = speedLineOpacity;
                        if (speedLineOpacity > 0.01) {
                            const speedBoost = 1.0;
                            const elapsed = Date.now() * 0.14 * speedBoost;
                            const speedDir = 1;
                            speedLines.lines.forEach(l => {
                                let relX = (l.baseX - speedDir * elapsed) % 40;
                                if (relX < -20) relX += 40;
                                if (relX > 20) relX -= 40;
                                l.mesh.position.x = camX + relX;
                            });
                        }
                    }

                    if (city && city.f1Model) city.f1Model.visible = false;
                    if (debris) {
                        if (!isPullingUp) {
                            debris.group.visible = false;
                        } else {
                            debris.group.visible = true;
                            const crashX = portalX - 24.0;
                            const crashY = cockpitY + 0.3;
                            const crashZ = cockpitZ + 1.6;
                            debris.group.position.set(crashX, crashY, crashZ);
                            const tExplode = 1.0 + pullNorm * 0.5;
                            debris.particles.forEach(p => {
                                p.mesh.position.set(p.vx * tExplode * 0.4, p.vy * tExplode * 0.4, p.vz * tExplode * 0.4);
                                p.mesh.rotation.set(p.rx * tExplode, p.ry * tExplode, p.rz * tExplode);
                                const scale = scrollMath.clamp01(1.0 - tExplode);
                                p.mesh.scale.setScalar(scale);
                            });
                        }
                    }

                    // ── Obstacle update ──
                    const lockHud = document.getElementById('lock-hud');
                    const impactFlash = document.getElementById('impact-flash');
                    const lkRange = document.getElementById('lk-range');
                    const lkTarget = document.getElementById('lk-target');
                    const lkLocked = document.getElementById('lk-locked');

                    let shakeX = 0, shakeZ = 0, fovBump = 0;
                    let anyLockHudVisible = false;

                    if (window._expObstacles) {
                        const jetWorldX = isPullingUp ? finalCamX : jetFlyX;
                        if (window._runwayGroup) window._runwayGroup.visible = !isPullingUp;
                        if (window._pathTube) window._pathTube.visible = !isPullingUp;

                        window._expObstacles.forEach((obs) => {
                            const dist = jetWorldX - obs.worldX; // + = ahead, − = passed

                            if (obs.hit && dist > 0.5) {
                                obs.hit = false;
                                obs.hitT = 0;
                                obs.gateLines.visible = !isMobileScreen;
                                obs.dot.visible = !isMobileScreen;
                                obs.ring1.visible = true;
                                obs.ring2.visible = true;
                                obs.conn.visible = !isMobileScreen;
                                obs.shards.forEach(s => { s.mesh.visible = false; });
                            }

                            const inTurnaround = !isPullingUp && flyNorm > 0.53;
                            if (inTurnaround) {
                                obs.group.visible = false;
                                obs.label.visible = false;
                                obs.conn.visible = false;
                            } else {
                                obs.group.visible = Math.abs(dist) < 35;
                                obs.label.visible = !isMobileScreen; // Hide 3D side label card on mobile
                                obs.conn.visible = !isMobileScreen;
                            }

                            const absDist = Math.abs(dist);
                            const approachT = scrollMath.clamp01(1.0 - absDist / 24.0);

                            // ── Label & connector opacity (always — desktop only shows these) ──
                            obs.labelMat.opacity = dist <= 0 ? 1.0 : Math.max(0.4, approachT);
                            obs.connMat.opacity = isMobileScreen ? 0 : (dist <= 0 ? 0.45 : 0.45 * approachT);

                            if (!obs.hit) {
                                const inApproach = dist > 0 && dist < 24;
                                const inLockZone = dist > 0 && dist < 8;

                                obs.gateMat.opacity = 0.75 * approachT;
                                obs.tickMat.opacity = 0.5 * approachT;
                                obs.dotMat.opacity = approachT;

                                // ── Outer Ring: Bright neon orange target ring ──
                                if (inApproach) {
                                    const ringPulse = 0.85 + 0.15 * Math.sin(Date.now() * 0.008);
                                    obs.ringMat1.color.setHex(0xff5500);
                                    obs.ringMat1.opacity = Math.max(0.6, approachT * 0.95) * ringPulse;
                                    obs.ring1.scale.setScalar(scrollMath.lerp(1.6, 1.0, approachT));
                                } else {
                                    obs.ringMat1.opacity = 0;
                                }

                                // ── Inner Ring: Bright neon cyan target lock ring ──
                                if (inLockZone) {
                                    const lockT = scrollMath.clamp01((8 - dist) / 8); // 0→1 as dist 8→0
                                    const isLocked = lockT > 0.85;

                                    obs.ringMat2.color.setHex(0x00ffcc);
                                    obs.ringMat2.opacity = Math.max(0.7, lockT * 0.98);
                                    obs.ring2.scale.setScalar(scrollMath.lerp(1.4, 0.75, lockT));

                                    if (!isMobileScreen) {
                                        const strobe = isLocked
                                            ? (Math.sin(Date.now() * 0.025) > 0 ? 1.0 : 0.4)
                                            : 0.75 + 0.25 * Math.sin(Date.now() * 0.012);
                                        obs.gateMat.opacity = strobe;
                                        obs.dotMat.opacity = strobe;

                                        if (isLocked && !obs.locked) {
                                            obs.locked = true;
                                        }
                                    }
                                } else {
                                    obs.ringMat2.opacity = 0;
                                    obs.ring2.scale.setScalar(1.6);
                                    obs.locked = false;
                                }

                                // ── Hit trigger ──
                                if (dist < 0 && dist > -2.5) {
                                    obs.hit = true;
                                    obs.hitT = 0;

                                    if (!isMobileScreen) {
                                        obs.gateLines.visible = false;
                                        obs.dot.visible = false;
                                    }
                                    // Skip the scroll lock if a programmatic nav tween is in flight.
                                    // We still mark obs.hit (so shards play) but don't interrupt the tween.
                                    if (!window._programmaticScroll && scroll && scroll.lenis && !window._scrollLocked) {
                                        window._scrollLocked = true;
                                        if (!isMobileScreen) {
                                            scroll.lenis.stop();
                                            setTimeout(() => {
                                                scroll.lenis.start();
                                                window._scrollLocked = false;
                                            }, 200);
                                        } else {
                                            setTimeout(() => {
                                                window._scrollLocked = false;
                                            }, 600);
                                        }
                                    }
                                    obs.ring1.visible = false;
                                    obs.ring2.visible = false;
                                    obs.shards.forEach(s => { s.mesh.visible = true; });
                                }

                            } else {
                                // ── Post-hit: shards + camera effects ──
                                obs.hitT += 0.016;
                                const et = obs.hitT;

                                if (!isMobileScreen) {
                                    if (et < 0.5) {
                                        const shakeAmp = (1.0 - et / 0.5) * 0.18;
                                        shakeX += (Math.random() - 0.5) * shakeAmp;
                                        shakeZ += (Math.random() - 0.5) * shakeAmp;
                                    }
                                }

                                // Shard scatter + fade
                                const et2 = Math.min(et, 1.5);
                                obs.shards.forEach(s => {
                                    s.mesh.position.set(s.vx * et2 * 0.28, 0, s.vz * et2 * 0.28);
                                    s.mesh.rotation.z += s.rz * 0.016;
                                    const sc = scrollMath.clamp01(1.0 - et2 * 0.7);
                                    s.mesh.scale.setScalar(Math.max(sc, 0.001));
                                    s.mesh.material.opacity = sc;
                                });
                            }
                        });
                    }

                    // ── Clear lock HUD if nothing is in lock zone this frame ──
                    if (!anyLockHudVisible && lockHud && lockHud.classList.contains('lk-visible')) {
                        lockHud.classList.remove('lk-visible', 'lk-locked');
                        if (lkLocked) lkLocked.textContent = 'Tracking';
                    }
                    if (isPullingUp && lockHud) {
                        lockHud.classList.remove('lk-visible', 'lk-locked');
                        if (lkLocked) lkLocked.textContent = 'Tracking';
                    }

                    // ── Apply per-frame camera shake + FOV bump (additive on top of base values) ──
                    if (shakeX !== 0 || shakeZ !== 0) {
                        gl.camera.position.x += shakeX;
                        gl.camera.position.z += shakeZ;
                    }
                    if (fovBump !== 0) {
                        const currentFov = gl.camera.fov;
                        gl.camera.fov = currentFov + fovBump;
                        gl.camera.updateProjectionMatrix();
                    }

                    // Hide runway and reset obstacles when in pull-up (not yet flying)
                    if (isPullingUp) {
                        if (window._runwayGroup) window._runwayGroup.visible = false;
                        if (window._pathTube) window._pathTube.visible = false;
                        if (window._expObstacles) {
                            window._expObstacles.forEach(obs => {
                                obs.hit = false;
                                obs.hitT = 0;
                                obs.locked = false;
                                obs.lockFlashT = 0;
                                obs.gateLines.visible = true;
                                obs.dot.visible = true;
                                obs.label.visible = true;
                                obs.conn.visible = true;
                                obs.ring1.visible = true;
                                obs.ring2.visible = true;
                                obs.gateMat.opacity = 0;
                                obs.tickMat.opacity = 0;
                                obs.dotMat.opacity = 0;
                                obs.labelMat.opacity = 0;
                                obs.connMat.opacity = 0;
                                obs.ringMat1.opacity = 0;
                                obs.ringMat2.opacity = 0;
                                obs.ring1.scale.setScalar(1);
                                obs.ring2.scale.setScalar(1);
                                obs.shards.forEach(s => {
                                    s.mesh.visible = false;
                                    s.mesh.position.set(0, 0, 0);
                                    s.mesh.scale.setScalar(1);
                                });
                            });
                        }
                    }
                }
            } else if (scenePct < 0.16) {
                // Segment 1: Camera follows jet toward Earth, then dives into city.
                gl.camera.rotation.order = 'XYZ';
                const norm = scenePct / 0.16;

                // Dramatic easing: smooth acceleration, fast swoop through Earth, smooth landing at Archive
                const easeT = norm < 0.5 ? 4 * norm * norm * norm : 1 - Math.pow(-2 * norm + 2, 3) / 2;

                const p0 = wpStart;
                const p3 = wpArchive;
                const pNext = pathPoints[1] || {
                    x: wpArchive.x + 12,
                    y: wpArchive.y,
                    z: wpArchive.z - 10
                };
                const travelDistance = scrollMath.distance3(p0, p3);
                const bankT = Math.sin(norm * Math.PI);

                // Enter from camera-right and slightly above, then bank down into the marked Earth hotspot.
                const p1 = {
                    x: p0.x - Math.min(Math.max(travelDistance * 0.32, 18), 34),
                    y: p0.y + Math.min(Math.max(travelDistance * 0.16, 8), 18),
                    z: p0.z - Math.min(Math.max(travelDistance * 0.24, 18), 32)
                };

                // Balcony/Window Swoop: loop from the outside right
                const p2 = {
                    x: p3.x + 12,
                    y: p3.y + 1.8,
                    z: p3.z + 10
                };

                let whooshFov = 0;
                let whooshRoll = 0;
                if (scenePct >= 0.05 && scenePct <= 0.15) {
                    const t = (scenePct - 0.05) / 0.10;
                    const factor = Math.sin(t * Math.PI); // Peaks at 10% scroll progress
                    whooshFov = factor * 14.0; // Dynamic FOV zoom stretch during swoop
                    whooshRoll = -0.12 * factor; // Physical bank into the swoop turn
                }

                gl.camera.position.x = scrollMath.cubicBezierScalar(p0.x, p1.x, p2.x, p3.x, easeT);
                gl.camera.position.y = scrollMath.cubicBezierScalar(p0.y, p1.y, p2.y, p3.y, easeT);
                gl.camera.position.z = scrollMath.cubicBezierScalar(p0.z, p1.z, p2.z, p3.z, easeT);
                // Ease from 75 FOV down to a spacious 68 FOV inside the room
                setCameraFov(scrollMath.lerp(75, 68, easeT) + (Math.sin(norm * Math.PI) * 7) + speedFov + whooshFov);

                // Jet POV: Pitch down into the dive and roll heavily into the bank for a realistic jet pilot feel
                gl.camera.rotation.x = -0.38 * Math.sin(norm * Math.PI);
                gl.camera.rotation.z = -0.28 * Math.sin(norm * Math.PI) + whooshRoll;
                gl.camera.rotation.y = scrollMath.lerp(0, rotP1, scrollMath.smoothstep(easeT)) - (0.12 * bankT);

                // Show stalls after passing archive (scrollPct >= 0.32)
                if (city && city.stallModels) {
                    city.stallModels.forEach(stall => {
                        stall.visible = scenePct >= 0.32;
                    });
                }

                // Hide About & Contact sections if visible
                if (domAboutSection && !isWarmup) {
                    domAboutSection.style.opacity = '0';
                    domAboutSection.style.pointerEvents = 'none';
                }
                if (domContactSection && !isWarmup) {
                    domContactSection.style.opacity = '0';
                    domContactSection.style.pointerEvents = 'none';
                }
            } else {
                // Segment 2 — inside room
                // Segment 2: Room → Zoom Into Table (About) → Enter Portal (16%→100%)
                //
                // IMPORTANT: use YXZ Euler order (yaw-then-pitch = FPS camera).
                // This prevents the apparent Z-roll that XYZ order produces when
                // combining a large Y rotation with an X pitch.
                //
                // Sub-phase A  16%→26%  Smooth pan from landing rotation to table view
                // Sub-phase B  26%→38%  Hold at table — card + hologram visible
                // Sub-phase C  38%→100% Straighten up, rotate to face portal, fly through
                // ─────────────────────────────────────────────────────────────

                gl.camera.rotation.order = 'YXZ'; // FPS order — yaw first, then pitch

                // World-group Z offset
                const WZ = -25.0;

                // ── Positions
                const landX = 3.1495619612478967;
                const landY = 2.5;
                const landZ = 0.4868419314185841 + WZ;

                // Camera stops in front of hologram hotspot, 0.5m above table.
                // On mobile the hologram panel is larger (PW=0.90, PH=1.20) so pull
                // back further to keep the full panel in frame.
                const isMobileView = window.innerWidth < 1025;
                const tablePullback = isMobileView ? 1.85 : 1.0;
                const tableX = 0.27 + tablePullback;
                const tableY = isMobileView ? 1.24 + 0.85 : 1.24 + 0.5;
                const tableZ = 0.32 + WZ;

                const portalX = landX;
                const portalY = landY;
                const portalZ = landZ;

                // ── End of portal travel — camera arrives inside train corridor
                // Train offset: trainX=-11.71, corridor midpoint at local x≈4.37 (car hotspot)
                // So a good "just entered train" position is local x≈7, near the entrance
                const endX = -11.71 + 7.5;      // ≈ -4.21 — just inside train entrance
                const endY = 2.8740861808376628; // same height as portal center
                const endZ = 0.823518420500778 + WZ; // same Z as portal

                // ── Cockpit position — defined above updateScene, accessible here

                // ── Rotation targets (in YXZ order these are clean/gimbal-free)
                // Segment 1 leaves camera at approx: rotY = rotP1, rotX = 0
                const startRotY = rotP1;   // ~60° — where dive ends
                const startRotX = 0;

                // Camera higher on mobile (tableY = 1.24+0.85 = 2.09), panel center ≈ 1.83
                // dy = 2.09-1.83 = 0.26, dx = 1.85 → rotX = -atan(0.26/1.85) ≈ -0.139
                const tableRotY = Math.PI / 2;
                const tableRotX = isMobileView ? -Math.atan(0.26 / 1.85) : -Math.atan(0.14 / 1.0);

                const portalRotY = Math.PI / 2; // portal is also on -X axis

                if (scenePct < 0.26) {
                    // ── Sub-phase A: smooth pan from landing to table view (16%→26%)
                    // Use raw norm — Lenis lerp is already the single source of easing.
                    // Wrapping with smoothstep on top caused double-easing: very sticky ends.
                    const norm = scrollMath.clamp01((scenePct - 0.16) / 0.10);
                    const t = norm; // linear — Lenis handles inertia

                    gl.camera.position.x = scrollMath.lerp(landX, tableX, t);
                    gl.camera.position.y = scrollMath.lerp(landY, tableY, t);
                    gl.camera.position.z = scrollMath.lerp(landZ, tableZ, t);

                    gl.camera.rotation.y = scrollMath.lerp(startRotY, tableRotY, t);
                    gl.camera.rotation.x = scrollMath.lerp(startRotX, tableRotX, t);
                    gl.camera.rotation.z = 0;

                    setCameraFov(scrollMath.lerp(68, 52, t) + speedFov * 0.3);

                    if (domAboutSection && !isWarmup) {
                        domAboutSection.style.opacity = '0';
                        domAboutSection.style.pointerEvents = 'none';
                    }

                } else if (scenePct < 0.38) {
                    // ── Sub-phase B: hold at table — hologram visible (26%→38%)
                    // Previously hard-pinned at a single position, which felt like a dead stop.
                    // Now the camera drifts very slightly toward the portal so it never fully freezes.
                    const norm = scrollMath.clamp01((scenePct - 0.26) / 0.12);
                    const drift = norm * 0.18; // subtle creep in X toward portal (0 → 0.18 units)
                    gl.camera.position.set(tableX - drift, tableY, tableZ);
                    gl.camera.rotation.y = tableRotY;
                    gl.camera.rotation.x = tableRotX;
                    gl.camera.rotation.z = 0;
                    setCameraFov(52 + speedFov * 0.3);

                    // DOM about card hidden — replaced by 3D hologram in scene
                    if (domAboutSection && !isWarmup) {
                        domAboutSection.style.opacity = '0';
                        domAboutSection.style.pointerEvents = 'none';
                    }

                } else if (scenePct < 0.68) {
                    // ── Sub-phase C: pull back, fly through portal, travel train (38%→68%)
                    // Use raw norms — Lenis lerp provides all the easing.
                    // Previous triple-smoothstep (pullT, travelT, rotT) on top of Lenis
                    // created extremely sticky motion at sub-phase boundaries.
                    const norm = scrollMath.clamp01((scenePct - 0.38) / 0.30);

                    const pullNorm = scrollMath.clamp01(norm / 0.40);
                    const pullT = pullNorm; // was smoothstep(pullNorm)

                    const travelNorm = scrollMath.clamp01((norm - 0.25) / 0.75);
                    const travelT = travelNorm; // was smoothstep(travelNorm)

                    const midX = scrollMath.lerp(tableX, portalX, pullT);
                    const midY = scrollMath.lerp(tableY, portalY, pullT);
                    const midZ = scrollMath.lerp(tableZ, portalZ, pullT);

                    gl.camera.position.x = scrollMath.lerp(midX, endX, travelT);
                    gl.camera.position.y = scrollMath.lerp(midY, endY, travelT);
                    gl.camera.position.z = scrollMath.lerp(midZ, endZ, travelT);

                    const rotNorm = scrollMath.clamp01(norm / 0.45);
                    const rotT = rotNorm; // was smoothstep(rotNorm)
                    gl.camera.rotation.y = portalRotY;
                    gl.camera.rotation.x = scrollMath.lerp(tableRotX, 0, rotT);
                    gl.camera.rotation.z = 0;

                    setCameraFov(scrollMath.lerp(52, 68, pullT) + speedFov * 0.5);

                    if (domAboutSection && !isWarmup) {
                        domAboutSection.style.opacity = '0';
                        domAboutSection.style.pointerEvents = 'none';
                    }

                } else {
                    // ── Sub-phase D: approach cockpit in two stages (68%→100%)
                    // Stage 1 (68%→84%): fly parallel at corridor height to above the cockpit (X only)
                    // Stage 2 (84%→100%): drop straight down into the seat
                    const norm = scrollMath.clamp01((scenePct - 0.68) / 0.32);

                    // Above-cockpit waypoint — same XZ as cockpit, but at corridor height
                    const aboveX = cockpitX;
                    const aboveY = endY;       // stay at corridor/entrance height
                    const aboveZ = cockpitZ;

                    // Stage 1: entrance → directly above cockpit (horizontal travel only)
                    // Using raw clamp values — Lenis lerp handles the easing.
                    const stage1T = scrollMath.clamp01(norm / 0.50);
                    // Stage 2: drop from above into seat (vertical drop only)
                    // Keep a single smoothstep here for the cinematic "drop into seat" feel.
                    const stage2T = scrollMath.smoothstep(scrollMath.clamp01((norm - 0.50) / 0.50));

                    // X and Z: fully resolved by end of stage 1
                    const camX = scrollMath.lerp(endX, aboveX, stage1T);
                    const camZ = scrollMath.lerp(endZ, aboveZ, stage1T);
                    // Y: hold at corridor height through stage 1, drop in stage 2
                    const camY = scrollMath.lerp(aboveY, cockpitY, stage2T);

                    gl.camera.position.set(camX, camY, camZ);
                    gl.camera.rotation.y = cockpitRotY;
                    gl.camera.rotation.x = scrollMath.lerp(0, cockpitRotX, stage2T);
                    gl.camera.rotation.z = 0;

                    // FOV narrows as you drop into the cockpit
                    setCameraFov(scrollMath.lerp(68, 55, stage2T) + speedFov * 0.3);

                    if (domAboutSection && !isWarmup) {
                        domAboutSection.style.opacity = '0';
                        domAboutSection.style.pointerEvents = 'none';
                    }
                }

                // Contact section removed — cockpit view is the final state
                if (domContactSection && !isWarmup) {
                    domContactSection.style.opacity = '0';
                    domContactSection.style.pointerEvents = 'none';
                }
            }

            if (!isDriving) {
                if (city && city.f1Model) {
                    city.f1Model.position.set(4.369307666888172, 0.11602419564293629, -0.15858486492682247);
                    city.f1Model.rotation.set(0, -Math.PI / 2, 0);
                }
                if (city && city.rescueJetReady && city.rescueJet) {
                    city.rescueJet.position.set(0, -999, 0);
                    if (city.rescueJetMaterials) {
                        city.rescueJetMaterials.forEach(mat => mat.opacity = 0);
                    }
                }
            }

            // ── Mobile-Only Top Tactical Experience HUD Overlay Global Update ──
            const updateMobileExpHud = () => {
                const isMobileScreen = window.innerWidth < 1025;
                const mHud = document.getElementById('mobile-exp-hud');
                if (!mHud) return;

                if (!isMobileScreen) {
                    mHud.classList.add('hidden');
                    mHud.classList.remove('active');
                    return;
                }

                const SUB_G_END = 0.63;
                const localIsPullingUp = drivePct < SUB_G_END;
                const localFlyNorm = !localIsPullingUp ? (drivePct - SUB_G_END) / (1.0 - SUB_G_END) : 0;
                const phase1End = isMobileScreen ? 0.76 : 0.38;
                // If user has pinned a drivePct cutoff, use it directly; otherwise fall back to phase1End
                const hudCutoffDrivePct = window._expHudCutoffDrivePct !== null && window._expHudCutoffDrivePct !== undefined
                    ? window._expHudCutoffDrivePct
                    : null;
                const belowCutoff = hudCutoffDrivePct !== null
                    ? drivePct < hudCutoffDrivePct
                    : localFlyNorm < phase1End;
                const isInExpPhase = isDriving && drivePct >= 0.55 && !localIsPullingUp && belowCutoff;

                if (isInExpPhase) {
                    // Two-frame approach: set display:block first, then trigger opacity on next frame
                    if (mHud.classList.contains('hidden') || !mHud.classList.contains('active')) {
                        mHud.classList.remove('hidden');
                        mHud.style.display = 'block';
                        requestAnimationFrame(() => mHud.classList.add('active'));
                    }

                    // Mirror desktop logic: use _sectionIdx driven by calibrated scroll positions.
                    // idx 4=exp-node-1, 5=exp-node-2, 6=exp-node-3. Clamp to [0,2] for array index.
                    const activeIdx = Math.max(0, Math.min(_sectionIdx - 4, 2));

                    const EXP_NODES = window._expNodeData || [
                        { title: 'ADRIG AI', role: 'Software Development Engineer', year: '2026', stack: 'On-site · Chennai · Full Stack', desc: 'SDE Intern at ADRIG AI Technologies Pvt. Ltd. Building production software at an AI-focused company. May 2026 – Present.', status: '● Current' },
                        { title: 'ANDROID CLUB', role: 'Outreach — VIT Chennai', year: '2025', stack: 'Part-time · Hybrid · Chennai', desc: 'Outreach member at Android Club VITC. Managing community engagement and representing the club across events. Apr 2025 – Present.', status: '● Current' },
                        { title: 'LLMVERSE', role: 'Runner-Up 2', year: '2025', stack: 'AI · LLM · 12-Hour Sprint', desc: 'Runner-Up 2 at LLMverse — a 12-hour hackathon organised by the Artificial Intelligence Club, VIT Chennai. Feb 2025.', status: '● Awarded' },
                    ];
                    const activeNode = EXP_NODES[activeIdx];
                    if (activeNode && window._lastActiveNodeIdx !== activeIdx) {
                        window._lastActiveNodeIdx = activeIdx;
                        const tagEl = document.getElementById('m-exp-tag');
                        const yearEl = document.getElementById('m-exp-year');
                        const titleEl = document.getElementById('m-exp-title');
                        const roleEl = document.getElementById('m-exp-role');
                        const descEl = document.getElementById('m-exp-desc');
                        const statusEl = document.getElementById('m-exp-status-text');
                        const linkEl = document.getElementById('m-exp-link');

                        if (tagEl) tagEl.innerText = `Experience ${String(activeIdx + 1).padStart(2, '0')}`;
                        if (yearEl) yearEl.innerText = `${activeNode.year}`;
                        if (titleEl) titleEl.innerText = activeNode.title;
                        if (roleEl) roleEl.innerText = activeNode.role.toUpperCase();
                        if (descEl) descEl.innerText = activeNode.desc;
                        if (statusEl) statusEl.innerText = activeNode.status;
                        if (linkEl) linkEl.innerText = `Experience ${String(activeIdx + 1).padStart(2, '0')}`;

                        const stackContainer = document.getElementById('m-exp-stack');
                        if (stackContainer) {
                            const pills = activeNode.stack.split('·').map(s => `<span class="m-exp-pill">${s.trim()}</span>`).join('');
                            stackContainer.innerHTML = pills;
                        }
                    }
                } else {
                    if (mHud.classList.contains('active')) {
                        mHud.classList.remove('active');
                        mHud.classList.add('hiding'); // triggers fade-out transition
                        setTimeout(() => {
                            // Only hide if not re-activated during the transition
                            if (!mHud.classList.contains('active')) {
                                mHud.classList.remove('hiding');
                                mHud.classList.add('hidden');
                                mHud.style.display = '';
                            }
                        }, 260); // match transition duration
                    } else if (!mHud.classList.contains('hidden')) {
                        mHud.classList.add('hidden');
                        mHud.style.display = '';
                    }
                    window._lastActiveNodeIdx = -1;
                }
            };
            updateMobileExpHud();

            // DOM Hero Content Fading — ring fades out on first hint of scroll
            if (!isWarmup) {
                // scrollPct * 40 → fully transparent by 2.5% scroll (about one swipe)
                const heroOpacity = Math.max(0, 1 - scrollPct * 40);
                const ringEl = document.getElementById('circular-text-ring');
                if (ringEl && ringEl._lastHeroOpacity !== heroOpacity) {
                    ringEl.style.opacity = heroOpacity;
                    ringEl._lastHeroOpacity = heroOpacity;
                }
                if (domHeroContent && domHeroContent._lastOpacity !== heroOpacity) {
                    domHeroContent.style.opacity = heroOpacity;
                    domHeroContent._lastOpacity = heroOpacity;
                }

                // ── Project earth position to screen space every frame ──
                // This makes the ring track the globe at any viewport size, zero config.
                if (ringEl && suns && suns.model && suns.modelReady && heroOpacity > 0) {
                    const earthPos = suns.model.position.clone();

                    // Project centre to NDC (-1..1)
                    const ndc = earthPos.clone().project(gl.camera);
                    const screenCx = ( ndc.x * 0.5 + 0.5) * window.innerWidth;
                    const screenCy = (-ndc.y * 0.5 + 0.5) * window.innerHeight;

                    // Estimate screen radius: project a point offset by the earth's world radius.
                    // Earth GLB base radius ≈ 1 unit; scale = baseScale (18–25).
                    const worldRadius = suns.baseScale * 1.0;
                    // Pick a point on the rim in camera-right direction
                    const right = new THREE.Vector3();
                    right.setFromMatrixColumn(gl.camera.matrixWorld, 0).normalize();
                    const rimPoint = earthPos.clone().addScaledVector(right, worldRadius);
                    const rimNdc  = rimPoint.clone().project(gl.camera);
                    const rimX    = ( rimNdc.x * 0.5 + 0.5) * window.innerWidth;
                    const rimY    = (-rimNdc.y * 0.5 + 0.5) * window.innerHeight;
                    const screenR = Math.hypot(rimX - screenCx, rimY - screenCy);

                    // Apply — only update if moved more than 1px to avoid style churn
                    const newLeft = Math.round(screenCx - screenR);
                    const newTop  = Math.round(screenCy - screenR);
                    const newSize = Math.round(screenR * 2);

                    if (ringEl._projLeft !== newLeft || ringEl._projTop !== newTop || ringEl._projSize !== newSize) {
                        ringEl._projLeft = newLeft;
                        ringEl._projTop  = newTop;
                        ringEl._projSize = newSize;
                        ringEl.style.left   = `${newLeft}px`;
                        ringEl.style.top    = `${newTop}px`;
                        ringEl.style.width  = `${newSize}px`;
                        ringEl.style.height = `${newSize}px`;
                        ringEl.style.transform = 'none';
                        // Update letter radii if size changed significantly
                        if (!ringEl._lastSize || Math.abs(ringEl._lastSize - newSize) > 4) {
                            ringEl._lastSize = newSize;
                            import('./components/CircularText.js').then(({ initCircularText }) => {
                                initCircularText('#circular-text-ring', {
                                    text: '* SCROLL DOWN * SHRIYAN * ANDROID DEV * ',
                                    spinDuration: 18,
                                    size: newSize,
                                    fontSize: '32px',
                                    fontWeight: '700',
                                });
                            });
                        }
                    }
                }
            }

            // DOM Contact / Links Section Fading (fades in when scrolling to Links / Aircraft Carrier)
            if (!domContactSection) domContactSection = document.getElementById('contact');
            if (domContactSection && !isWarmup) {
                const contactStart = (window._contactFadeInPct !== null && window._contactFadeInPct !== undefined)
                    ? window._contactFadeInPct
                    : 0.82;
                const contactOpacity = parseFloat(scrollMath.clamp01((scrollPct - contactStart) / 0.08).toFixed(3));
                const visibilityVal = contactOpacity > 0.01 ? 'visible' : 'hidden';
                const pointerEventsVal = contactOpacity > 0.5 ? 'auto' : 'none';

                if (domContactSection._lastOpacity !== contactOpacity) {
                    domContactSection.style.opacity = contactOpacity;
                    domContactSection._lastOpacity = contactOpacity;
                }
                if (domContactSection._lastVisibility !== visibilityVal) {
                    domContactSection.style.visibility = visibilityVal;
                    domContactSection._lastVisibility = visibilityVal;
                }
                if (domContactSection._lastPointerEvents !== pointerEventsVal) {
                    domContactSection.style.pointerEvents = pointerEventsVal;
                    domContactSection._lastPointerEvents = pointerEventsVal;
                }
            }

            /*
            if (heroText && heroText.update) {
                heroText.update(scrollPct, velocity, isWarmup, canFracture);
            }
            */

            // Update components
            if (suns && suns.update) suns.update();
            if (suns && suns.setScrollData) suns.setScrollData(scenePct, velocity);
            if (fallout && fallout.update) fallout.update();

            if (city && city.setScrollProgress) city.setScrollProgress(scenePct);
            if (city && city.update) city.update(scenePct);
            if (satellites && satellites.update) satellites.update();
            if (satellites && satellites.setScrollProgress) satellites.setScrollProgress(scenePct);

            const calibPctEl = document.getElementById('calib-pct');
            if (calibPctEl && !isWarmup) {
                calibPctEl.textContent = `${(scrollPct * 100).toFixed(1)}%`;
            }
            const calibDriveEl = document.getElementById('calib-drive-pct');
            if (calibDriveEl && !isWarmup) {
                if (isDriving) {
                    calibDriveEl.textContent = `drive: ${(drivePct * 100).toFixed(1)}%`;
                } else {
                    calibDriveEl.textContent = `scene: ${(scenePct * 100).toFixed(1)}%`;
                }
            }

            // --- HAPTIC MODES ---
            if (!isWarmup) {
                if (scenePct > 0.36 && scenePct < 0.55) {
                    if (haptics.hapticMode !== 'grid') haptics.setHapticMode('grid');
                } else if (scenePct > 0.6 && scenePct < 0.8) {
                    if (haptics.hapticMode !== 'immersive') haptics.setHapticMode('immersive');
                } else {
                    if (haptics.hapticMode !== 'neutral') haptics.setHapticMode('neutral');
                }
                haptics.onScrollProgress(scenePct, velocity);
            }

            if (cinematic && cinematic.update) {
                cinematic.update(scenePct, velocity);
            }

            // --- VISIBILITY CULLING (PERFORMANCE) ---
            if (suns && suns.model) {
                suns.model.visible = scenePct < 0.22;
            }

            if (city && city.group) {
                const cityVisible = scenePct > 0.08;
                city.group.visible = cityVisible;
                if (cityVisible && city.stallModels) {
                    const stallsNeeded = scenePct > 0.2 && scenePct < 0.6;
                    city.stallModels.forEach(s => s.visible = stallsNeeded);
                }
            }
        };

        const syncLoadedScene = () => {
            const scrollPct = getScrollPct();

            if (city && city.setScrollProgress) city.setScrollProgress(scrollPct);
            if (satellites && satellites.setScrollProgress) satellites.setScrollProgress(scrollPct);

            updateScene(scrollPct, scroll.velocity || 0, true);
            gl.forceRender();
        };

        const scheduleWarmupSequence = async () => {
            if (warmupScheduled) return;
            warmupScheduled = true;

            const hiddenElements = [];
            gl.scene.traverse(child => {
                if (child.isMesh || child.isGroup) {
                    if (child.visible === false) {
                        child.visible = true;
                        hiddenElements.push(child);
                    }
                    child.userData.originalFrustumCulled = child.frustumCulled;
                    child.frustumCulled = false;
                }
            });

            // Pre-upload all textures to GPU texture memory
            gl.scene.traverse(child => {
                if (child.isMesh && child.material) {
                    const mats = Array.isArray(child.material) ? child.material : [child.material];
                    mats.forEach(mat => {
                        ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap'].forEach(prop => {
                            if (mat[prop] && mat[prop].isTexture) {
                                try { gl.renderer.initTexture(mat[prop]); } catch (e) {}
                            }
                        });
                    });
                }
            });

            // Asynchronously compile scene using Three.js compileAsync or fallback to compile
            if (gl && typeof gl.compileAsync === 'function') {
                await gl.compileAsync(gl.scene, gl.camera);
            } else if (gl && typeof gl.compile === 'function') {
                gl.compile(gl.scene, gl.camera);
            }

            // Pre-render key scene checkpoints across the entire Earth-to-City zoom curve
            [0.0, 0.05, 0.08, 0.12, 0.18, 0.27].forEach((sample) => {
                updateScene(sample, 0, true);
                gl.forceRender();
            });

            // Restore visibility and frustum culling
            hiddenElements.forEach(el => { el.visible = false; });

            gl.scene.traverse(child => {
                if (child.userData.originalFrustumCulled !== undefined) {
                    child.frustumCulled = child.userData.originalFrustumCulled;
                }
            });

            updateScene(getScrollPct(), 0, true);
            gl.forceRender();
        };

        const ensureFallout = async () => {
            if (falloutInitStarted) return fallout;
            falloutInitStarted = true;

            const Fallout = await loadFalloutModule();
            fallout = new Fallout(gl);
            return fallout;
        };

        const ensureSatellites = async () => {
            if (satellitesInitStarted) return satellites;
            satellitesInitStarted = true;

            const Satellites = await loadSatellitesModule();
            satellites = new Satellites(gl);
            if (satellites.setScrollProgress) satellites.setScrollProgress(getScrollPct());
            gl.forceRender();
            return satellites;
        };



        const ensureProjectCards = async () => {
            if (projectCardsInitStarted) return projectCardsSystem;
            projectCardsInitStarted = true;

            const ProjectCards = await loadProjectCardsModule();
            projectCardsSystem = new ProjectCards(gl);
            if (projectCardsSystem.resize) projectCardsSystem.resize();
            gl.forceRender();
            return projectCardsSystem;
        };

        const ensureCity = async () => {
            if (cityLoadPromise) return cityLoadPromise;

            cityLoadPromise = loadCityModule().then((City) => new Promise((resolve) => {
                city = new City(gl);
                city.onLoad = () => {
                    syncLoadedScene();
                    scheduleWarmupSequence();
                    resolve(city);
                };
            }));

            return cityLoadPromise;
        };

        const startBackgroundBootstrap = () => {
            if (backgroundBootstrapStarted) return;
            backgroundBootstrapStarted = true;

            if (!loaderFinished) {
                setLoaderProgress(45, 'Loading scene');
            }

            ensureCity().catch((error) => {
                console.error('Loft bootstrap failed:', error);
            });
        };

        setLoaderProgress(10, 'Initializing');
        suns = new Suns(gl);
        suns.onLoad = async () => {
            // Loading ProjectCards disabled during boot to retain only Earth & Jets
            /*
            setLoaderProgress(30, 'LOADING_PROJECT_DATA');
            try {
                await ensureProjectCards();
            } catch (e) {
                console.error('Failed to load ProjectCards during boot:', e);
            }
            */

            finishLoading();
            beginIntro();
            startBackgroundBootstrap();
        };

        // Setup haptic section boundaries
        haptics.setSectionBoundaries([0, 0.27, 0.5, 0.8, 1.0]);


        const fireNavPulse = () => {
            haptics.navigation();
            if (suns.triggerPulse) {
                suns.triggerPulse(0.9);
            }
            if (cinematic && cinematic.triggerPulse) {
                cinematic.triggerPulse(0.9);
            }
        };

        // --- NAV TARGETS MAP & PERSISTENCE ---
        const defaultTargets = {
            hero: 0.00,
            about: 0.05,
            projects: 0.27,
            experience: 0.70,
            'exp-node-1': 0.71,
            'exp-node-2': 0.73,
            'exp-node-3': 0.75,
            contact: 1.00
        };

        const savedTargets = localStorage.getItem('zenith_nav_targets');
        window._navTargets = savedTargets ? JSON.parse(savedTargets) : defaultTargets;

        // Exp HUD cutoff — raw drivePct above which the mobile card is hidden.
        // Default: 0.723 (72.3%). Override via debug panel.
        const savedExpCutoff = localStorage.getItem('zenith_exp_hud_cutoff');
        window._expHudCutoffDrivePct = savedExpCutoff !== null ? parseFloat(savedExpCutoff) : 0.723;

        // Contact/social fade-in threshold — raw scrollPct where the section starts appearing.
        // Default: 0.91 (91%) from calibration.
        const savedContactFadeIn = localStorage.getItem('zenith_contact_fadein');
        window._contactFadeInPct = savedContactFadeIn !== null ? parseFloat(savedContactFadeIn) : 0.91;

        // Exp end back-nav target — raw scrollPct to land on when swiping back from links.
        // Null means "use the computed default (just before last node clears)".
        const savedExpEnd = localStorage.getItem('zenith_exp_end_nav');
        window._expEndNavPct = savedExpEnd !== null ? parseFloat(savedExpEnd) : null;

        // --- DEBUG CALIBRATOR TOGGLE --- (disabled — change false→true to re-enable)
        if (false) { // eslint-disable-line no-constant-condition
        const debugPanel = document.getElementById('debug-calibrator');
        const debugToggleBtn = document.getElementById('debug-toggle');
        const debugCloseBtn = document.getElementById('debug-cal-close');
        const debugResetBtn = document.getElementById('debug-cal-reset');

        const openCalibrator = () => {
            if (debugPanel) debugPanel.classList.remove('hidden');
        };
        const closeCalibrator = () => {
            if (debugPanel) debugPanel.classList.add('hidden');
        };

        if (debugToggleBtn) {
            debugToggleBtn.addEventListener('click', () => {
                if (debugPanel && debugPanel.classList.contains('hidden')) {
                    openCalibrator();
                } else {
                    closeCalibrator();
                }
            });
        }

        if (debugCloseBtn) {
            debugCloseBtn.addEventListener('click', closeCalibrator);
            debugCloseBtn.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') closeCalibrator();
            });
        }

        // Keyboard shortcut: Ctrl+Shift+D
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.shiftKey && e.key === 'D') {
                e.preventDefault();
                if (debugPanel && debugPanel.classList.contains('hidden')) {
                    openCalibrator();
                } else {
                    closeCalibrator();
                }
            }
        });

        if (debugResetBtn) {
            debugResetBtn.addEventListener('click', () => {
                window._navTargets = { ...defaultTargets };
                localStorage.removeItem('zenith_nav_targets');
                // Also reset exp HUD cutoff
                window._expHudCutoffDrivePct = 0.723;
                localStorage.removeItem('zenith_exp_hud_cutoff');
                // Also reset contact fade-in
                window._contactFadeInPct = 0.91;
                localStorage.removeItem('zenith_contact_fadein');
                // Also reset exp end nav
                window._expEndNavPct = null;
                localStorage.removeItem('zenith_exp_end_nav');
                updateCalibLabels();
                updateExpCutoffLabel();
                updateContactFadeInLabel();
                updateExpEndNavLabel();
                debugResetBtn.style.borderColor = '#00ff88';
                debugResetBtn.style.color = '#00ff88';
                setTimeout(() => {
                    debugResetBtn.style.borderColor = '';
                    debugResetBtn.style.color = '';
                }, 600);
            });
        }

        // --- EXP HUD CUTOFF BUTTON ---
        const expCutoffBtn = document.getElementById('debug-exp-cutoff');

        const updateExpCutoffLabel = () => {
            if (!expCutoffBtn) return;
            if (window._expHudCutoffDrivePct !== null) {
                expCutoffBtn.textContent = `Set Exp HUD Cutoff [drive: ${(window._expHudCutoffDrivePct * 100).toFixed(1)}%]`;
                expCutoffBtn.style.borderColor = 'rgba(0,255,136,0.6)';
                expCutoffBtn.style.color = '#00ff88';
            } else {
                expCutoffBtn.textContent = `Set Exp HUD Cutoff [drive: --]`;
                expCutoffBtn.style.borderColor = '';
                expCutoffBtn.style.color = '';
            }
        };
        updateExpCutoffLabel();

        if (expCutoffBtn) {
            expCutoffBtn.addEventListener('click', () => {
                // drivePct is in scope via the gsap ticker closure — read it from the
                // running scene state instead of recalculating to stay in sync.
                const currentScroll = scroll.scroll || 0;
                const maxScroll = scroll.getMaxScroll();
                const rawPct = Math.min(currentScroll / maxScroll, 1.0);
                const DRIVE_START_VAL = 0.167;
                const currentDrivePct = rawPct >= DRIVE_START_VAL
                    ? (rawPct - DRIVE_START_VAL) / (1.0 - DRIVE_START_VAL)
                    : 0;

                window._expHudCutoffDrivePct = currentDrivePct;
                localStorage.setItem('zenith_exp_hud_cutoff', currentDrivePct.toString());
                updateExpCutoffLabel();

                // Flash confirm
                expCutoffBtn.style.background = 'rgba(0,255,136,0.15)';
                setTimeout(() => { expCutoffBtn.style.background = ''; }, 500);
            });
        }

        // --- CONTACT FADE-IN BUTTON ---
        const contactFadeInBtn = document.getElementById('debug-contact-fadein');

        const updateContactFadeInLabel = () => {
            if (!contactFadeInBtn) return;
            if (window._contactFadeInPct !== null && window._contactFadeInPct !== undefined) {
                contactFadeInBtn.textContent = `Set Social Fade-in [${(window._contactFadeInPct * 100).toFixed(1)}%]`;
                contactFadeInBtn.style.borderColor = 'rgba(0,255,136,0.6)';
                contactFadeInBtn.style.color = '#00ff88';
            } else {
                contactFadeInBtn.textContent = `Set Social Fade-in [--]`;
                contactFadeInBtn.style.borderColor = '';
                contactFadeInBtn.style.color = '';
            }
        };
        updateContactFadeInLabel();

        if (contactFadeInBtn) {
            contactFadeInBtn.addEventListener('click', () => {
                const currentScroll = scroll.scroll || 0;
                const maxScroll = scroll.getMaxScroll();
                const rawPct = Math.min(currentScroll / maxScroll, 1.0);

                window._contactFadeInPct = rawPct;
                localStorage.setItem('zenith_contact_fadein', rawPct.toString());
                updateContactFadeInLabel();

                contactFadeInBtn.style.background = 'rgba(0,255,136,0.15)';
                setTimeout(() => { contactFadeInBtn.style.background = ''; }, 500);
            });
        }

        // --- EXP END BACK-NAV BUTTON ---
        const expEndNavBtn = document.getElementById('debug-exp-end-nav');

        const updateExpEndNavLabel = () => {
            if (!expEndNavBtn) return;
            if (window._expEndNavPct !== null && window._expEndNavPct !== undefined) {
                expEndNavBtn.textContent = `Set Exp Back-Nav Landing [${(window._expEndNavPct * 100).toFixed(1)}%]`;
                expEndNavBtn.style.borderColor = 'rgba(0,255,136,0.6)';
                expEndNavBtn.style.color = '#00ff88';
            } else {
                expEndNavBtn.textContent = `Set Exp Back-Nav Landing [--]`;
                expEndNavBtn.style.borderColor = '';
                expEndNavBtn.style.color = '';
            }
        };
        updateExpEndNavLabel();

        if (expEndNavBtn) {
            expEndNavBtn.addEventListener('click', () => {
                const currentScroll = scroll.scroll || 0;
                const maxScroll = scroll.getMaxScroll();
                const rawPct = Math.min(currentScroll / maxScroll, 1.0);

                window._expEndNavPct = rawPct;
                localStorage.setItem('zenith_exp_end_nav', rawPct.toString());
                updateExpEndNavLabel();

                expEndNavBtn.style.background = 'rgba(0,255,136,0.15)';
                setTimeout(() => { expEndNavBtn.style.background = ''; }, 500);
            });
        }

        // Update button labels with stored percentages
        const updateCalibLabels = () => {
            document.querySelectorAll('.calib-buttons button').forEach(btn => {
                const navKey = btn.getAttribute('data-nav');
                if (navKey && window._navTargets[navKey] !== undefined) {
                    const pctVal = (window._navTargets[navKey] * 100).toFixed(0);
                    const labelMap = {
                        hero: 'Start', about: 'About', projects: 'Projects',
                        experience: 'Exp',
                        'exp-node-1': 'Node 1', 'exp-node-2': 'Node 2', 'exp-node-3': 'Node 3',
                        contact: 'Links'
                    };
                    const labelName = labelMap[navKey] ?? navKey;
                    btn.textContent = `Set ${labelName} [${pctVal}%]`;
                }
            });
        };
        updateCalibLabels();

        // Register calibrator button clicks
        document.querySelectorAll('.calib-buttons button').forEach(btn => {
            btn.addEventListener('click', () => {
                const navKey = btn.getAttribute('data-nav');
                if (navKey) {
                    const curPct = getScrollPct();
                    window._navTargets[navKey] = curPct;
                    localStorage.setItem('zenith_nav_targets', JSON.stringify(window._navTargets));
                    updateCalibLabels();

                    btn.style.borderColor = '#00ffcc';
                    btn.style.color = '#00ffcc';
                    setTimeout(() => {
                        btn.style.borderColor = '';
                        btn.style.color = '';
                    }, 500);
                }
            });
        });

        } // end debug calibrator

        // --- EARTH RING DEBUG --- (disabled — change false→true to re-enable)
        if (false) { // eslint-disable-line no-constant-condition
        (() => {
            const ERD_KEY_DESKTOP = 'zenith_earth_ring';
            const ERD_KEY_MOBILE  = 'zenith_earth_ring_mobile';

            const erdOverlay   = document.getElementById('earth-ring-debug');
            const erdCircle    = document.getElementById('erd-circle');
            const erdReadout   = document.getElementById('erd-readout');
            const erdPinBtn    = document.getElementById('erd-pin');
            const erdResetBtn  = document.getElementById('erd-reset');
            const erdToggleBtn = document.getElementById('erd-toggle');
            const erdFontSize  = document.getElementById('erd-font-size');
            const erdFontSzVal = document.getElementById('erd-font-size-val');
            const erdFontWt    = document.getElementById('erd-font-weight');
            const erdModeBtns  = document.querySelectorAll('.erd-mode-btn');

            if (!erdOverlay || !erdCircle) return;
            if (erdToggleBtn) erdToggleBtn.classList.remove('hidden');

            // Current mode — 'desktop' or 'mobile'
            let currentMode = window.innerWidth < 768 ? 'mobile' : 'desktop';

            const defaultsFor = (mode) => ({
                cx: mode === 'mobile' ? 197  : 768,
                cy: mode === 'mobile' ? 460  : 389,
                r:  mode === 'mobile' ? 186  : 234,
                fontSize:   32,
                fontWeight: '700',
            });

            const keyFor   = (mode) => mode === 'mobile' ? ERD_KEY_MOBILE : ERD_KEY_DESKTOP;
            const loadState = (mode) => {
                try {
                    const s = localStorage.getItem(keyFor(mode));
                    return s ? { ...defaultsFor(mode), ...JSON.parse(s) } : { ...defaultsFor(mode) };
                } catch { return { ...defaultsFor(mode) }; }
            };

            let state = loadState(currentMode);

            // ── Mode toggle UI ──
            const setMode = (mode) => {
                currentMode = mode;
                state = loadState(mode);
                erdModeBtns.forEach(b => b.classList.toggle('erd-mode-active', b.dataset.mode === mode));
                syncFontUI();
                applyState();
            };
            erdModeBtns.forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));
            // Init button state
            erdModeBtns.forEach(b => b.classList.toggle('erd-mode-active', b.dataset.mode === currentMode));

            const syncFontUI = () => {
                if (erdFontSize)  erdFontSize.value = state.fontSize;
                if (erdFontSzVal) erdFontSzVal.textContent = `${state.fontSize}px`;
                if (erdFontWt)    erdFontWt.value = state.fontWeight;
            };
            syncFontUI();

            const refreshRing = () => {
                import('./components/CircularText.js').then(({ initCircularText }) => {
                    initCircularText('#circular-text-ring', {
                        text: '* SCROLL DOWN * SHRIYAN * ANDROID DEV * ',
                        spinDuration: 18,
                        size: state.r * 2,
                        fontSize: `${state.fontSize}px`,
                        fontWeight: state.fontWeight,
                    });
                    syncRingPosition();
                });
            };

            const syncRingPosition = () => {
                const ring = document.getElementById('circular-text-ring');
                if (!ring) return;
                ring.style.left      = `${state.cx - state.r}px`;
                ring.style.top       = `${state.cy - state.r}px`;
                ring.style.transform = 'none';
            };

            const applyState = () => {
                const d = state.r * 2;
                erdCircle.style.width  = `${d}px`;
                erdCircle.style.height = `${d}px`;
                erdCircle.style.left   = `${state.cx - state.r}px`;
                erdCircle.style.top    = `${state.cy - state.r}px`;
                if (erdReadout) erdReadout.textContent = `x:${Math.round(state.cx)}  y:${Math.round(state.cy)}  r:${Math.round(state.r)}`;
                syncRingPosition();
            };
            applyState();

            // ── Toggle ──
            const openERD  = () => erdOverlay.classList.remove('hidden');
            const closeERD = () => erdOverlay.classList.add('hidden');
            if (erdToggleBtn) erdToggleBtn.addEventListener('click', () => erdOverlay.classList.contains('hidden') ? openERD() : closeERD());
            document.addEventListener('keydown', (e) => { if (e.ctrlKey && e.shiftKey && e.key === 'E') { e.preventDefault(); erdOverlay.classList.contains('hidden') ? openERD() : closeERD(); } });

            // ── Drag ──
            let dragging = false, dragOX = 0, dragOY = 0;
            erdCircle.addEventListener('pointerdown', (e) => {
                if (e.target.id === 'erd-resize') return;
                dragging = true; dragOX = e.clientX - state.cx; dragOY = e.clientY - state.cy;
                erdCircle.setPointerCapture(e.pointerId); e.stopPropagation();
            });
            erdCircle.addEventListener('pointermove', (e) => { if (!dragging) return; state.cx = e.clientX - dragOX; state.cy = e.clientY - dragOY; applyState(); });
            erdCircle.addEventListener('pointerup', () => { dragging = false; });

            // ── Resize ──
            const resizeHandle = document.getElementById('erd-resize');
            let resizing = false, resizeStartX = 0, resizeStartR = 0;
            if (resizeHandle) {
                resizeHandle.addEventListener('pointerdown', (e) => { resizing = true; resizeStartX = e.clientX; resizeStartR = state.r; resizeHandle.setPointerCapture(e.pointerId); e.stopPropagation(); });
                resizeHandle.addEventListener('pointermove', (e) => { if (!resizing) return; state.r = Math.max(30, resizeStartR + (e.clientX - resizeStartX)); applyState(); });
                resizeHandle.addEventListener('pointerup', () => { resizing = false; });
            }

            // ── Font controls ──
            if (erdFontSize) {
                erdFontSize.addEventListener('input', () => {
                    state.fontSize = parseFloat(erdFontSize.value);
                    if (erdFontSzVal) erdFontSzVal.textContent = `${state.fontSize}px`;
                    refreshRing();
                });
            }
            if (erdFontWt) erdFontWt.addEventListener('change', () => { state.fontWeight = erdFontWt.value; refreshRing(); });

            // ── Pin — saves to the mode-specific key ──
            if (erdPinBtn) {
                erdPinBtn.addEventListener('click', () => {
                    localStorage.setItem(keyFor(currentMode), JSON.stringify(state));
                    refreshRing();
                    erdPinBtn.textContent = `Pinned (${currentMode}) ✓`;
                    erdPinBtn.style.borderColor = '#00ff88';
                    erdPinBtn.style.color = '#00ff88';
                    setTimeout(() => { erdPinBtn.textContent = 'Pin to CircularText'; erdPinBtn.style.borderColor = ''; erdPinBtn.style.color = ''; }, 1200);
                });
            }

            // ── Reset ──
            if (erdResetBtn) {
                erdResetBtn.addEventListener('click', () => {
                    state = defaultsFor(currentMode);
                    localStorage.removeItem(keyFor(currentMode));
                    syncFontUI(); applyState(); refreshRing();
                });
            }

            window._getEarthRingState = () => ({ ...state, mode: currentMode });
        })();
        } // end earth ring debug

        // --- NAVBAR CLICKS ---
        document.querySelectorAll('.hud-nav a').forEach(link => {
            link.addEventListener('click', async (e) => {
                e.preventDefault(); // prevent native href="#section" instant jump
                const targetId = link.getAttribute('href');
                if (targetId && targetId.startsWith('#')) {
                    // Direct navbar clicks always override in-flight animations.
                    // Swipe handler uses _navLocked to prevent rapid-fire swipe spam,
                    // but a deliberate tap on a nav link should always work.
                    if (_navLocked) _unlockNav();

                    let navKey = 'hero';

                    if (targetId === '#hero') navKey = 'hero';
                    else if (targetId === '#about') navKey = 'about';
                    else if (targetId === '#projects') navKey = 'projects';
                    else if (targetId === '#experience' || targetId === '#work') navKey = 'experience';
                    else if (targetId === '#exp-node-1') navKey = 'exp-node-1';
                    else if (targetId === '#exp-node-2') navKey = 'exp-node-2';
                    else if (targetId === '#exp-node-3') navKey = 'exp-node-3';
                    else if (targetId === '#contact' || targetId === '#signal') navKey = 'contact';

                    // Update section index immediately
                    const sectionIdxMap = {
                        hero: 0, about: 1, projects: 2,
                        experience: 3,
                        'exp-node-1': 4, 'exp-node-2': 5, 'exp-node-3': 6,
                        contact: 7
                    };
                    if (sectionIdxMap[navKey] !== undefined) {
                        _sectionIdx = sectionIdxMap[navKey];
                    }

                    const targets = window._navTargets || defaultTargets;
                    const targetPct = targets[navKey] ?? defaultTargets[navKey] ?? 0;
                    const currentPct = getScrollPct();

                    // ── Cinematic guard: any exp-node/experience → contact jump
                    const expStart = targets.experience ?? 0.70;
                    const contactStart = targets.contact ?? 1.00;
                    const inFlightZone = navKey === 'contact'
                        && currentPct >= expStart
                        && currentPct < contactStart;

                    // ── Back-from-links: navigating to experience/exp-node-X from contact
                    const isExpKey = navKey === 'experience' || navKey === 'exp-node-1' || navKey === 'exp-node-2' || navKey === 'exp-node-3';
                    const backFromLinks = isExpKey && currentPct >= (targets.contact ?? 1.00);
                    if (backFromLinks) {
                        window._expNodesCleared = false;
                        _sectionIdx = 7; // hold at contact idx until scroll lands
                    }

                    const expEndDefault = (() => {
                        const DRIVE_START_VAL = 0.167;
                        const SUB_G_END_VAL   = 0.63;
                        const phase1EndVal    = 0.35;
                        const flyTarget       = Math.max(phase1EndVal - 0.03, 0);
                        const drivePctTarget  = flyTarget * (1 - SUB_G_END_VAL) + SUB_G_END_VAL;
                        return DRIVE_START_VAL + drivePctTarget * (1 - DRIVE_START_VAL);
                    })();
                    const expEndTarget = (window._expEndNavPct !== null && window._expEndNavPct !== undefined)
                        ? window._expEndNavPct
                        : expEndDefault;

                    const effectiveTargetPct = backFromLinks ? expEndTarget : targetPct;

                    const remaining = Math.abs(effectiveTargetPct - currentPct);
                    const fullRange = contactStart - expStart;
                    const FLIGHT_BASE_DURATION = 5.0;
                    // Short hops (< 10% scroll) get a faster lock so back-to-back swipes work.
                    // inFlightZone (exp → contact) caps at 2.5s so it doesn't feel broken.
                    const NORMAL_DURATION = remaining < 0.10 ? 1.4 : 2.0;
                    const duration = inFlightZone
                        ? Math.min(FLIGHT_BASE_DURATION * (remaining / Math.max(fullRange, 0.01)), 2.5)
                        : NORMAL_DURATION;

                    // Re-read maxScroll fresh at click time — on iOS the scroll geometry
                    // can be stale after programmatic warmup scrolls during loader.
                    const freshMaxScroll = Math.max(
                        document.documentElement.scrollHeight - window.innerHeight,
                        scroll.getMaxScroll(),
                        1
                    );
                    const targetPx = freshMaxScroll * effectiveTargetPct;

                    // Cancel any in-flight native scroll animation before starting a new one
                    if (scroll._nativeScrollRaf) {
                        cancelAnimationFrame(scroll._nativeScrollRaf);
                        scroll._nativeScrollRaf = null;
                    }

                    // Signal that scroll position changes are programmatic — node-hit detection
                    // should not assert scroll locks while this is true.
                    window._programmaticScroll = true;

                    // Lock nav for the animation duration. _unlockNav fires via onComplete
                    // when the animation snaps to target. Safety net is set to duration + 0.5s.
                    _lockNav((duration + 0.5) * 1000);

                    if (scroll.isTouch) {
                        // Kill any active iOS momentum before starting programmatic scroll.
                        // This must happen synchronously here (before _animateNativeScroll)
                        // so the momentum kill and the rAF capture are in the same task.
                        window.scrollTo(0, window.scrollY);

                        const sectionEl = document.querySelector(targetId);
                        const elIsVisible = sectionEl && sectionEl.offsetParent !== null;
                        if (elIsVisible) {
                            scroll.scrollToSection(sectionEl, { duration, onComplete: _unlockNav });
                        } else {
                            scroll._animateNativeScroll(targetPx, duration, _unlockNav);
                        }
                    } else {
                        // Desktop: Lenis handles the smooth animation.
                        scroll.scrollTo(targetPx, {
                            duration,
                            easing: (t) => 1 - Math.pow(1 - t, 3),
                            onComplete: _unlockNav,
                        });
                    }

                    window._navScrolling = true;
                    setTimeout(() => { window._navScrolling = false; }, 1000);

                    fireNavPulse();
                }
            });
        });

        // --- RESIZE HANDLER ---
        window.addEventListener('resize', () => {
            if (scroll.lenis && typeof scroll.lenis.resize === 'function') {
                scroll.lenis.resize();
            }
            if (projectCardsSystem && projectCardsSystem.resize) {
                projectCardsSystem.resize();
            }
        });

        // --- PROJECTS FULLSCREEN & MONITOR CLICK CUE ---
        const projectsFullscreen = document.getElementById('projects-fullscreen');
        const projectsBack = document.getElementById('projects-back');
        const monitorClickCue = document.getElementById('monitor-click-cue');
        const compRaycaster = new THREE.Raycaster();
        const compMouse = new THREE.Vector2();

        const openProjects = () => {
            if (!projectsFullscreen) return;
            projectsFullscreen.classList.remove('hidden');
            if (monitorClickCue) monitorClickCue.classList.add('hidden');
            scroll.stop();
        };

        const closeProjects = () => {
            if (!projectsFullscreen) return;
            projectsFullscreen.classList.add('hidden');
            scroll.start();
        };

        if (monitorClickCue) {
            monitorClickCue.addEventListener('click', openProjects);
        }

        // ONLY open projects screen if clicking directly on the 3D computer monitor in the loft
        document.addEventListener('click', (e) => {
            // 1. Ignore clicks on HTML UI elements (navbar links, buttons, overlays)
            if (e.target.closest('a, button, nav, .hud-nav, #projects-fullscreen, .social-button, input')) return;

            // 2. Only check when camera is held at the monitor table
            const currentScrollPct = getScrollPct();
            if (currentScrollPct < 0.2043 || currentScrollPct > 0.2971) return;

            // 3. Perform 3D raycast targeting computer screen mesh
            compMouse.x = (e.clientX / window.innerWidth) * 2 - 1;
            compMouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

            compRaycaster.setFromCamera(compMouse, gl.camera);

            const targets = [];
            if (city) {
                if (city.computerScreenMesh) targets.push(city.computerScreenMesh);
                if (city.computerModel) targets.push(city.computerModel);
            }

            if (targets.length > 0) {
                const intersects = compRaycaster.intersectObjects(targets, true);
                if (intersects.length > 0) {
                    openProjects();
                }
            }
        });

        if (projectsBack) {
            projectsBack.addEventListener('click', closeProjects);
        }

        // Hook Scroll Velocity and Position
        gsap.ticker.add(() => {
            window.__ZENITH_PERF_TICK__?.();
            // Unified access (Works for both Lenis and Native)
            const velocity = scroll.velocity || 0;
            const progress = scroll.scroll || 0;
            const maxScroll = scroll.getMaxScroll();
            const scrollPct = Math.min(progress / maxScroll, 1.0); // 0 to 1

            // Call the shared update function
            updateScene(scrollPct, velocity, false);
            heroFormation.update(scrollPct, gl.camera);

            // Dynamically highlight active navbar item
            const navLinks = document.querySelectorAll('.hud-nav a');
            if (navLinks.length > 0) {
                let activeKey = 'hero';
                if (scrollPct >= 0.85) activeKey = 'contact';
                else if (scrollPct >= 0.55) activeKey = 'experience';
                else if (scrollPct >= 0.18) activeKey = 'projects';
                else if (scrollPct >= 0.03) activeKey = 'about';

                navLinks.forEach(link => {
                    const href = link.getAttribute('href');
                    const isActive = 
                        (activeKey === 'hero' && href === '#hero') ||
                        (activeKey === 'about' && href === '#about') ||
                        (activeKey === 'projects' && href === '#projects') ||
                        (activeKey === 'experience' && (href === '#experience' || href === '#work')) ||
                        (activeKey === 'contact' && href === '#contact');
                    link.classList.toggle('active', isActive);
                });
            }

            // Dynamically show/hide monitor click cue prompt during Projects section.
            if (monitorClickCue && projectsFullscreen) {
                const isProjectsSection = scrollPct >= 0.2043 && scrollPct <= 0.2971;
                const isModalClosed = projectsFullscreen.classList.contains('hidden');
                monitorClickCue.classList.toggle('hidden', !(isProjectsSection && isModalClosed));
            }
        });

        const perfParam = new URLSearchParams(window.location.search).get('perf');
        if (perfParam === '0') {
            localStorage.removeItem('zenithPerf');
        } else if (false && (perfParam === '1' || localStorage.getItem('zenithPerf') === '1')) { // disabled // eslint-disable-line no-constant-condition
            const { startZenithPerfMonitor } = await import('./debug/perfMonitor.js');
            startZenithPerfMonitor({
                getScrollY: () => scroll.scroll || 0,
                getVelocity: () => scroll.velocity || 0,
                getMaxScroll: () => scroll.getMaxScroll(),
                getScrollPct: () => {
                    const max = scroll.getMaxScroll();
                    return Math.min((scroll.scroll || 0) / max, 1);
                },
                getRendererPixelRatio: () => gl.renderer.getPixelRatio(),
                getCanvasSize: () => ({
                    width: gl.renderer.domElement.width,
                    height: gl.renderer.domElement.height
                }),
                getLenisLimit: () =>
                    (scroll.lenis && typeof scroll.lenis.limit === 'number' ? scroll.lenis.limit : null)
            });
        }

        // Text scramble removed — replaced by HeroFormation jet animation

    } catch (e) {
        console.error('CRITICAL BOOT ERROR:', e);
        document.body.innerHTML += `<div style="color: red; position: fixed; top: 0; left: 0; z-index: 9999; background: black; padding: 20px; font-family: monospace;">
            CRITICAL ERROR:<br/>
            ${e.message}<br/>
            <br/>
            Check console for full stack trace.
        </div>`;
    }
});
