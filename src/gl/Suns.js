import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import gsap from 'gsap';

export default class Suns {
    constructor(glManager) {
        this.gl = glManager;
        this.clock = new THREE.Clock();
        this.loader = new GLTFLoader();

        // DRACO Configuration
        this.dracoLoader = new DRACOLoader();
        this.dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
        this.loader.setDRACOLoader(this.dracoLoader);

        this.model = null;

        this.init();
    }

    init() {
        console.log('Earth System: Initializing...');

        this.loader.load(
            import.meta.env.BASE_URL + 'earth.glb',
            (gltf) => {
                this.model = gltf.scene;
                this.modelReady = true;
                console.log('Earth System: Model Loaded');
                if (this.onLoad) this.onLoad();

                // 1. Scale & Position
                this.isMobile = window.innerWidth < 768;
                this.baseScale = this.isMobile ? 25.0 : 25.0; // Reduced by 25% for mobile
                this.model.scale.set(this.baseScale, this.baseScale, this.baseScale);

                // Positioned slightly lower to center in Hero view
                this.model.position.set(0, -5, -25);
                this.model.rotation.z = 23.5 * (Math.PI / 180); // Axial Tilt

                this.earthMeshes = [];

                // 2. Material Setup
                this.model.traverse((child) => {
                    if (child.isMesh) {
                        // Use existing map if available
                        const oldMat = child.material;
                        const newMat = new THREE.MeshBasicMaterial({
                            map: oldMat.map || null,
                            color: new THREE.Color(0xffffff), // Pure white to show texture
                            transparent: false, // Start OPAQUE to force depth write
                            opacity: 1.0,
                            side: THREE.DoubleSide,
                            depthWrite: true, // Start blocking stars
                            depthTest: true
                        });
                        child.material = newMat;
                        child.renderOrder = 1; // Render before city
                        this.earthMeshes.push(child);
                    }
                });

                this.gl.scene.add(this.model);
            },
            undefined,
            (error) => {
                console.error('Earth System Error:', error);
            }
        );

        // --- MANDALA RESTORATION: Mouse Interaction ---
        this.mouse = new THREE.Vector2();
        this.targetRotation = new THREE.Vector2();

        window.addEventListener('mousemove', (e) => {
            // Normalized -1 to 1
            this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
            this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
        });

        this.audioScale = 1.0;
        this.pulseScale = 1.0;
    }

    ignition() {
        // Intro Animation
        if (this.model) {
            this.model.scale.set(0, 0, 0);
            gsap.to(this.model.scale, {
                x: this.baseScale,
                y: this.baseScale,
                z: this.baseScale,
                duration: 3.5,
                ease: "expo.out"
            });
        }
    }

    setScrollData(progress, velocity) {
        if (!this.model) return;

        // Transition Logic:
        // Breach of surface happens around 8% scroll.
        // 0.00 -> 0.15: Zoom IN (Move Z closer)
        // 0.05 -> 0.12: Fade OUT (Opacity -> 0)

        const zoomPhase = Math.min(progress / 0.15, 1.0); // 0 to 1 over first 15%
        const fadePhase = Math.max(0, (progress - 0.05) / 0.07); // 0 to 1 from 5% to 12%

        // 1. Zoom Effect
        // Move from -30 to 10 (pass through camera)
        const startZ = -30;
        const endZ = 20;
        const currentZ = startZ + (endZ - startZ) * zoomPhase;
        this.model.position.z = currentZ;

        // 2. Fade Effect
        const opacity = 1.0 - Math.min(fadePhase, 1.0);

        // Dynamic Depth Write & Transparency
        // When opaque, treat as solid object to block stars.
        // When fading, enable transparency and disable depth write to avoid occlusion.
        const isSolid = opacity > 0.95;

        if (this.earthMeshes) {
            this.earthMeshes.forEach(mesh => {
                mesh.material.opacity = opacity;
                mesh.material.transparent = !isSolid;
                mesh.material.depthWrite = isSolid;
                mesh.visible = opacity > 0;
            });
        }
        this.model.visible = opacity > 0;

        // 3. Rotation (Spin faster when moving)
        this.model.rotation.y += 0.001 + Math.abs(velocity * 0.0005);
    }

    setAudioEnergy(value) {
        // MANDALA RESTORATION: Audio Pulse
        // Value is usually 0 to 1
        const intensity = Math.max(0, value);
        // Smoothly target visual scale bump
        // We'll update a target and lerp in update(), or just set here if consistent
        // Let's set a target property for smoothness
        this.targetAudioScale = 1.0 + (intensity * 0.15); // Subtle beat pulse
    }

    triggerPulse(intensity = 1) {
        // MANDALA RESTORATION: Nav Pulse
        // Flash scale up significantly then settle
        const boost = 1.0 + (intensity * 0.3);
        gsap.to(this, {
            pulseScale: boost,
            duration: 0.1,
            yoyo: true,
            repeat: 1,
            onComplete: () => {
                gsap.to(this, { pulseScale: 1.0, duration: 0.5, ease: "elastic.out(1, 0.5)" });
            }
        });
    }

    update() {
        const elapsedTime = this.clock.getElapsedTime();

        if (this.model) {
            // 1. Idle Rotation + Mouse Parallax
            this.model.rotation.y += 0.0005; // Base slow spin

            // Smoothly look at mouse
            const targetX = this.mouse.y * 0.1; // Pitch
            const targetY = this.mouse.x * 0.1; // Yaw

            this.model.rotation.x += (targetX - this.model.rotation.x) * 0.05;
            this.model.rotation.y += (targetY - (this.model.rotation.y % (Math.PI * 2))) * 0.05; // Simplified logic, might just add offset

            // Better Parallax: Just add offset to specific rotation axes distinct from spin
            // this.model.rotation.x = THREE.MathUtils.lerp(this.model.rotation.x, this.mouse.y * 0.2, 0.05);

            // 2. Scale Handling (Audio + Pulse)
            if (this.targetAudioScale) {
                this.audioScale += (this.targetAudioScale - this.audioScale) * 0.1;
            } else {
                this.audioScale = 1.0;
            }

            // Apply Combined Scale (only if visible to save perf)
            if (this.model.visible) {
                const totalScale = this.baseScale * this.audioScale * this.pulseScale;
                this.model.scale.setScalar(totalScale);
            }
        }
    }

    dispose() {
        console.log('Earth System: Disposing...');
        if (this.model) {
            this.model.traverse(node => {
                if (node.isMesh) {
                    if (node.geometry) node.geometry.dispose();
                    if (node.material) {
                        if (Array.isArray(node.material)) {
                            node.material.forEach(mat => {
                                if (mat.map) mat.map.dispose();
                                mat.dispose();
                            });
                        } else {
                            if (node.material.map) node.material.map.dispose();
                            node.material.dispose();
                        }
                    }
                }
            });
            this.gl.scene.remove(this.model);
        }
        if (this.dracoLoader) this.dracoLoader.dispose();
    }
}
