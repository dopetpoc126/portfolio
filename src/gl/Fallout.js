import * as THREE from 'three';

export default class Fallout {
    constructor(glManager) {
        this.gl = glManager;
        this.count = 6000; // Increased from 2000
        this.time = 0;
        this.init();
    }

    init() {
        // PRD 5.2 equivalent for "Fallout" / Debris
        // 30% - 60%
        // Floating debris (ash/stars)

        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(this.count * 3);
        const sizes = new Float32Array(this.count);

        for (let i = 0; i < this.count; i++) {
            const i3 = i * 3;
            // Scatter widely in X/Y, and along Z for the flythrough
            // Zone 30-60% implies a Z depth range.
            // Let's spread them from Z=10 to Z=-60

            positions[i3] = (Math.random() - 0.5) * 100; // Wide X
            positions[i3 + 1] = (Math.random() - 0.5) * 100; // Wide Y
            // Move debris behind Earth (Earth is at -25) to prevent "stars on top" effect
            positions[i3 + 2] = -30 - Math.random() * 80;

            sizes[i] = Math.random();
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1)); // We can reuse the shader logic if we want, or simple points

        // We can use a simple PointsMaterial or the custom shader if we want bloom/fading
        // For debris/ash, simple PointsMaterial is efficient.
        const material = new THREE.PointsMaterial({
            size: 0.1,
            color: 0xffffff,
            transparent: true,
            opacity: 0.8,
            sizeAttenuation: true
        });

        this.mesh = new THREE.Points(geometry, material);
        this.gl.scene.add(this.mesh);

        // Add a secondary system for "Stars" in the background with twinkling
        const starGeo = new THREE.BufferGeometry();
        const starCount = 3000;
        const starPos = new Float32Array(starCount * 3);
        const starSizes = new Float32Array(starCount);
        const twinklePhases = new Float32Array(starCount); // Random phase for each star
        const twinkleSpeeds = new Float32Array(starCount); // Random speed for each star

        for (let j = 0; j < starCount; j++) {
            const j3 = j * 3;
            starPos[j3] = (Math.random() - 0.5) * 300;
            starPos[j3 + 1] = (Math.random() - 0.5) * 300;
            starPos[j3 + 2] = -50 - Math.random() * 100; // Far background
            starSizes[j] = 0.08 + Math.random() * 0.15; // Base size
            twinklePhases[j] = Math.random() * Math.PI * 2; // Random phase
            twinkleSpeeds[j] = 0.5 + Math.random() * 2; // Random speed
        }

        starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
        starGeo.setAttribute('size', new THREE.BufferAttribute(starSizes, 1));

        this.twinklePhases = twinklePhases;
        this.twinkleSpeeds = twinkleSpeeds;
        this.baseSizes = starSizes.slice(); // Copy for reference
        this.starSizes = starSizes;
        this.starCount = starCount;

        const starMat = new THREE.PointsMaterial({
            size: 0.15,
            color: 0xffffff,
            transparent: true,
            opacity: 0.9,
            sizeAttenuation: false
        });
        this.stars = new THREE.Points(starGeo, starMat);
        this.starGeometry = starGeo;
        this.gl.scene.add(this.stars);
    }

    update() {
        this.time += 0.016;

        // Twinkling star effect
        if (this.starGeometry && this.twinklePhases) {
            const sizeAttr = this.starGeometry.attributes.size;

            for (let i = 0; i < this.starCount; i++) {
                // Calculate twinkle brightness using sine wave
                const phase = this.twinklePhases[i];
                const speed = this.twinkleSpeeds[i];
                const twinkle = 0.5 + 0.5 * Math.sin(this.time * speed + phase);

                // Apply size variation (0.3 to 1.0 of base size)
                sizeAttr.array[i] = this.baseSizes[i] * (0.3 + twinkle * 0.7);
            }

            sizeAttr.needsUpdate = true;
        }
    }
}
