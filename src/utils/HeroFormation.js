/**
 * HeroFormation — Uses the real 3D F-35 jet model.
 * As the user scrolls, the jet flies from camera toward Earth.
 */

import '../styles/hero-formation.css';

export default class HeroFormation {
    constructor(glScene, canvas) {
        this.scene = glScene;
        this.canvas = canvas;
        this.heroEl = document.querySelector('.split-text');
        this.manifesto = document.querySelector('.manifesto');
        if (!this.heroEl) return;
        this._spawnJet();
    }

    async _spawnJet() {
        if (!this.scene) return;
        try {
            const THREE = await import('three');

            // 1. Create a transparent overlay canvas so the 3D jet renders ON TOP of HTML text
            this.overlayCanvas = document.createElement('canvas');
            this.overlayCanvas.style.position = 'fixed';
            this.overlayCanvas.style.top = '0';
            this.overlayCanvas.style.left = '0';
            this.overlayCanvas.style.width = '100vw';
            this.overlayCanvas.style.height = '100vh';
            this.overlayCanvas.style.zIndex = '30'; // Above text
            this.overlayCanvas.style.pointerEvents = 'none';
            document.body.appendChild(this.overlayCanvas);

            this.overlayRenderer = new THREE.WebGLRenderer({ canvas: this.overlayCanvas, alpha: true, antialias: true });
            this.overlayRenderer.setSize(window.innerWidth, window.innerHeight);
            this.overlayRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
            this.overlayRenderer.setClearColor(0x000000, 0);
            this.overlayRenderer.clear();

            window.addEventListener('resize', () => {
                if (this.overlayRenderer) {
                    this.overlayRenderer.setSize(window.innerWidth, window.innerHeight);
                }
            });

            this.overlayScene = new THREE.Scene();

            // Add lighting for the solid jet material
            const ambient = new THREE.AmbientLight(0xffffff, 1.8); // Much brighter ambient light
            this.overlayScene.add(ambient);
            const dirLight = new THREE.DirectionalLight(0xffffff, 4.0); // Stronger primary light
            dirLight.position.set(10, 20, 10);
            this.overlayScene.add(dirLight);
            const backLight = new THREE.DirectionalLight(0x88ccff, 3.0); // Bright cyan/blue rim light
            backLight.position.set(-10, -10, -10);
            this.overlayScene.add(backLight);

            // 2. Load the Jet
            const { cloneCachedScene, createModelUrl } = await import('../gl/modelCache.js');
            const model = await cloneCachedScene(createModelUrl('jet_fighter-optimized.glb'));

            this.jetGroup = new THREE.Group();

            const solidMat = new THREE.MeshStandardMaterial({
                color: 0xe0e0e0, // Bright silver
                metalness: 0.7, // Lower metalness to catch more diffuse light
                roughness: 0.2, // Very smooth for crisp reflections
                transparent: true,
                opacity: 1.0
            });

            model.traverse(child => {
                if (child.isMesh) {
                    child.material = solidMat;
                }
            });

            model.scale.multiplyScalar(1.2);
            model.rotation.set(0, 0, 0);  // Level flight attitude

            const modelLeft = model.clone();

            this.jetGroupRight = new THREE.Group();
            this.jetGroupRight.add(model);
            this.jetGroupRight.position.set(0, 0, 35);
            this.jetGroupRight.visible = false;

            this.jetGroupLeft = new THREE.Group();
            this.jetGroupLeft.add(modelLeft);
            this.jetGroupLeft.position.set(0, 0, 35);
            this.jetGroupLeft.visible = false;

            this.overlayScene.add(this.jetGroupRight);
            this.overlayScene.add(this.jetGroupLeft);

            this.jetLoaded = true;
        } catch (e) {
            console.warn('HeroFormation: Jet load failed', e);
        }
    }

