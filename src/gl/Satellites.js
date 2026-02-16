import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';

export default class Satellites {
    constructor(glManager) {
        this.gl = glManager;
        this.satellites = [];
        this.loader = new GLTFLoader();

        // DRACO Configuration
        this.dracoLoader = new DRACOLoader();
        this.dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
        this.loader.setDRACOLoader(this.dracoLoader);

        this.time = 0;
        this.init();
    }

    init() {
        const isMobile = window.innerWidth < 768;

        // Camera at Z=40, objects need lower Z to be visible
        // Halo radius is ~10, so satellites start at 45+ to stay well outside
        const baseRadius = 50;

        // Fleet of satellite.glb - spread far apart, well outside halo
        const satelliteConfigs = [
            { orbitRadius: baseRadius, orbitSpeed: 0.005, orbitOffset: 0, zOffset: -5, scale: 0.45 },
            { orbitRadius: baseRadius + 15, orbitSpeed: 0.004, orbitOffset: Math.PI * 0.33, zOffset: -10, scale: 0.5 },
            { orbitRadius: baseRadius + 8, orbitSpeed: 0.006, orbitOffset: Math.PI * 0.66, zOffset: 0, scale: 0.4 },
            { orbitRadius: baseRadius + 25, orbitSpeed: 0.003, orbitOffset: Math.PI, zOffset: -8, scale: 0.55 },
            { orbitRadius: baseRadius + 5, orbitSpeed: 0.0055, orbitOffset: Math.PI * 1.33, zOffset: 5, scale: 0.42 },
            { orbitRadius: baseRadius + 20, orbitSpeed: 0.0045, orbitOffset: Math.PI * 1.66, zOffset: -3, scale: 0.48 },
            { orbitRadius: baseRadius + 30, orbitSpeed: 0.0025, orbitOffset: Math.PI * 0.5, zOffset: 8, scale: 0.35 },
            { orbitRadius: baseRadius + 12, orbitSpeed: 0.005, orbitOffset: Math.PI * 1.16, zOffset: -12, scale: 0.52 },
        ].map(c => ({
            ...c,
            path: import.meta.env.BASE_URL + 'satellite.glb',
            scale: isMobile ? c.scale * 0.6 : c.scale
        }));

        // Wireframe material
        const wireframeMat = new THREE.MeshBasicMaterial({
            color: 0x888888,
            wireframe: true,
            transparent: true,
            opacity: 0.5
        });

        satelliteConfigs.forEach((config, index) => {
            this.loader.load(
                config.path,
                (gltf) => {
                    const model = gltf.scene;

                    model.traverse((child) => {
                        if (child.isMesh) {
                            child.material = wireframeMat.clone();
                        }
                    });

                    model.scale.set(config.scale, config.scale, config.scale);

                    const orbitGroup = new THREE.Group();
                    orbitGroup.add(model);

                    orbitGroup.userData = {
                        orbitRadius: config.orbitRadius,
                        orbitSpeed: config.orbitSpeed,
                        orbitOffset: config.orbitOffset,
                        zOffset: config.zOffset,
                        spinSpeed: 0.15 + Math.random() * 0.2
                    };

                    orbitGroup.traverse((obj) => {
                        if (obj.isMesh) {
                            obj.renderOrder = 1;
                        }
                    });

                    this.satellites.push({ group: orbitGroup, model });
                    this.gl.scene.add(orbitGroup);

                    console.log(`Satellite ${index + 1} loaded`);
                },
                undefined,
                (error) => {
                    console.error(`Error loading satellite ${index + 1}:`, error);
                }
            );
        });
    }

    setScrollProgress(progress) {
        // Hide satellites once user scrolls past 10%
        const visible = progress < 0.1;
        this.satellites.forEach(({ group }) => {
            group.visible = visible;
        });
    }

    update() {
        this.time += 0.016;

        this.satellites.forEach(({ group, model }) => {
            const { orbitRadius, orbitSpeed, orbitOffset, zOffset, spinSpeed } = group.userData;

            const angle = this.time * orbitSpeed + orbitOffset;

            // Simple circular orbit in XY plane
            group.position.x = Math.cos(angle) * orbitRadius;
            group.position.y = Math.sin(angle) * orbitRadius * 0.3; // Elliptical
            group.position.z = zOffset;

            if (model) {
                model.rotation.y += spinSpeed * 0.01;
                model.rotation.x += spinSpeed * 0.005;
            }
        });
    }

    dispose() {
        console.log('Satellites: Disposing...');
        this.satellites.forEach(({ group }) => {
            group.traverse(node => {
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
            if (this.gl && this.gl.scene) {
                this.gl.scene.remove(group);
            }
        });
        if (this.dracoLoader) this.dracoLoader.dispose();
    }
}
