import './styles/base.css';
import * as THREE from 'three';

console.log('%c ZENITH BOOT SEQUENCE ', 'background: #222; color: #ff4d00');

document.addEventListener('DOMContentLoaded', async () => {
    // Prevent browser from trying to restore previous scroll position and fighting Lenis
    if ('scrollRestoration' in history) {
        history.scrollRestoration = 'manual';
    }
    window.scrollTo(0, 0);
    try {
        console.log('1. Loading Dependencies...');
        const gsap = (await import('gsap')).default;
        const { ScrollTrigger } = await import('gsap/ScrollTrigger');

        gsap.registerPlugin(ScrollTrigger);
        ScrollTrigger.clearScrollMemory('manual');

        // Industry Standard Fix for Mobile/iOS thread jank
        if (window.innerWidth < 1025) {
            // ScrollTrigger.normalizeScroll(true);
            ScrollTrigger.config({ ignoreMobileResize: true });
        }

        gsap.ticker.lagSmoothing(0);

        console.log('2. Check DOM...');
        const canvas = document.querySelector('#gl-canvas');
        if (!canvas) throw new Error('Canvas #gl-canvas not found');

        // Debug border to check visibility
        // canvas.style.border = '1px solid red';

        console.log('3. Loading Modules...');
        const ScrollManager = (await import('./managers/ScrollManager')).default;
        const scrollMath = await import('./utils/scrollCameraMath.js');
        const GLManager = (await import('./gl/GLManager')).default;
        const Suns = (await import('./gl/Suns')).default;
        const haptics = (await import('./utils/Haptics')).default;
        const CinematicManager = (await import('./utils/CinematicManager')).default;
        const HeroFormation = (await import('./utils/HeroFormation')).default;
        const HeroText = (await import('./gl/HeroText')).default;
        const loadFalloutModule = () => import('./gl/Fallout').then(({ default: Fallout }) => Fallout);
        const loadCityModule = () => import('./gl/City').then(({ default: City }) => City);
        const loadSatellitesModule = () => import('./gl/Satellites').then(({ default: Satellites }) => Satellites);
        const loadProjectCardsModule = () => import('./gl/ProjectCards').then(({ default: ProjectCards }) => ProjectCards);

        console.log('4. Initializing Core Systems...');
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

        const finishLoading = () => {
            if (loaderFinished) return;
            loaderFinished = true;
            setLoaderProgress(100, 'NEURAL_LINK_SYNCHRONIZED');

            ScrollTrigger.refresh();
            if (scroll.lenis) scroll.lenis.resize();

            setTimeout(() => {
                if (loader) loader.classList.add('loader-hidden');
                console.log('ZENITH SEQUENCE: SYSTEMS GO');
                scroll.start(); // Allow scrolling once loader is gone
                canFracture = true;
                ScrollTrigger.refresh();
                if (scroll.lenis) scroll.lenis.resize();
            }, 2600);
        };

        const beginIntro = () => {
            if (introStarted) return;
            introStarted = true;

            domHeroContent = document.querySelector('.hero-content');
            domSplitText = document.querySelector('.split-text');
            domAboutSection = document.querySelector('.battlefield-hud');
            domContactSection = document.getElementById('contact');

            // heroText = new HeroText(gl);

            console.log('5. Ignition...');
            if (suns) suns.ignition();

            console.log('SYSTEM ONLINE.');
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
            ctx.fillText("SPD (KTS)", 40, 140);
            ctx.font = 'bold 42px "JetBrains Mono", monospace';
            ctx.fillStyle = isRedAlert ? '#ff3300' : '#00ff88';
            ctx.fillText(String(spd).padStart(4, '0'), 40, 185);

            // Right Panel: ALT
            const alt = Math.round(2400 + norm * 35600);
            ctx.textAlign = 'right';
            ctx.font = '12px "JetBrains Mono", monospace';
            ctx.fillStyle = isRedAlert ? '#ff3300' : 'rgba(0, 255, 136, 0.6)';
            ctx.fillText("ALT (FT)", w - 40, 140);
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
            ctx.fillText(`G-FORCE: ${gForce}G`, w / 2, h - 150);

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

            // Target lock box status
            let tgtStatus = 'ACQUIRING';
            if (norm >= 0.40 && norm < 0.72) tgtStatus = 'LOCKED';
            else if (norm >= 0.72 && norm < 0.84) tgtStatus = 'COLLISION';
            else if (norm >= 0.84) tgtStatus = 'DESTROYED';

            ctx.font = 'bold 14px "JetBrains Mono", monospace';
            ctx.fillStyle = (tgtStatus === 'COLLISION' || tgtStatus === 'DESTROYED') ? '#ff3300' : '#00ff88';
            ctx.fillText(`TGT STATUS: ${tgtStatus}`, rx, ry + rad + 24);

            // System notifications
            ctx.font = '12px "JetBrains Mono", monospace';
            ctx.fillStyle = isRedAlert ? 'rgba(255, 51, 0, 0.65)' : 'rgba(0, 255, 136, 0.65)';
            ctx.textAlign = 'left';
            ctx.fillText("SYS: ZENITH V1.0", 40, h - 35);
            ctx.fillText("LINK: ACTIVE", 40, h - 18);

            ctx.textAlign = 'right';
            ctx.fillText("RADAR: SWEEPING", w - 40, h - 35);
            ctx.fillText("FUEL: 89%", w - 40, h - 18);

            // Large center warnings during red alert
            if (isRedAlert) {
                ctx.fillStyle = 'rgba(255, 30, 0, 0.2)';
                ctx.fillRect(0, 0, w, h);

                ctx.fillStyle = '#ff1100';
                ctx.font = 'bold 36px "JetBrains Mono", monospace';
                ctx.textAlign = 'center';
                ctx.fillText("■ IMPACT ■", w / 2, h / 2 - 45);
                ctx.font = '14px "JetBrains Mono", monospace';
                ctx.fillText("SYSTEM FAILURE // CRITICAL COLLISION", w / 2, h / 2 + 10);
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

            const setCameraFov = (targetFov) => {
                const aspect = gl.camera.aspect || (window.innerWidth / window.innerHeight);
                let effectiveFov = targetFov;

                // Subtle mobile FOV adjustment (keeps subjects close & prevents wide distortion)
                if (aspect < 1.0) {
                    const mobileFactor = (1.0 - Math.max(aspect, 0.45)) * 10;
                    effectiveFov = Math.min(targetFov + mobileFactor, targetFov + 8);
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
                    setCameraFov(scrollMath.lerp(55, 110, norm));

                    // Update the 3D HUD canvas with Sub-E static values
                    drawCockpitHUDCanvas(city, 0, 0);
                    window._dbgE = (window._dbgE || 0) + 1;
                    if (window._dbgE % 10 === 0) {
                        const carWP = new THREE.Vector3();
                        if (city.f1Model) city.f1Model.getWorldPosition(carWP);
                        console.log(`[SUB-E DEBUG] norm=${norm.toFixed(2)} cam=(${curCamX.toFixed(2)}, ${curCamY.toFixed(2)}, ${curCamZ.toFixed(2)}) car=(${carWP.x.toFixed(2)}, ${carWP.y.toFixed(2)}, ${carWP.z.toFixed(2)})`);
                    }


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

                    // ── DEBUG: log camera + jet + F1 world positions every 10 frames ──
                    if (!window._dbgF) window._dbgF = 0;
                    if (++window._dbgF % 10 === 0) {
                        const jetWP = new THREE.Vector3();
                        if (city.rescueJet) city.rescueJet.getWorldPosition(jetWP);
                        const carWP = new THREE.Vector3();
                        if (city.f1Model) city.f1Model.getWorldPosition(carWP);
                        const parentName = city.rescueJet?.parent?.name || city.rescueJet?.parent?.type || 'none';
                        const groupWZ = city.group?.position?.z ?? '?';
                        const opac = city.rescueJetMat?.opacity ?? '?';
                        const cockpitWorldX = jetWP.x + CKPT_OX;
                        const cockpitWorldY = jetWP.y + CKPT_OY;
                        const cockpitWorldZ = jetWP.z + CKPT_OZ;
                        console.log(
                            `[SUB-F DEBUG] norm=${norm.toFixed(2)} cam=(${camX.toFixed(2)}, ${(camY + PILOT_Y).toFixed(2)}, ${camWorldZ.toFixed(2)})\n` +
                            `[SUB-F DEBUG] cockpit=(${cockpitWorldX.toFixed(2)}, ${cockpitWorldY.toFixed(2)}, ${cockpitWorldZ.toFixed(2)})\n` +
                            `[SUB-F DEBUG] f1car=(${carWP.x.toFixed(2)}, ${carWP.y.toFixed(2)}, ${carWP.z.toFixed(2)})`
                        );
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
                    setCameraFov(scrollMath.lerp(110, 100, scrollMath.smoothstep(norm)));
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

                    // ── Flight Path to Aircraft Carrier Landing (240u) ──
                    const isMobileScreen = window.innerWidth < 768;
                    const FLY_X_TRAVEL = 240.0; // snappy, responsive flight path for all viewports
                    const jetFlyX = finalCamX - flyNorm * FLY_X_TRAVEL; // jet advances in -X

                    // ── Experience obstacle data ──
                    const EXP_NODES = [
                        {
                            title: 'BEAKAN',
                            role: 'Android Developer',
                            type: 'PROJECT',
                            year: '2024',
                            stack: 'Kotlin · Android · Firebase · BLE',
                            desc: 'Beacon-based attendance system for VIT Chennai using BLE hardware. Optimized for low-latency on rooted devices.',
                            status: '● DEPLOYED',
                        },
                        {
                            title: 'ANADROME',
                            role: 'Graphics Engineer',
                            type: 'PROJECT',
                            year: '2024',
                            stack: 'Android · OpenGL ES · GLSL',
                            desc: 'GPU-accelerated live wallpaper engine with a fully custom shader pipeline. Zero CPU overhead at runtime.',
                            status: '● ACTIVE',
                        },
                        {
                            title: 'ANADROME',
                            role: 'Graphics Engineer',
                            type: 'PROJECT',
                            year: '2024',
                            stack: 'Android · OpenGL ES · GLSL',
                            desc: 'GPU-accelerated live wallpaper engine with a fully custom shader pipeline. Zero CPU overhead at runtime.',
                            status: '● ACTIVE',
                        },
                        {
                            title: 'ZENITH',
                            role: 'Frontend Engineer',
                            type: 'PROJECT',
                            year: '2025',
                            stack: 'Three.js · GSAP · WebGL · Vite',
                            desc: 'This portfolio. A fully scroll-driven cinematic WebGL experience — zero canvas2D, pure GPU.',
                            status: '● LIVE',
                        },
                    ];

                    // ── Lazy-init obstacle meshes ──
                    if (!window._expObstacles && gl && gl.scene) {
                        const spacing = isMobileScreen ? 20.0 : 16.0; // comfortable spacing on mobile
                        const GATE_Y = cockpitY + 0.05;
                        const GATE_SPAN = isMobileScreen ? 1.8 : 7.0; // tight gate span on mobile

                        // ── Clean Space Flight Path ──
                        window._runwayGroup = null;
                        window._pathTube = null;

                        window._expObstacles = EXP_NODES.map((node, i) => {
                            const obsWorldX = finalCamX - spacing * (i + 1);
                            const group = new THREE.Group();
                            group.position.set(obsWorldX, GATE_Y, finalCamWorldZ);

                            // ── Label side: alternating left/right ──
                            const labelSide = (i % 2 === 0) ? 1 : -1; // +Z = left on screen, -Z = right

                            // ── Gate: target lock bar starting OUTSIDE wingtips ──
                            const WING_CLEAR = isMobileScreen ? 1.4 : 3.6;
                            const gateBarPts = [
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
                            for (const tz of [labelSide * (GATE_SPAN * 0.6), labelSide * GATE_SPAN]) {
                                const pts = [
                                    new THREE.Vector3(0, 0, tz),
                                    new THREE.Vector3(0.5, 0, tz),
                                ];
                                const tg = new THREE.BufferGeometry().setFromPoints(pts);
                                tickGroup.add(new THREE.Line(tg, tickMat));
                            }
                            group.add(tickGroup);

                            // Target lock impact dot at gate lock point
                            const dotGeo = new THREE.PlaneGeometry(0.5, 0.5);
                            const dotMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 });
                            const dot = new THREE.Mesh(dotGeo, dotMat);
                            dot.rotation.x = -Math.PI / 2;
                            dot.position.z = labelSide * GATE_SPAN;
                            group.add(dot);

                            // ── Tactical MFD Label Panel ──
                            // Desktop: 24w x 10.5h (Landscape 1024x512)
                            // Mobile: 8.5w x 15.0h (Compact Vertical Portrait 512x800 - sits inside viewport)
                            const PANEL_W = isMobileScreen ? 8.5 : 24.0;
                            const PANEL_H = isMobileScreen ? 15.0 : 10.5;
                            const LABEL_Z = labelSide * (GATE_SPAN + PANEL_W * 0.5 + (isMobileScreen ? 0.3 : 2.5));

                            const CW = isMobileScreen ? 512 : 1024;
                            const CH = isMobileScreen ? 800 : 512;
                            const lc = document.createElement('canvas');
                            lc.width = CW;
                            lc.height = CH;
                            const lx = lc.getContext('2d');

                            // 1. Dark Cockpit MFD Glass Background
                            lx.fillStyle = '#06070a';
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
                                // ── MOBILE PORTRAIT CARD CANVAS DRAWING ──
                                const ch = 20;
                                lx.strokeStyle = '#ff4d00';
                                lx.lineWidth = 4;
                                lx.beginPath();
                                lx.moveTo(ch, 4);
                                lx.lineTo(CW - 4, 4);
                                lx.lineTo(CW - 4, CH - ch);
                                lx.lineTo(CW - ch, CH - 4);
                                lx.lineTo(4, CH - 4);
                                lx.lineTo(4, ch);
                                lx.closePath();
                                lx.stroke();

                                lx.strokeStyle = 'rgba(255, 77, 0, 0.35)';
                                lx.lineWidth = 1.5;
                                lx.beginPath();
                                lx.moveTo(ch + 4, 10);
                                lx.lineTo(CW - 10, 10);
                                lx.lineTo(CW - 10, CH - ch - 4);
                                lx.lineTo(CW - ch - 4, CH - 10);
                                lx.lineTo(10, CH - 10);
                                lx.lineTo(10, ch + 4);
                                lx.closePath();
                                lx.stroke();

                                // Corner accents
                                const bl = 28;
                                lx.strokeStyle = 'rgba(255, 77, 0, 0.85)';
                                lx.lineWidth = 3;
                                lx.beginPath(); lx.moveTo(14, 24); lx.lineTo(14 + bl, 24); lx.stroke();
                                lx.beginPath(); lx.moveTo(24, 14); lx.lineTo(24, 14 + bl); lx.stroke();
                                lx.beginPath(); lx.moveTo(CW - 14 - bl, 20); lx.lineTo(CW - 20, 20); lx.lineTo(CW - 20, 20 + bl); lx.stroke();
                                lx.beginPath(); lx.moveTo(CW - 20, CH - 20 - bl); lx.lineTo(CW - 20, CH - 20); lx.lineTo(CW - 20 - bl, CH - 20); lx.stroke();
                                lx.beginPath(); lx.moveTo(20, CH - 20 - bl); lx.lineTo(20, CH - 20); lx.lineTo(20 + bl, CH - 20); lx.stroke();

                                // Header
                                lx.font = 'bold 16px "JetBrains Mono", monospace';
                                lx.fillStyle = 'rgba(255, 77, 0, 0.8)';
                                lx.textAlign = 'left';
                                lx.fillText(`SYS.01 // TGT [0${i + 1}]`, 28, 40);

                                lx.font = 'bold 15px "JetBrains Mono", monospace';
                                lx.textAlign = 'right';
                                lx.fillText(`YR: ${node.year}`, CW - 28, 40);

                                lx.strokeStyle = 'rgba(255, 77, 0, 0.3)';
                                lx.lineWidth = 2;
                                lx.beginPath(); lx.moveTo(28, 52); lx.lineTo(CW - 28, 52); lx.stroke();

                                // Title & Role
                                lx.fillStyle = '#ffffff';
                                lx.shadowColor = 'rgba(255, 77, 0, 0.6)';
                                lx.shadowBlur = 10;
                                lx.font = 'bold 62px "JetBrains Mono", monospace';
                                lx.textAlign = 'left';
                                lx.fillText(node.title, 28, 126);
                                lx.shadowBlur = 0;

                                lx.fillStyle = '#00ffcc';
                                lx.font = 'bold 20px "JetBrains Mono", monospace';
                                lx.fillText(`// ${node.role.toUpperCase()}`, 28, 164);

                                lx.strokeStyle = 'rgba(255, 77, 0, 0.25)';
                                lx.lineWidth = 1.5;
                                lx.beginPath(); lx.moveTo(28, 184); lx.lineTo(CW - 28, 184); lx.stroke();

                                // Stack Pills
                                const stackItems = typeof node.stack === 'string' ? node.stack.split('·').map(s => s.trim()) : [];
                                let stackX = 28, stackY = 204;
                                lx.font = 'bold 15px "JetBrains Mono", monospace';
                                stackItems.forEach(item => {
                                    const tw = lx.measureText(item).width;
                                    const pw = tw + 18;
                                    const ph = 28;
                                    if (stackX + pw > CW - 28) {
                                        stackX = 28;
                                        stackY += 34;
                                    }
                                    lx.fillStyle = 'rgba(255, 77, 0, 0.12)';
                                    lx.fillRect(stackX, stackY, pw, ph);
                                    lx.strokeStyle = 'rgba(255, 77, 0, 0.5)';
                                    lx.lineWidth = 1;
                                    lx.strokeRect(stackX, stackY, pw, ph);
                                    lx.fillStyle = '#ffaa77';
                                    lx.textAlign = 'left';
                                    lx.fillText(item, stackX + 9, stackY + 19);
                                    stackX += pw + 8;
                                });

                                // Mission Brief
                                const briefY = stackY + 50;
                                lx.font = 'bold 17px "JetBrains Mono", monospace';
                                lx.fillStyle = '#ff4d00';
                                lx.fillText('>> MISSION_BRIEF:', 28, briefY);

                                lx.fillStyle = 'rgba(240, 245, 255, 0.88)';
                                lx.font = '20px "Inter", sans-serif';
                                const descWords = node.desc.split(' ');
                                let descLine = '', descY = briefY + 32;
                                for (const w of descWords) {
                                    const test = descLine + w + ' ';
                                    if (lx.measureText(test).width > CW - 56 && descLine) {
                                        lx.fillText(descLine.trim(), 28, descY);
                                        descLine = w + ' ';
                                        descY += 28;
                                        if (descY > CH - 80) break;
                                    } else {
                                        descLine = test;
                                    }
                                }
                                if (descLine.trim() && descY <= CH - 80) lx.fillText(descLine.trim(), 28, descY);

                                // Footer
                                lx.strokeStyle = 'rgba(255, 77, 0, 0.3)';
                                lx.lineWidth = 1.5;
                                lx.beginPath(); lx.moveTo(28, CH - 44); lx.lineTo(CW - 28, CH - 44); lx.stroke();

                                lx.fillStyle = '#00ff88';
                                lx.beginPath(); lx.arc(38, CH - 22, 5, 0, Math.PI * 2); lx.fill();
                                lx.font = 'bold 15px "JetBrains Mono", monospace';
                                lx.fillStyle = '#ff4d00';
                                lx.textAlign = 'left';
                                lx.fillText(`${node.status} // NOMINAL`, 50, CH - 17);
                            } else {
                                // ── DESKTOP LANDSCAPE CARD CANVAS DRAWING ──
                                const ch = 24;
                                lx.strokeStyle = '#ff4d00';
                                lx.lineWidth = 4;
                                lx.beginPath();
                                lx.moveTo(ch, 4);
                                lx.lineTo(CW - 4, 4);
                                lx.lineTo(CW - 4, CH - ch);
                                lx.lineTo(CW - ch, CH - 4);
                                lx.lineTo(4, CH - 4);
                                lx.lineTo(4, ch);
                                lx.closePath();
                                lx.stroke();

                                lx.strokeStyle = 'rgba(255, 77, 0, 0.35)';
                                lx.lineWidth = 1.5;
                                lx.beginPath();
                                lx.moveTo(ch + 6, 12);
                                lx.lineTo(CW - 12, 12);
                                lx.lineTo(CW - 12, CH - ch - 6);
                                lx.lineTo(CW - ch - 6, CH - 12);
                                lx.lineTo(12, CH - 12);
                                lx.lineTo(12, ch + 6);
                                lx.closePath();
                                lx.stroke();

                                const barSegs = 6;
                                const barX = 18;
                                const barStartY = 64;
                                const barH = CH - 128;
                                const segH = (barH - (barSegs - 1) * 4) / barSegs;
                                for (let sb = 0; sb < barSegs; sb++) {
                                    lx.fillStyle = sb < 4 ? '#ff4d00' : 'rgba(255, 77, 0, 0.25)';
                                    lx.fillRect(barX, barStartY + sb * (segH + 4), 6, segH);
                                }

                                const bl = 36;
                                lx.strokeStyle = 'rgba(255, 77, 0, 0.85)';
                                lx.lineWidth = 3;
                                lx.beginPath(); lx.moveTo(14, 28); lx.lineTo(14 + bl, 28); lx.stroke();
                                lx.beginPath(); lx.moveTo(28, 14); lx.lineTo(28, 14 + bl); lx.stroke();
                                lx.beginPath(); lx.moveTo(CW - 14 - bl, 24); lx.lineTo(CW - 24, 24); lx.lineTo(CW - 24, 24 + bl); lx.stroke();
                                lx.beginPath(); lx.moveTo(CW - 24, CH - 24 - bl); lx.lineTo(CW - 24, CH - 24); lx.lineTo(CW - 24 - bl, CH - 24); lx.stroke();
                                lx.beginPath(); lx.moveTo(24, CH - 24 - bl); lx.lineTo(24, CH - 24); lx.lineTo(24 + bl, CH - 24); lx.stroke();

                                lx.font = 'bold 20px "JetBrains Mono", monospace';
                                lx.fillStyle = 'rgba(255, 77, 0, 0.7)';
                                lx.textAlign = 'left';
                                lx.fillText(`SYS.01 // TGT_LOCK [0${i + 1}]`, 42, 44);

                                const typeLabel = node.type || 'PROJECT';
                                lx.font = 'bold 16px "JetBrains Mono", monospace';
                                const badgeX = 360, badgeY = 24, badgeW = 125, badgeH = 26;
                                lx.fillStyle = 'rgba(255, 77, 0, 0.15)';
                                lx.fillRect(badgeX, badgeY, badgeW, badgeH);
                                lx.strokeStyle = '#ff4d00';
                                lx.lineWidth = 1.5;
                                lx.strokeRect(badgeX, badgeY, badgeW, badgeH);
                                lx.fillStyle = '#ff4d00';
                                lx.textAlign = 'center';
                                lx.fillText(`[ ${typeLabel.toUpperCase()} ]`, badgeX + badgeW / 2, badgeY + 18);

                                lx.font = 'bold 20px "JetBrains Mono", monospace';
                                lx.fillStyle = 'rgba(255, 77, 0, 0.8)';
                                lx.textAlign = 'right';
                                lx.fillText(`YR: ${node.year}  |  LOC: 13.08°N`, CW - 32, 44);

                                lx.strokeStyle = 'rgba(255, 77, 0, 0.3)';
                                lx.lineWidth = 2;
                                lx.beginPath(); lx.moveTo(42, 60); lx.lineTo(CW - 32, 60); lx.stroke();

                                lx.fillStyle = '#ffffff';
                                lx.shadowColor = 'rgba(255, 77, 0, 0.6)';
                                lx.shadowBlur = 12;
                                lx.font = 'bold 96px "JetBrains Mono", monospace';
                                lx.textAlign = 'left';
                                lx.fillText(node.title, 42, 160);
                                lx.shadowBlur = 0;

                                lx.fillStyle = '#00ffcc';
                                lx.font = 'bold 28px "JetBrains Mono", monospace';
                                lx.fillText(`// ${node.role.toUpperCase()}`, 42, 204);

                                lx.strokeStyle = 'rgba(255, 77, 0, 0.25)';
                                lx.lineWidth = 1.5;
                                lx.beginPath(); lx.moveTo(42, 224); lx.lineTo(CW - 32, 224); lx.stroke();

                                const stackItems = typeof node.stack === 'string' ? node.stack.split('·').map(s => s.trim()) : [];
                                let stackX = 42;
                                const stackY = 244;
                                lx.font = 'bold 18px "JetBrains Mono", monospace';
                                stackItems.forEach(item => {
                                    const tw = lx.measureText(item).width;
                                    const pw = tw + 24;
                                    const ph = 30;
                                    lx.fillStyle = 'rgba(255, 77, 0, 0.12)';
                                    lx.fillRect(stackX, stackY, pw, ph);
                                    lx.strokeStyle = 'rgba(255, 77, 0, 0.5)';
                                    lx.lineWidth = 1;
                                    lx.strokeRect(stackX, stackY, pw, ph);
                                    lx.fillStyle = '#ffaa77';
                                    lx.textAlign = 'left';
                                    lx.fillText(item, stackX + 12, stackY + 21);
                                    stackX += pw + 12;
                                });

                                lx.font = 'bold 20px "JetBrains Mono", monospace';
                                lx.fillStyle = '#ff4d00';
                                lx.fillText('>> MISSION_BRIEF:', 42, 318);

                                lx.fillStyle = 'rgba(240, 245, 255, 0.85)';
                                lx.font = '22px "Inter", sans-serif';
                                const descWords = node.desc.split(' ');
                                let descLine = '', descY = 352;
                                for (const w of descWords) {
                                    const test = descLine + w + ' ';
                                    if (lx.measureText(test).width > CW - 84 && descLine) {
                                        lx.fillText(descLine.trim(), 42, descY);
                                        descLine = w + ' ';
                                        descY += 32;
                                        if (descY > 410) break;
                                    } else {
                                        descLine = test;
                                    }
                                }
                                if (descLine.trim()) lx.fillText(descLine.trim(), 42, descY);

                                lx.strokeStyle = 'rgba(255, 77, 0, 0.3)';
                                lx.lineWidth = 1.5;
                                lx.beginPath(); lx.moveTo(42, CH - 54); lx.lineTo(CW - 32, CH - 54); lx.stroke();

                                lx.fillStyle = '#00ff88';
                                lx.beginPath(); lx.arc(52, CH - 28, 6, 0, Math.PI * 2); lx.fill();
                                lx.font = 'bold 20px "JetBrains Mono", monospace';
                                lx.fillStyle = '#ff4d00';
                                lx.textAlign = 'left';
                                lx.fillText(`${node.status} // NOMINAL`, 68, CH - 21);

                                lx.font = '18px "JetBrains Mono", monospace';
                                lx.fillStyle = 'rgba(255, 77, 0, 0.55)';
                                lx.textAlign = 'right';
                                lx.fillText(`SIGNAL: ENCRYPTED // LINK_STATION_0${i + 1}`, CW - 32, CH - 21);
                            }

                            lx.setTransform(1, 0, 0, 1, 0, 0);

                            const lTex = new THREE.CanvasTexture(lc);
                            lTex.flipY = true;
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
                        //
                        // flyNorm 0.00 → 0.45: Top-down flight through 4 experience gates (BEAKAN, ANADROME, ZENITH)
                        // flyNorm 0.45 → 0.60: Cockpit Dive — Camera dives from overhead directly into pilot cockpit seat
                        // flyNorm 0.60 → 0.85: Cockpit Landing — Pilot inside cockpit flies down glide slope, touches down & stops at wp2
                        // flyNorm 0.85 → 1.00: Seamless Hotspot Transition — Camera glides from cockpit seat to carrier deck station POV (pov / h2)

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

                        // Hotspots on carrier deck (mapped for -Math.PI / 2 carrier Y-rotation: ox=localZ*S, oz=-localX*S)
                        const S = cScale;
                        const h1 = { ox: 2044.7567 * S, oy: 128.2941 * S, oz: -39.0343 * S };
                        // Hotspot 3 (Spectator POV on Carrier Deck): 223.9672076423808m 128.29475646977212m 2063.7494398648123m
                        const h2 = { ox: 2063.74944 * S, oy: 128.294756 * S, oz: -223.967208 * S };
                        const h3 = { ox: 1676.6043 * S, oy: 128.2941 * S, oz: 11.4416 * S };
                        const h4 = { ox: 87.2635 * S, oy: 128.2942 * S, oz: 87.2635 * S };

                        const JET_DECK_Y_OFFSET = -0.35; // Raises jet height flush onto carrier flight deck surface
                        const RUNWAY_Z_OFFSET = -1.35; // Center jet onto main runway lane (to the right)

                        const td = { x: carrierX + h1.ox, y: carrierY + h1.oy - JET_DECK_Y_OFFSET, z: carrierZ + h1.oz + RUNWAY_Z_OFFSET };
                        // Spectator POV: Pushed further back on carrier deck looking down the runway at approaching jet
                        const pov = { x: carrierX - 8.0, y: carrierY + h2.oy + 2.2, z: carrierZ + h2.oz + 2.5 };
                        const rawWp1 = { x: carrierX + h3.ox, y: carrierY + h3.oy - JET_DECK_Y_OFFSET, z: carrierZ + h3.oz + RUNWAY_Z_OFFSET };
                        const wp1 = { x: td.x, y: td.y, z: td.z };
                        const rawWp2 = { x: carrierX + h4.ox, y: carrierY + h4.oy - JET_DECK_Y_OFFSET, z: carrierZ + h4.oz + RUNWAY_Z_OFFSET };
                        const wp2 = { x: td.x, y: td.y, z: td.z };

                        const glToWZ = (glz) => finalCamWorldZ + (glz - carrierZ);

                        // Phase progress norm calculation
                        const diveNorm = scrollMath.clamp01((flyNorm - 0.27) / 0.18); // 0→1 Deck Spectator Transition (0.27 → 0.45)
                        const easeDive = scrollMath.smoothstep(diveNorm);

                        speedLineOpacity = 0;
                        bankZ = 0;

                        let jX, jY, jZ, jYaw, jPitch = 0;

                        if (flyNorm < 0.27) {
                            // Phase 1: Top-down overhead flight through experience gates (clears ZENITH gate at 0.27)
                            const curJetFlyX = finalCamX - flyNorm * FLY_X_TRAVEL;

                            jX = curJetFlyX - CKPT_OX;
                            jY = cockpitY - CKPT_OY;
                            jZ = finalCamWorldZ - GROUP_Z - CKPT_OZ;
                            jYaw = Math.PI / 2;

                            camX = curJetFlyX;
                            camY = targetCamY;
                            camZ = finalCamWorldZ;
                            pitchX = -Math.PI / 2;
                            yawY = Math.PI / 2;
                            targetFov = 72;
                        } else if (flyNorm < 0.45) {
                            // Phase 2: Deck Spectator Transition — Camera swoops from overhead into spectator station while jet transitions to glide slope entry
                            const startPhase2X = finalCamX - 0.27 * FLY_X_TRAVEL - CKPT_OX;
                            const startPhase2Y = cockpitY - CKPT_OY;
                            const startPhase2Z = finalCamWorldZ - GROUP_Z - CKPT_OZ;

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
                            // Phase 3: Spectator Carrier Landing — Pure 3° glide slope descent starting EXACTLY from td.x + 100.0 down to td.x
                            const landNorm = scrollMath.clamp01((flyNorm - 0.45) / 0.55);
                            const appNorm = scrollMath.clamp01(landNorm / 0.50);
                            const appT = scrollMath.smoothstep(appNorm);

                            const curJetScale = scrollMath.lerp(0.008, 0.0032, appNorm);

                            if (landNorm < 0.50) {
                                // Strictly monotonic forward 3° glide slope descent (td.x + 100.0 -> td.x)
                                jX = scrollMath.lerp(td.x + 100.0, td.x, appT);
                                jY = scrollMath.lerp(td.y + 10.0, td.y, appT);
                                jZ = td.z;
                                jPitch = scrollMath.lerp(-0.06, 0.0, appT);
                            } else {
                                // Arrestor cable trap flush on flight deck
                                jX = td.x;
                                jY = td.y;
                                jZ = td.z;
                                jPitch = 0.0;
                            }
                            jYaw = Math.PI / 2;

                            // Camera anchored at spectator station on carrier deck
                            camX = pov.x;
                            camY = pov.y;
                            camZ = glToWZ(pov.z);

                            pitchX = -0.08;
                            yawY = -75 * Math.PI / 180;
                            targetFov = 60;

                            if (city && city.cockpitHUDCanvas) city.cockpitHUDCanvas.style.opacity = '0';
                        }

                        // ALWAYS set rescue jet position and opacity = 1
                        if (city && city.rescueJet) {
                            const flyScaleNorm = scrollMath.clamp01((flyNorm - 0.45) / 0.175);
                            const scaleVal = flyNorm < 0.45 ? 0.008 : scrollMath.lerp(0.008, 0.0032, flyScaleNorm);
                            city.rescueJet.scale.setScalar(scaleVal);
                            city.rescueJet.position.set(jX, jY, jZ);
                            city.rescueJet.rotation.set(jPitch, jYaw, 0);
                            if (city.rescueJetMat) city.rescueJetMat.opacity = 1.0;
                        }

                        // Debug logging for camera and jet positions
                        if (!window._dbgSubH) window._dbgSubH = 0;
                        if (++window._dbgSubH % 15 === 0) {
                            const phaseStr = flyNorm < 0.27 ? 'PHASE1_GATES' : flyNorm < 0.45 ? 'PHASE2_TRANSITION' : flyNorm < 0.80 ? 'PHASE3_LANDING' : 'PHASE4_HOTSPOT';
                            console.log(`[SUB-H DEBUG] ${phaseStr} flyNorm=${flyNorm.toFixed(3)}\n` +
                                `  jet=(${jX.toFixed(2)}, ${jY.toFixed(2)}, ${jZ.toFixed(2)})\n` +
                                `  cam=(${camX.toFixed(2)}, ${camY.toFixed(2)}, ${camZ.toFixed(2)})\n` +
                                `  rot=(pitch:${pitchX.toFixed(2)}, yaw:${yawY.toFixed(2)}) fov=${targetFov.toFixed(1)}`
                            );
                        }
                    }

                    gl.camera.position.set(camX, camY, camZ);
                    gl.camera.rotation.order = 'YXZ';
                    gl.camera.rotation.y = yawY;
                    gl.camera.rotation.x = pitchX;
                    gl.camera.rotation.z = bankZ || 0;

                    setCameraFov(targetFov);

                    // Speed lines: active during pull-up AND during hyperspace 180° turn & jet approach
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

                    // Debris finishes during pull-up, gone during flight
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

                    // ── Obstacle update: lock-on → impact → post-impact ──
                    //
                    // PHASES (per-obstacle, driven by dist from jet to gate):
                    //   APPROACH  dist 14→4   fade in gate, label, outer ring pulses
                    //   LOCK-ON   dist 4→0    inner ring closes in, DOM reticle shows, gate strobes
                    //   HIT       dist crosses 0  impact flash, camera shake, FOV spike, shards, card in
                    //   POST-HIT  hitT 0→1.5  shards scatter + fade, FOV settles, card dismisses at hitT>0.9
                    //
                    // Camera shake and FOV overrides are written into module-level scratch vars
                    // that the camera block below reads each frame.
                    const lockHud = document.getElementById('lock-hud');
                    const impactFlash = document.getElementById('impact-flash');
                    const lkRange = document.getElementById('lk-range');
                    const lkTarget = document.getElementById('lk-target');
                    const lkLocked = document.getElementById('lk-locked');

                    // Per-frame camera perturbation accumulators (reset each frame)
                    let shakeX = 0, shakeZ = 0, fovBump = 0;
                    let anyLockHudVisible = false;

                    if (window._expObstacles) {
                        const jetWorldX = isPullingUp ? finalCamX : jetFlyX;
                        if (window._runwayGroup) window._runwayGroup.visible = !isPullingUp;
                        if (window._pathTube) window._pathTube.visible = !isPullingUp;

                        window._expObstacles.forEach((obs) => {
                            const dist = jetWorldX - obs.worldX; // + = ahead, − = passed

                            // Auto-reset hit state if user backtracks past the node
                            if (obs.hit && dist > 0.5) {
                                obs.hit = false;
                                obs.hitT = 0;
                                obs.gateLines.visible = true;
                                obs.dot.visible = true;
                                obs.ring1.visible = true;
                                obs.ring2.visible = true;
                                obs.shards.forEach(s => { s.mesh.visible = false; });
                            }

                            // ── Visibility across camera frustum ──
                            const inTurnaround = !isPullingUp && flyNorm > 0.53;
                            if (inTurnaround) {
                                obs.group.visible = false;
                                obs.label.visible = false;
                                obs.conn.visible = false;
                            } else {
                                obs.group.visible = Math.abs(dist) < 35;
                                obs.label.visible = true;
                                obs.conn.visible = true;
                            }

                            const absDist = Math.abs(dist);
                            const approachT = scrollMath.clamp01(1.0 - absDist / 16.0);
                            obs.labelMat.opacity = dist <= 0 ? 1.0 : Math.max(0.4, approachT);
                            obs.connMat.opacity = dist <= 0 ? 0.45 : 0.45 * approachT;

                            if (!obs.hit) {
                                const inApproach = dist > 0 && dist < 14;
                                const inLockZone = dist > 0 && dist < 4;

                                obs.gateMat.opacity = 0.75 * approachT;
                                obs.tickMat.opacity = 0.5 * approachT;
                                obs.dotMat.opacity = approachT;

                                // ── Outer ring: slow breathing pulse, fades in with approach ──
                                if (inApproach) {
                                    const ringPulse = 0.5 + 0.5 * Math.sin(Date.now() * 0.003);
                                    obs.ringMat1.opacity = approachT * 0.5 * ringPulse;
                                    obs.ring1.scale.setScalar(1.0 + (1.0 - approachT) * 0.4);
                                } else {
                                    obs.ringMat1.opacity = 0;
                                }

                                // ── Lock-on zone (dist < 4) ──
                                if (inLockZone) {
                                    const lockT = scrollMath.clamp01(1.0 - dist / 4.0); // 0→1 as dist 4→0
                                    const isLocked = lockT > 0.85;

                                    // Inner ring tightens toward centre
                                    obs.ringMat2.opacity = lockT * 0.9;
                                    obs.ring2.scale.setScalar(scrollMath.lerp(1.8, 0.8, lockT));

                                    // Gate strobe on lock
                                    const strobe = isLocked
                                        ? (Math.sin(Date.now() * 0.025) > 0 ? 1.0 : 0.4)
                                        : 0.75 + 0.25 * Math.sin(Date.now() * 0.012);
                                    obs.gateMat.opacity = strobe;
                                    obs.dotMat.opacity = strobe;

                                    // Lock DOM reticle
                                    anyLockHudVisible = true;
                                    if (lockHud) {
                                        lockHud.classList.add('lk-visible');
                                        if (isLocked && !obs.locked) {
                                            obs.locked = true;
                                            lockHud.classList.add('lk-locked');
                                            if (lkLocked) lkLocked.textContent = 'LOCKED';
                                        }
                                        if (lkRange) lkRange.textContent = dist.toFixed(1) + ' U';
                                        if (lkTarget) lkTarget.textContent = obs.data.title;
                                    }

                                    // Subtle camera zoom push on lock-in
                                    fovBump -= lockT * 3.5;
                                } else {
                                    obs.ringMat2.opacity = 0;
                                    obs.ring2.scale.setScalar(1.8);
                                    obs.locked = false;
                                }

                                // ── Hit trigger ──
                                if (dist < 0 && dist > -2.5) {
                                    obs.hit = true;
                                    obs.hitT = 0;

                                    // Shatter gate elements, but KEEP label & connector visible
                                    obs.gateLines.visible = false;
                                    obs.dot.visible = false;
                                    obs.ring1.visible = false;
                                    obs.ring2.visible = false;
                                    obs.shards.forEach(s => { s.mesh.visible = true; });

                                    // Impact flash
                                    if (impactFlash) {
                                        impactFlash.style.opacity = '1';
                                        setTimeout(() => { impactFlash.style.opacity = '0'; }, 120);
                                    }

                                    // Dismiss lock HUD immediately
                                    if (lockHud) {
                                        lockHud.classList.remove('lk-visible', 'lk-locked');
                                        if (lkLocked) lkLocked.textContent = 'ACQUIRING';
                                    }
                                }

                            } else {
                                // ── Post-hit: shards + camera effects ──
                                obs.hitT += 0.016;
                                const et = obs.hitT;

                                // Camera shake decays over 0.5s
                                if (et < 0.5) {
                                    const shakeAmp = (1.0 - et / 0.5) * 0.18;
                                    shakeX += (Math.random() - 0.5) * shakeAmp;
                                    shakeZ += (Math.random() - 0.5) * shakeAmp;
                                }

                                // FOV spike then settle
                                if (et < 0.6) {
                                    const spikeCurve = Math.exp(-et * 8) * 14; // fast decay
                                    fovBump += spikeCurve;
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
                        if (lkLocked) lkLocked.textContent = 'ACQUIRING';
                    }
                    if (isPullingUp && lockHud) {
                        lockHud.classList.remove('lk-visible', 'lk-locked');
                        if (lkLocked) lkLocked.textContent = 'ACQUIRING';
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

                // Camera stops 1m in front of hologram hotspot, 0.5m above table
                const tableX = 0.27 + 1.0;
                const tableY = 1.24 + 0.5;
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

                // Camera at (1.27, 1.74, -24.68), Panel center at (0.27, 1.60, -24.68)
                // dy = 1.74-1.60 = 0.14, dx = 1.0  →  rotX = -atan(0.14) ≈ -0.139 rad
                const tableRotY = Math.PI / 2;
                const tableRotX = -Math.atan(0.14 / 1.0); // slight downward tilt to panel center

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

            // DOM Hero Content Fading (fades out fast to prevent room overlay)
            if (domHeroContent && !isWarmup) {
                const heroOpacity = 1 - scenePct * 12.5;
                domHeroContent.style.opacity = Math.max(0, heroOpacity);
                domHeroContent.style.transform = `translateY(${scenePct * -80}px)`;
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
                calibPctEl.textContent = `${(scenePct * 100).toFixed(1)}%`;
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

        const scheduleWarmupSequence = () => {
            if (warmupScheduled) return;
            warmupScheduled = true;

            scheduleDeferredTask(() => {
                console.log('ZENITH: INITIATING_BACKGROUND_WARMUP');

                gl.scene.traverse(child => {
                    if (child.isMesh) {
                        child.userData.originalFrustumCulled = child.frustumCulled;
                        child.frustumCulled = false;
                    }
                });

                gl.compile(gl.scene, gl.camera);

                [0, 0.1, 0.3, Math.max(0.3, getScrollPct())].forEach((sample) => {
                    updateScene(sample, 0, true);
                    gl.forceRender();
                });

                gl.scene.traverse(child => {
                    if (child.isMesh && child.userData.originalFrustumCulled !== undefined) {
                        child.frustumCulled = child.userData.originalFrustumCulled;
                    }
                });

                updateScene(getScrollPct(), 0, true);
                gl.forceRender();

                console.log('ZENITH: BACKGROUND_WARMUP_COMPLETE');
            }, 2600);
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

            console.log('ZENITH: STARTING_ASYNC_SCENE_LOAD');
            if (!loaderFinished) {
                setLoaderProgress(45, 'STREAMING_LOFT_INTERIOR');
            }

            ensureCity().catch((error) => {
                console.error('Loft bootstrap failed:', error);
            });
        };

        setLoaderProgress(10, 'ESTABLISHING_NEURAL_UPLINK');
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
            contact: 1.00
        };

        const savedTargets = localStorage.getItem('zenith_nav_targets');
        window._navTargets = savedTargets ? JSON.parse(savedTargets) : defaultTargets;

        // Update button labels with stored percentages
        const updateCalibLabels = () => {
            document.querySelectorAll('.calib-buttons button').forEach(btn => {
                const navKey = btn.getAttribute('data-nav');
                if (navKey && window._navTargets[navKey] !== undefined) {
                    const pctVal = (window._navTargets[navKey] * 100).toFixed(0);
                    const labelName = navKey === 'hero' ? 'Start' : navKey === 'about' ? 'About' : navKey === 'projects' ? 'Projects' : navKey === 'experience' ? 'Exp' : 'Links';
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

                    console.log(`[NAV CALIBRATOR] Target '${navKey}' calibrated to ${(curPct * 100).toFixed(2)}% (scroll: ${Math.round(scroll.getMaxScroll() * curPct)}px)`);
                }
            });
        });

        // --- NAVBAR CLICKS ---
        document.querySelectorAll('.hud-nav a').forEach(link => {
            link.addEventListener('click', async (e) => {
                e.preventDefault();
                const targetId = link.getAttribute('href');
                if (targetId && targetId.startsWith('#')) {
                    const maxScroll = scroll.getMaxScroll();
                    let navKey = 'hero';

                    if (targetId === '#hero') navKey = 'hero';
                    else if (targetId === '#about') navKey = 'about';
                    else if (targetId === '#projects' || targetId === '#work') navKey = 'projects';
                    else if (targetId === '#experience') navKey = 'experience';
                    else if (targetId === '#contact' || targetId === '#signal') navKey = 'contact';

                    const targetPct = window._navTargets[navKey] !== undefined ? window._navTargets[navKey] : defaultTargets[navKey] || 0;

                    scroll.scrollTo(maxScroll * targetPct, {
                        duration: 1.8,
                        easing: (t) => 1 - Math.pow(1 - t, 3)
                    });

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

        // --- PROJECTS FULLSCREEN (Raycast trigger on computer screen monitor ONLY) ---
        const projectsFullscreen = document.getElementById('projects-fullscreen');
        const projectsBack = document.getElementById('projects-back');
        const compRaycaster = new THREE.Raycaster();
        const compMouse = new THREE.Vector2();

        const openProjects = () => {
            if (!projectsFullscreen) return;
            projectsFullscreen.classList.remove('hidden');
            scroll.stop();
        };

        const closeProjects = () => {
            if (!projectsFullscreen) return;
            projectsFullscreen.classList.add('hidden');
            scroll.start();
        };

        // ONLY open projects screen if clicking directly on the 3D computer monitor in the loft
        document.addEventListener('click', (e) => {
            // 1. Ignore clicks on HTML UI elements (navbar links, buttons, overlays)
            if (e.target.closest('a, button, nav, .hud-nav, #projects-fullscreen, .social-button, input')) return;

            // 2. Only check when in the Loft / Projects section
            const currentScrollPct = getScrollPct();
            if (currentScrollPct < 0.18 || currentScrollPct > 0.55) return;

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
        });

        const perfParam = new URLSearchParams(window.location.search).get('perf');
        if (perfParam === '0') {
            localStorage.removeItem('zenithPerf');
        } else if (perfParam === '1' || localStorage.getItem('zenithPerf') === '1') {
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