    update(scrollPct, camera) {

        const smoothstep = t => t * t * (3 - 2 * t);

        // ===== 3D JET (Outer Wingmen) =====
        // Stretched flight paths to cruise (active from 0.005 to 0.10)
        if (this.jetLoaded && this.jetGroupRight && this.jetGroupLeft && camera) {
            if (scrollPct > 0.005 && scrollPct < 0.10) {
                this.jetGroupRight.visible = true;
                this.jetGroupLeft.visible = true;

                const t = (scrollPct - 0.005) / 0.095; // Cruise and peel off sequence ends by 10% scroll

                const startZ = camera.position.z - 3;
                const endZ = camera.position.z - 50;
                const currentZ = startZ + (endZ - startZ) * smoothstep(t);

                // Timing variables
                const xyEase = smoothstep(Math.min(t * 2.5, 1)); // Centers by t=0.4 (approx 0.043 scroll)
                const peelOffT = Math.max(0, (t - 0.47) / 0.53); // Starts peeling away at t=0.47 (exactly 0.05 scroll)
                const peelEase = peelOffT * peelOffT * peelOffT; // Accelerates outward

                // Y Position (shared) - raised higher above camera to clear buildings
                const startY = camera.position.y + 4.0;
                const peelY = startY + 25; // Fly up higher during peel off
                const currentY = startY + (peelY - startY) * peelEase;

                // RIGHT JET
                const startXRight = camera.position.x + 30.0;
                const endXRight = camera.position.x + 18.0;
                const peelXRight = endXRight + 25.0; // Break formation to the right

                this.jetGroupRight.position.z = currentZ;
                this.jetGroupRight.position.x = startXRight + (endXRight - startXRight) * xyEase + (peelXRight - endXRight) * peelEase;
                this.jetGroupRight.position.y = currentY;

                const bankInRight = (1 - xyEase) * 0.8;
                const bankOutRight = peelEase * -1.5;
                this.jetGroupRight.rotation.y = camera.rotation.y + Math.PI + (bankInRight * 0.4) + (bankOutRight * 0.6);
                this.jetGroupRight.rotation.z = camera.rotation.z + bankInRight + bankOutRight;
                this.jetGroupRight.rotation.x = 0 + peelEase * 0.8; // Perfectly level with horizon, climb out during escape

                // LEFT JET
                const startXLeft = camera.position.x - 30.0;
                const endXLeft = camera.position.x - 18.0;
                const peelXLeft = endXLeft - 25.0; // Break formation to the left

                this.jetGroupLeft.position.z = currentZ;
                this.jetGroupLeft.position.x = startXLeft + (endXLeft - startXLeft) * xyEase + (peelXLeft - endXLeft) * peelEase;
                this.jetGroupLeft.position.y = currentY;

                const bankInLeft = (1 - xyEase) * 0.8;
                const bankOutLeft = peelEase * -1.5;
                this.jetGroupLeft.rotation.y = camera.rotation.y + Math.PI - (bankInLeft * 0.4) - (bankOutLeft * 0.6);
                this.jetGroupLeft.rotation.z = camera.rotation.z - (bankInLeft + bankOutLeft);
                this.jetGroupLeft.rotation.x = 0 + peelEase * 0.8;

                // Fading
                const fadeIn = Math.min(t / 0.1, 1); // Fade in quickly
                const fadeOut = t > 0.5 ? 1.0 - (t - 0.5) / 0.5 : 1.0; // Fade out during the peel off phase (starts at 0.05 scroll)
                const opacity = Math.max(Math.min(fadeIn, fadeOut), 0);

                const updateOpacity = (group) => {
                    group.traverse(child => {
                        if (child.isMesh) {
                            child.material.opacity = opacity;
                        }
                    });
                };
                updateOpacity(this.jetGroupRight);
                updateOpacity(this.jetGroupLeft);

                if (this.overlayRenderer && this.overlayScene) {
                    this.overlayRenderer.render(this.overlayScene, camera);
                }
            } else {
                this.jetGroupRight.visible = false;
                this.jetGroupLeft.visible = false;
                if (this.overlayRenderer) {
                    this.overlayRenderer.clear();
                }
            }
        }

    }
}
