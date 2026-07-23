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
    }    async _spawnJet() {
        if (!this.scene) return;
        try {
            const THREE = await import('three');

            // 1. Load the Jet
            const { cloneCachedScene, createModelUrl } = await import('../gl/modelCache.js');
            const model = await cloneCachedScene(createModelUrl('jet_fighter-optimized.glb'));

            // Mobile-optimized Phong material (significantly lighter for mobile GPUs than PBR StandardMaterial)
            this.solidMat = new THREE.MeshPhongMaterial({
                color: 0xe0e0e0,
                specular: 0x88ccff,
                shininess: 60,
                transparent: true,
                opacity: 1.0,
                depthWrite: false
            });

            model.traverse(child => {
                if (child.isMesh) {
                    child.material = this.solidMat;
                    child.renderOrder = 999; // Ensure jets render cleanly over background
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

            // Render directly inside the primary Three.js WebGL scene — zero 2nd WebGL renderer overhead!
            this.scene.add(this.jetGroupRight);
            this.scene.add(this.jetGroupLeft);

            this.jetLoaded = true;
        } catch (e) {
            console.warn('HeroFormation: Jet load failed', e);
        }
    }

    update(scrollPct, camera) {
        const smoothstep = t => t * t * (3 - 2 * t);

        // ===== 3D JET (Outer Wingmen) =====
        if (this.jetLoaded && this.jetGroupRight && this.jetGroupLeft && camera) {
            if (scrollPct > 0.005 && scrollPct < 0.10) {
                this.jetGroupRight.visible = true;
                this.jetGroupLeft.visible = true;

                const t = (scrollPct - 0.005) / 0.095; // Cruise and peel off sequence ends by 10% scroll

                const startZ = camera.position.z - 3;
                const endZ = camera.position.z - 50;
                const currentZ = startZ + (endZ - startZ) * smoothstep(t);

                // Timing variables
                const xyEase = smoothstep(Math.min(t * 2.5, 1));
                const peelOffT = Math.max(0, (t - 0.47) / 0.53);
                const peelEase = peelOffT * peelOffT * peelOffT;

                // Y Position (shared)
                const startY = camera.position.y + 4.0;
                const peelY = startY + 25;
                const currentY = startY + (peelY - startY) * peelEase;

                // RIGHT JET
                const startXRight = camera.position.x + 30.0;
                const endXRight = camera.position.x + 18.0;
                const peelXRight = endXRight + 25.0;

                this.jetGroupRight.position.z = currentZ;
                this.jetGroupRight.position.x = startXRight + (endXRight - startXRight) * xyEase + (peelXRight - endXRight) * peelEase;
                this.jetGroupRight.position.y = currentY;

                const bankInRight = (1 - xyEase) * 0.8;
                const bankOutRight = peelEase * -1.5;
                this.jetGroupRight.rotation.y = camera.rotation.y + Math.PI + (bankInRight * 0.4) + (bankOutRight * 0.6);
                this.jetGroupRight.rotation.z = camera.rotation.z + bankInRight + bankOutRight;
                this.jetGroupRight.rotation.x = 0 + peelEase * 0.8;

                // LEFT JET
                const startXLeft = camera.position.x - 30.0;
                const endXLeft = camera.position.x - 18.0;
                const peelXLeft = endXLeft - 25.0;

                this.jetGroupLeft.position.z = currentZ;
                this.jetGroupLeft.position.x = startXLeft + (endXLeft - startXLeft) * xyEase + (peelXLeft - endXLeft) * peelEase;
                this.jetGroupLeft.position.y = currentY;

                const bankInLeft = (1 - xyEase) * 0.8;
                const bankOutLeft = peelEase * -1.5;
                this.jetGroupLeft.rotation.y = camera.rotation.y + Math.PI - (bankInLeft * 0.4) - (bankOutLeft * 0.6);
                this.jetGroupLeft.rotation.z = camera.rotation.z - (bankInLeft + bankOutLeft);
                this.jetGroupLeft.rotation.x = 0 + peelEase * 0.8;

                // Single material opacity update (zero per-frame traversal)
                const fadeIn = Math.min(t / 0.1, 1);
                const fadeOut = t > 0.5 ? 1.0 - (t - 0.5) / 0.5 : 1.0;
                const opacity = Math.max(Math.min(fadeIn, fadeOut), 0);

                if (this.solidMat) {
                    this.solidMat.opacity = opacity;
                }
            } else {
                this.jetGroupRight.visible = false;
                this.jetGroupLeft.visible = false;
            }
        }
    }
}
