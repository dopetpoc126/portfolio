import * as THREE from 'three';
import { cloneCachedScene, createModelUrl } from './modelCache.js';
const { clamp, lerp } = THREE.MathUtils;
const CITY_MODEL_URL = createModelUrl('scene-small.glb');

export default class City {
    constructor(glManager) {
        this.gl = glManager;
        this.isMobile = window.innerWidth < 1025;
        // Massive scale increase based on debug raw size (4 units high -> 100 units high)
        this.baseY = this.isMobile ? -40 : -50;
        this.modelScale = this.isMobile ? 3.75 : 15.0; // Reduced by 25% for mobile
        this.cityMaterials = [];
        this.model = null;
        this.modelReady = false;
        this.clock = new THREE.Clock();

        // Model references for visibility control
        // this.stallModels = []; // Removed

        this.group = new THREE.Group();
        // Center the city in the camera's flight path (Camera goes 40 -> -100)
        this.group.position.set(0, this.baseY, -50);
        this.group.rotation.y = Math.PI / 6;
        this.gl.scene.add(this.group);

        this.disposed = false;
        this.jets = [];
        this.jetsInitialized = false;
        // this.initLights(); // Removing lights per user request
        this.loadCityModel();
    }

    // initLights() removed per user request

    initJets() {
        if (this.jetsInitialized || this.disposed) return;
        this.jetsInitialized = true;

        import('./FighterJet.js').then(({ default: FighterJet }) => {
            const createJet = (direction) => { // direction: 1 (Left->Right), -1 (Right->Left)
                const jet = new FighterJet();
                const jetGroup = jet.group;

                // Mobile: smaller jets
                const jetScale = this.isMobile ? 0.6 : 1.2;
                jetGroup.scale.set(jetScale, jetScale, jetScale);

                // Position jets - Adjusted for City height (City base is -50, top is approx -10)
                // We want them to fly OVER the city, so Y around 0 to 20
                const xStart = direction === 1 ? -100 : 100;
                const baseY = 10;
                jetGroup.position.set(
                    xStart - (Math.random() * 40 * direction),
                    baseY + Math.random() * 10,
                    -30 - Math.random() * 40
                );

                if (direction === 1) {
                    jetGroup.rotation.y = Math.PI / 2; // Face Right (+X)
                } else {
                    jetGroup.rotation.y = -Math.PI / 2; // Face Left (-X)
                }

                jetGroup.rotation.z = (Math.random() - 0.5) * 0.2; // Bank angle
                jetGroup.rotation.x = (Math.random() - 0.5) * 0.1; // Pitch

                jetGroup.userData.speed = (0.3 + Math.random() * 0.4) * direction;
                jetGroup.userData.direction = direction; // Store for update logic

                this.jets.push(jetGroup);
                this.gl.scene.add(jetGroup);
            };

            // Squad 1: Left to Right (2 jets)
            for (let i = 0; i < 2; i++) createJet(1);

            // Squad 2: Right to Left (1 jet)
            for (let i = 0; i < 1; i++) createJet(-1);
        });
    }

    scheduleJetInitialization() {
        const schedule = window.requestIdleCallback
            ? (callback) => window.requestIdleCallback(callback, { timeout: 1500 })
            : (callback) => window.setTimeout(callback, 250);

        schedule(() => this.initJets());
    }

