import * as THREE from 'three';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';
import fontJson from 'three/examples/fonts/helvetiker_bold.typeface.json';
import { DestructibleMesh, FractureOptions } from '@dgreenheck/three-pinata';

export default class HeroText {
    constructor(glManager) {
        this.gl = glManager;
        this.group = new THREE.Group();
        this.gl.scene.add(this.group);

        this.meshes = [];
        this.fragments = [];
        this.fractured = false;

        this.init();
    }

    init() {
        // Hide HTML text so 3D text takes over seamlessly
        const heroContent = document.querySelector('.hero-content');
        if (heroContent) {
            heroContent.style.opacity = '0';
            heroContent.style.pointerEvents = 'none';
        }

        const loader = new FontLoader();
        const font = loader.parse(fontJson);

        const outerMaterial = new THREE.MeshStandardMaterial({
            color: 0xf8f8f8,
            metalness: 0.85,
            roughness: 0.15,
            side: THREE.DoubleSide
        });

        const innerMaterial = new THREE.MeshStandardMaterial({
            color: 0xff4d00,
            emissive: 0xff4d00,
            emissiveIntensity: 2.5,
            roughness: 0.4,
            side: THREE.DoubleSide
        });

        // Helper to create and position destructible text
        const createText = (text, yOffset, size = 1.8) => {
            const geometry = new TextGeometry(text, {
                font: font,
                size: size,
                depth: 0.35,
                curveSegments: 6,
                bevelEnabled: true,
                bevelThickness: 0.04,
                bevelSize: 0.04,
                bevelSegments: 2
            });

            geometry.center();

            const mesh = new DestructibleMesh(geometry, outerMaterial, innerMaterial);
            mesh.position.set(0, yOffset, 34);
            this.group.add(mesh);
            this.meshes.push(mesh);
        };

        createText("Hello, I'm", 2.2, 1.5);
        createText("Shriyan", -0.2, 2.1);

        // Add local lighting to make text pop
        const textLight = new THREE.DirectionalLight(0xffffff, 3.5);
        textLight.position.set(0, 5, 38);
        this.group.add(textLight);
    }

    reset() {
        if (!this.fractured) return;
        this.fractured = false;

        this.fragments.forEach(frag => {
            if (frag.geometry) frag.geometry.dispose();
            this.group.remove(frag);
        });
        this.fragments = [];

        this.meshes.forEach(mesh => {
            mesh.visible = true;
        });
    }

    fracture() {
        if (this.fractured) return;
        this.fractured = true;

        console.log('HeroText: SMASH!');

        this.meshes.forEach(mesh => {
            // Optimized 2.5D Voronoi mode for fast planar mesh fracturing
            const options = new FractureOptions({
                fractureMethod: 'voronoi',
                fragmentCount: 12,
                voronoiOptions: {
                    mode: '2.5D',
                    projectionAxis: 'z'
                }
            });

            mesh.fracture(options, (fragment) => {
                this.group.add(fragment);
                this.fragments.push(fragment);

                // Calculate outward velocity from center
                const pos = fragment.position.clone();
                // Push outwards from center (0,1,34)
                pos.y -= 1.0;
                pos.z -= 34;

                const speed = Math.random() * 12 + 8;
                const velocity = pos.normalize().multiplyScalar(speed);
                // Push towards Earth (-Z) so camera flies cleanly through the dispersing cloud
                velocity.z = -Math.random() * 15 - 5;

                fragment.userData = {
                    velocity: velocity,
                    spin: new THREE.Vector3(
                        (Math.random() - 0.5) * 8,
                        (Math.random() - 0.5) * 8,
                        (Math.random() - 0.5) * 8
                    )
                };
            });

            mesh.visible = false;
        });
    }

    update(scrollPct, velocity, isWarmup = false, canFracture = false) {
        if (isWarmup) return;

        // Trigger smash when scroll starts moving camera forward and intro is fully complete
        if (canFracture && scrollPct > 0.02 && !this.fractured) {
            this.fracture();
        } else if (scrollPct < 0.01 && this.fractured) {
            this.reset();
        }

        if (this.fractured && this.fragments.length > 0) {
            const dt = 0.016; // Approximate delta time
            this.fragments.forEach(fragment => {
                if (!fragment.userData) return;
                fragment.position.addScaledVector(fragment.userData.velocity, dt);
                fragment.rotation.x += fragment.userData.spin.x * dt;
                fragment.rotation.y += fragment.userData.spin.y * dt;
                fragment.rotation.z += fragment.userData.spin.z * dt;

                // Slow down fragments over time (drag)
                fragment.userData.velocity.multiplyScalar(0.96);
                fragment.userData.spin.multiplyScalar(0.96);
            });
        }
    }
}
