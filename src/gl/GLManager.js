import * as THREE from 'three';

import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass';

export default class GLManager {
    constructor(canvas) {
        this.canvas = canvas;
        this.width = window.innerWidth;
        this.height = window.innerHeight;

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color('#050505'); // Deep Space Black

        this.camera = new THREE.PerspectiveCamera(75, this.width / this.height, 0.1, 1000);
        this.camera.position.z = 40;

        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: false,
            powerPreference: 'high-performance',
            alpha: true
        });

        this.renderer.setSize(this.width, this.height);
        const pixelRatio = window.devicePixelRatio || 1;
        const isMobile = window.innerWidth < 1025;
        this.isMobile = isMobile;
        this.renderer.setPixelRatio(isMobile ? Math.min(pixelRatio, 1.2) : Math.min(pixelRatio, 2));

        this.updates = [];

        this.initPost();
        this.addEventListeners();
        this.onResize();
        this.render();
    }

    initPost() {
        this.composer = new EffectComposer(this.renderer);
        this.composer.addPass(new RenderPass(this.scene, this.camera));

        // Bloom removed per user request
    }

    addEventListeners() {
        window.addEventListener('resize', this.onResize.bind(this));
    }

    onResize() {
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this.camera.aspect = this.width / this.height;

        // Precise FOV sweet spot for mobile portrait screens (caps max vertical FOV at ~81.5 deg)
        const baseFOV = 75;
        if (this.camera.aspect < 1.0) {
            const factor = Math.pow(1.0 - Math.max(this.camera.aspect, 0.35), 1.2) * 12.0;
            this.camera.fov = Math.min(baseFOV + factor, 81.5);
        } else {
            this.camera.fov = baseFOV;
        }

        this.camera.updateProjectionMatrix();
        this.renderer.setSize(this.width, this.height);
        this.composer.setSize(this.width, this.height);
    }

    compile(scene, camera) {
        this.renderer.compile(scene, camera);
    }

    forceRender() {
        this.updates.forEach(update => update());
        this.composer.render();
    }

    render() {
        this.updates.forEach(update => update());

        // this.renderer.render(this.scene, this.camera);
        this.composer.render();
        requestAnimationFrame(this.render.bind(this));
    }
}
