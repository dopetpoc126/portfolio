import * as THREE from 'three';

import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass';

export default class GLManager {
    constructor(canvas) {
        this.canvas = canvas;
        this.width = window.innerWidth;
        this.height = window.innerHeight;

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color('#050505');

        this.camera = new THREE.PerspectiveCamera(75, this.width / this.height, 0.1, 1000);
        this.camera.position.z = 40;

        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: false, // Post-processing handles AA usually, or we disable for perf
            powerPreference: 'high-performance',
            alpha: true // PRD Requirement
        });

        this.renderer.setSize(this.width, this.height);
        const pixelRatio = Math.min(window.devicePixelRatio, 2);
        // EMERGENCY: Cap pixel ratio to 1.0 on Mobile/Tablet to prevent OOM Crashes
        const isMobile = window.innerWidth < 1025;
        this.isMobile = isMobile;
        this.renderer.setPixelRatio(isMobile ? 1.0 : pixelRatio);

        this.updates = []; // Array of update functions

        this.initPost();
        this.addEventListeners();
        this.onResize(); // Set initial FOV for mobile
        this.render();
    }

    initPost() {
        this.composer = new EffectComposer(this.renderer);
        this.composer.addPass(new RenderPass(this.scene, this.camera));

        const isMobile = window.innerWidth < 1025;

        // EMERGENCY: Disable Bloom on Mobile to save memory
        if (!isMobile) {
            const bloomPass = new UnrealBloomPass(
                new THREE.Vector2(this.width, this.height),
                1.5,  // strength (restored to original high quality for desktop)
                0.4,  // radius
                0.85  // threshold
            );
            this.composer.addPass(bloomPass);
        }
    }

    addEventListeners() {
        window.addEventListener('resize', this.onResize.bind(this));
    }

    onResize() {
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this.camera.aspect = this.width / this.height;

        // Adjust FOV for mobile to match desktop POV
        // On desktop (landscape), aspect > 1 → use base FOV 75
        // On mobile (portrait), aspect < 1 → increase FOV to show more of the scene
        const baseFOV = 75;
        if (this.camera.aspect < 1) {
            // Scale FOV inversely with aspect ratio to preserve horizontal coverage
            this.camera.fov = baseFOV / this.camera.aspect;
            // Cap it so it doesn't go too extreme
            this.camera.fov = Math.min(this.camera.fov, 120);
        } else {
            this.camera.fov = baseFOV;
        }

        this.camera.updateProjectionMatrix();
        this.renderer.setSize(this.width, this.height);
        this.composer.setSize(this.width, this.height);
    }

    render() {
        // Run all registered updates
        this.updates.forEach(update => update());

        // this.renderer.render(this.scene, this.camera);
        this.composer.render();
        requestAnimationFrame(this.render.bind(this));
    }
}