    loadCityModel() {
        cloneCachedScene(CITY_MODEL_URL)
            .then((scene) => {
                this.model = scene;
                this.modelReady = true;
                console.log('City System: Model Loaded (scene (2).glb)');
                if (this.onLoad) this.onLoad();

                // Enhance original materials if needed, but don't force wireframe
                this.model.traverse((child) => {
                    if (child.isMesh) {
                        // Switch to MeshBasicMaterial to be visible without lights
                        const oldMat = child.material;
                        const dimmedColor = oldMat.color.clone().multiplyScalar(0.4);
                        const newMat = new THREE.MeshBasicMaterial({
                            map: oldMat.map,
                            color: dimmedColor,
                            vertexColors: oldMat.vertexColors, // Preserve vertex colors if present
                            transparent: true,
                            opacity: 0,
                            depthWrite: true,
                            side: THREE.DoubleSide // Fix for missing roads/planes
                        });

                        child.material = newMat;
                        this.cityMaterials.push(child.material);

                        // OPTIMIZATION: Freeze static matrices
                        child.matrixAutoUpdate = false;
                        child.updateMatrix();
                    }
                });

                this.model.scale.setScalar(this.modelScale);
                // Center correction based on debug: Raw center was x:-7, z:-1
                // We shift it back to 0,0,0
                this.model.position.set(7, 0, 1);
                this.model.updateMatrix();

                // Rotate to align city streets
                // this.model.rotation.y = Math.PI; // Removed per user request to flip Z perspective
                this.group.add(this.model);
                this.group.updateMatrixWorld(true);

                // --- HOTSPOT ANCHORS ---
                // We attach these to the model so they transform with it.
                // We will read their World/Global position to drive the camera.
                const HOTSPOTS = {
                    // NEW: Hotspot 1 (Archive)
                    archive: new THREE.Vector3(1.6723013126642987, 0.1317706221540833, -0.6614406808231141),
                    // NEW: Hotspot 2 (Archive -> About Path)
                    archive_about: new THREE.Vector3(2.007325153270032, 0.3520548586705044, -4.76394084012899),
                    // NEW: Hotspot 3 (About)
                    about: new THREE.Vector3(-2.5052932475437633, 0.15009010100534304, -3.9031551039205947),
                    // OLD: Keep existing Connect hotspot
                    connect: new THREE.Vector3(-3.420, 1.788, -2.774)
                };

                this.waypoints = {};

                Object.entries(HOTSPOTS).forEach(([key, pos]) => {
                    // Create invisible anchor
                    const geom = new THREE.BoxGeometry(0.1, 0.1, 0.1);
                    const mat = new THREE.MeshBasicMaterial({ color: 0xff0000, wireframe: true });
                    const anchor = new THREE.Mesh(geom, mat);

                    anchor.position.copy(pos);
                    anchor.visible = false; // Hide them, just use for transforms
                    anchor.name = `Waypoint_${key}`;

                    this.model.add(anchor);
                    this.waypoints[key] = anchor;
                });

                // No longer loading separate stalls or survivor as they are baked into scene (2).glb

                this.modelReady = true;
                this.scheduleJetInitialization();
            })
            .catch((error) => {
                console.warn('City model failed to load', error);
            });
    }

    getWaypoint(name) {
        if (!this.waypoints || !this.waypoints[name]) return null;
        const target = new THREE.Vector3();
        this.waypoints[name].getWorldPosition(target);
        return target;
    }

    setScrollProgress(progress) {
        const clamped = clamp(progress, 0, 1);

        // Faster appearance: Finish by 20% scroll so it's fully solid for the Work section
        const appearance = clamp((clamped - 0.05) / 0.15, 0, 1);

        // Keep position static so we fly THROUGH it
        // Camera moves 40 -> -100. City is at -50.
        // We will pass through the center of the city.
        this.group.position.y = this.baseY;
        this.group.position.z = -50;

        if (this.modelReady && this.model) {
            // Fade in textures
            const opacity = lerp(0, 1, appearance);
            this.cityMaterials.forEach(material => {
                material.opacity = opacity;
                // Force solid rendering when fully reached to prevent "ghosting" or sorting issues
                material.transparent = opacity < 1.0;
                material.depthWrite = true; // Always write depth for city
            });

            // Sync jets visibility with city appearance
            this.jets.forEach(jet => {
                jet.visible = appearance > 0.1;
            });
        }
    }

    update(progress = 0) {
        const elapsed = this.clock.getElapsedTime();
        if (this.model) {
            // No rotation for city
            // const pulse = Math.sin(elapsed * 0.6 + progress * Math.PI) * 0.03;
            // this.group.rotation.y += pulse * 0.2;
        }

        // Animate jets flying across the sky
        if (this.jets) {
            for (const jet of this.jets) {
                const speed = jet.userData.speed || 0.4;
                const direction = jet.userData.direction || 1;

                jet.position.x += speed;

                // Bounds check based on direction
                if (direction === 1 && jet.position.x > 150) {
                    jet.position.x = -150 - Math.random() * 50;
                    jet.position.y = 10 + Math.random() * 12;
                    jet.position.z = -30 - Math.random() * 60;
                } else if (direction === -1 && jet.position.x < -150) {
                    jet.position.x = 150 + Math.random() * 50;
                    jet.position.y = 10 + Math.random() * 12;
                    jet.position.z = -30 - Math.random() * 60;
                }
            }
        }
    }

    dispose() {
        this.disposed = true;
        console.log('City System: Disposing...');
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
            this.group.remove(this.model);
        }
    }
}
