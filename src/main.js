import './styles/base.css';

console.log('%c ZENITH BOOT SEQUENCE ', 'background: #222; color: #ff4d00');

document.addEventListener('DOMContentLoaded', async () => {
    try {
        console.log('1. Loading Dependencies...');
        const gsap = (await import('gsap')).default;
        const { ScrollTrigger } = await import('gsap/ScrollTrigger');

        gsap.registerPlugin(ScrollTrigger);

        console.log('2. Check DOM...');
        const canvas = document.querySelector('#gl-canvas');
        if (!canvas) throw new Error('Canvas #gl-canvas not found');

        // Debug border to check visibility
        // canvas.style.border = '1px solid red';

        console.log('3. Loading Modules...');
        const ScrollManager = (await import('./managers/ScrollManager')).default;
        const GLManager = (await import('./gl/GLManager')).default;
        const Suns = (await import('./gl/Suns')).default;
        const Fallout = (await import('./gl/Fallout')).default;
        const City = (await import('./gl/City')).default;
        const Satellites = (await import('./gl/Satellites')).default;
        const haptics = (await import('./utils/Haptics')).default;
        const createAudioPulseSystem = (await import('./utils/AudioPulse')).default;
        const CinematicManager = (await import('./utils/CinematicManager')).default;
        const ProjectCards = (await import('./gl/ProjectCards')).default;

        console.log('4. Initializing Core Systems...');
        const scroll = new ScrollManager();
        const gl = new GLManager(canvas);

        // --- LOADING SEQUENCE (ORCHESTRATION) ---
        const loader = document.getElementById('loader');
        const loaderBar = document.getElementById('loader-progress');
        const loaderPct = document.getElementById('loader-pct');
        const loaderText = document.getElementById('loader-text');


        let suns, city, satellites, fallout, projectCardsSystem;

        const setLoaderProgress = (pct, text) => {
            if (loaderBar) loaderBar.style.width = `${pct}%`;
            if (loaderPct) loaderPct.innerText = `${pct.toString().padStart(2, '0')}%`;
            if (text && loaderText) loaderText.innerText = text;
        };

        const finishLoading = () => {
            setLoaderProgress(100, 'NEURAL_LINK_SYNCHRONIZED');
            setTimeout(() => {
                if (loader) loader.classList.add('loader-hidden');
                console.log('ZENITH SEQUENCE: SYSTEMS GO');
            }, 800);
        };

        // PHASE 1: Earth (Suns)
        setLoaderProgress(10, 'ESTABLISHING_NEURAL_UPLINK');
        suns = new Suns(gl);
        suns.onLoad = () => {
            // PHASE 2: City
            setLoaderProgress(40, 'CALIBRATING_CITY_GRID');
            city = new City(gl);
            city.onLoad = () => {
                // PHASE 3: Remaining Systems
                setLoaderProgress(70, 'SCANNING_ORBITAL_OBJECTS');
                satellites = new Satellites(gl);
                fallout = new Fallout(gl);
                projectCardsSystem = new ProjectCards(gl);

                // Final Delay to ensure everything settles
                setTimeout(finishLoading, 500);
            };
        };

        const audioPulse = createAudioPulseSystem();
        const cinematic = new CinematicManager();

        // Setup haptic section boundaries (Hero, ARCHIVE, About, Contact)
        haptics.setSectionBoundaries([0, 0.27, 0.5, 0.8, 1.0]);
        const sectionBoundaries = [0, 0.27, 0.5, 0.8, 1.0];
        let lastSectionIndex = -1;

        const fireNavPulse = () => {
            if (suns.triggerPulse) {
                suns.triggerPulse(0.9);
            }
            if (cinematic && cinematic.triggerPulse) {
                cinematic.triggerPulse(0.9);
            }
        };

        const resumeAudio = () => {
            if (audioPulse && audioPulse.resume) {
                audioPulse.resume().catch(() => { });
            }
        };

        document.addEventListener('pointerdown', resumeAudio, { once: true, passive: true });

        // We keep projectCards/transitions for now as they might be used for the Project section? 
        // PRD says "The experience serves as a continuous visual narrative".
        // If ProjectCards are part of the "Works" section, we might keep them but they aren't in the PRD scope I'm implementing right now.
        // I'll leave them to avoid breaking existing functionality unless requested to remove.
        // I'll leave them to avoid breaking existing functionality unless requested to remove.
        // We keep projectCards/transitions for now as they might be used for the Project section? 
        // PRD says "The experience serves as a continuous visual narrative".
        // If ProjectCards are part of the "Works" section, we might keep them but they aren't in the PRD scope I'm implementing right now.
        // projectCardsSystem is already declared above
        const clamp01 = (value) => Math.max(0, Math.min(1, value));
        const lerp = (from, to, t) => from + (to - from) * t;
        const CITY_CAMERA_ENTRY = 0.65;
        const TILT_START = 0.55;

        // --- NAVBAR CLICKS ---
        document.querySelectorAll('.hud-nav a').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const targetId = link.getAttribute('href');
                if (targetId && targetId.startsWith('#')) {
                    // Special handling for #work because it uses GSAP pinning
                    if (targetId === '#work') {
                        // Dynamic calculation: Match exactly with Camera Segment 1 end (scrollPct = 0.27)
                        // This ensures we land exactly at the "Archive" hotspot
                        const maxScroll = document.body.scrollHeight - window.innerHeight;
                        scroll.scrollTo(maxScroll * 0.27, {
                            duration: 1.5,
                            easing: (t) => 1 - Math.pow(1 - t, 3)
                        });
                    } else {
                        const target = document.querySelector(targetId);
                        if (target) {
                            scroll.scrollTo(target, {
                                offset: 0,
                                duration: 1.5,
                                easing: (t) => 1 - Math.pow(1 - t, 3)
                            });
                        }
                    }
                    fireNavPulse();
                }
            });
        });

        // --- RESIZE HANDLER ---
        window.addEventListener('resize', () => {
            if (projectCardsSystem && projectCardsSystem.resize) {
                projectCardsSystem.resize();
            }

        });

        // Hook Scroll Velocity and Position
        gsap.ticker.add(() => {
            // Unified access (Works for both Lenis and Native)
            const velocity = scroll.velocity || 0;
            const progress = scroll.scroll || 0;
            const maxScroll = document.body.scrollHeight - window.innerHeight;

            const scrollPct = Math.min(progress / maxScroll, 1.0); // 0 to 1

            // --- CAMERA LOGIC (PRD 6. Scroll Hook) ---
            // 4-Point Path (Rev 10): Archive -> Path1 -> About -> Connect
            let p1 = { x: 5, y: -36, z: 51 };   // Archive
            let p2 = { x: 25, y: -36, z: 0 };   // Path1
            let p3 = { x: 56, y: -37, z: -43 }; // About
            let p4 = { x: 96, y: -38, z: -117 };// Connect

            if (city && city.modelReady) {
                const wp1 = city.getWaypoint('archive');
                const wp2 = city.getWaypoint('archive_about');
                const wp3 = city.getWaypoint('about');
                const wp4 = city.getWaypoint('connect');

                if (wp1) p1 = wp1;
                if (wp2) p2 = wp2;
                if (wp3) p3 = wp3;
                if (wp4) p4 = wp4;
            }


            // Tilt Adjustment: Works (Archive) P1 rotation
            // Adjusted to 40 deg to center Survivor
            const rotP1 = Math.PI * (40 / 180);

            if (scrollPct < 0.27) {
                // Segment 1: Approach Archive (Start -> P1) - Extended to 0.27
                const norm = scrollPct / 0.27;
                const t = 1 - Math.pow(1 - norm, 3);

                gl.camera.position.x = lerp(0, p1.x, t);
                gl.camera.position.y = lerp(0, p1.y, t);
                gl.camera.position.z = lerp(40, p1.z, t);

                gl.camera.rotation.x = lerp(0, 0, t);
                gl.camera.rotation.y = lerp(0, rotP1, t);



                // Show stalls after passing archive (scrollPct >= 0.22)
                if (city && city.stallModels) {
                    city.stallModels.forEach(stall => {
                        stall.visible = scrollPct >= 0.22;
                    });
                }



                // Hide About section if visible
                const aboutSection = document.querySelector('.battlefield-hud');
                if (aboutSection) {
                    aboutSection.style.opacity = '0';
                    aboutSection.style.pointerEvents = 'none';
                }
            } else if (scrollPct < 0.5) {
                // Segment 2: Archive -> Path1 (P1 -> P2)
                const norm = (scrollPct - 0.27) / 0.23;
                gl.camera.position.x = lerp(p1.x, p2.x, norm);
                gl.camera.position.y = lerp(p1.y, p2.y, norm);
                gl.camera.position.z = lerp(p1.z, p2.z, norm);

                gl.camera.rotation.x = 0;
                // User Request: Sharp turn BEFORE reaching Path1 (90 degrees)
                // Transition from RotP1 to (PI/8 + 90deg)
                const targetRot = Math.PI / 8 + (Math.PI / 2);
                gl.camera.rotation.y = lerp(rotP1, targetRot, norm);

                // Keep Survivor fully visible
                if (city && city.survivorModel) {
                    city.survivorModel.traverse((child) => {
                        if (child.isMesh && child.material) {
                            child.material.opacity = 1.0;
                        }
                    });
                }


                // Keep stalls visible
                if (city && city.stallModels) {
                    city.stallModels.forEach(stall => stall.visible = true);
                }



                // Show About section IMMEDIATELY in Segment 2
                // This ensures it starts fading in right after leaving Archive at 0.27
                const aboutSection = document.querySelector('.battlefield-hud');
                if (aboutSection) {
                    aboutSection.style.opacity = '1';
                    aboutSection.style.pointerEvents = 'auto';
                }
            } else if (scrollPct < 0.85) {
                // Segment 3: Path1 -> About (P2 -> P3)
                const norm = (scrollPct - 0.5) / 0.35;
                gl.camera.position.x = lerp(p2.x, p3.x, norm);
                gl.camera.position.y = lerp(p2.y, p3.y, norm);
                gl.camera.position.z = lerp(p2.z, p3.z, norm);

                gl.camera.rotation.x = 0;
                // Maintain the turned angle (PI/8 + 90deg) through Segment 3
                const targetRot = Math.PI / 8 + (Math.PI / 2);
                gl.camera.rotation.y = targetRot;

                // Show About section ASAP (scrollPct >= 0.5)
                // The camera arrives at About ~0.5. We ensure it's visible.
                // Fade in Survivor model during About section
                const aboutSection = document.querySelector('.battlefield-hud');
                if (aboutSection) {
                    aboutSection.style.opacity = '1';
                    aboutSection.style.pointerEvents = 'auto';
                }

                if (city && city.survivorModel) {
                    const fadeNorm = Math.min(1, norm * 2); // Fade in during first half of segment
                    city.survivorModel.traverse((child) => {
                        if (child.isMesh && child.material) {
                            child.material.opacity = fadeNorm;
                        }
                    });
                }


            } else {
                // Segment 4: About -> Connect (P3 -> P4)
                const norm = (scrollPct - 0.85) / 0.15;
                gl.camera.position.x = lerp(p3.x, p4.x, norm);
                gl.camera.position.y = lerp(p3.y, p4.y, norm);
                gl.camera.position.z = lerp(p3.z, p4.z, norm);

                gl.camera.rotation.x = 0;
                // Match previous segment end -> Connect Rotation (-PI/6)
                const startRot = Math.PI / 8 + (Math.PI / 2);
                gl.camera.rotation.y = lerp(startRot, -Math.PI / 6, norm);

                // Keep About section visible
                const aboutSection = document.querySelector('.battlefield-hud');
                if (aboutSection) {
                    aboutSection.style.opacity = '1';
                    aboutSection.style.pointerEvents = 'auto';
                }
                gl.camera.rotation.y = lerp(startRot, -Math.PI / 6, norm);
            }

            // Update components
            if (suns && suns.update) suns.update();
            if (fallout && fallout.update) fallout.update();
            if (city && city.setScrollProgress) city.setScrollProgress(scrollPct);
            if (city && city.update) city.update(scrollPct);
            if (satellites && satellites.update) satellites.update();
            if (satellites && satellites.setScrollProgress) satellites.setScrollProgress(scrollPct);
            if (projectCardsSystem && projectCardsSystem.update) projectCardsSystem.update();

            // Haptic feedback on scroll progress
            haptics.onScrollProgress(scrollPct);

            // Pass uniform to Suns if needed
            if (suns.setScrollData) {
                suns.setScrollData(scrollPct, velocity);
            }

            if (audioPulse && suns.setAudioEnergy) {
                const energy = audioPulse.getEnergy ? audioPulse.getEnergy() : 0;
                suns.setAudioEnergy(energy);
            }

            if (cinematic && cinematic.update) {
                cinematic.update(scrollPct, velocity);
            }

            let currentSection = 0;
            for (let i = 0; i < sectionBoundaries.length; i++) {
                if (scrollPct >= sectionBoundaries[i]) {
                    currentSection = i;
                }
            }

            // --- VISIBILITY CULLING (PERFORMANCE) ---
            // 1. Earth (Suns): Visible Start -> 0.15 (Approach). Hidden in City.
            //    Re-appear at end? No, stays hidden.
            if (suns && suns.model) {
                // Force hide if deep in city to save fragment shader
                // OPTIMIZATION: Hide sooner (0.15) to prevent overdraw with City
                suns.model.visible = scrollPct < 0.15;
            }

            // 2. City: Hidden at Start (0.0 -> 0.1). Visible 0.1 -> End.
            if (city && city.group) {
                const cityVisible = scrollPct > 0.05;
                city.group.visible = cityVisible;
                // Also optimize stall visibility
                if (cityVisible && city.stallModels) {
                    // Stalls only needed in Segment 1 & 2
                    const stallsNeeded = scrollPct > 0.2 && scrollPct < 0.6;
                    city.stallModels.forEach(s => s.visible = stallsNeeded);
                }
            }

            // 3. Satellites: Handled internally by setScrollProgress (visible < 0.1)

            // 4. Project Cards: Only visible in Work/Archive section (0.2 -> 0.4)
            if (projectCardsSystem && projectCardsSystem.container) {
                // Optimization if container exposes visibility control
                // For now, reliance on internal logic or CSS opacity
            }



        });

        // --- TEXT SCRAMBLE EFFECT ---
        const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
        const heroTitle = document.querySelector('.split-text');

        if (heroTitle) {
            heroTitle.dataset.original = heroTitle.innerHTML;

            heroTitle.addEventListener('mouseover', event => {
                let iteration = 0;
                const originalHTML = heroTitle.dataset.original;
                // Split by <br> to preserve layout
                const parts = originalHTML.split('<br>');

                clearInterval(heroTitle.interval);

                heroTitle.interval = setInterval(() => {
                    const newParts = parts.map(part => {
                        return part.split("")
                            .map((letter, index) => {
                                if (index < iteration) {
                                    return part[index];
                                }
                                return letters[Math.floor(Math.random() * 26)];
                            })
                            .join("");
                    });

                    heroTitle.innerHTML = newParts.join('<br>');

                    // Stop when all letters are resolved
                    if (iteration >= Math.max(...parts.map(p => p.length))) {
                        clearInterval(heroTitle.interval);
                        heroTitle.innerHTML = heroTitle.dataset.original;
                    }

                    iteration += 1 / 3;
                }, 30);
            });
        }

        // Ignition
        console.log('5. Ignition...');
        scroll.stop();
        window.scrollTo(0, 0);
        suns.ignition();

        setTimeout(() => {
            scroll.start();
        }, 2500);

        console.log('SYSTEM ONLINE.');

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

