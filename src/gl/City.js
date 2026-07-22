import * as THREE from 'three';
import { cloneCachedScene, createModelUrl } from './modelCache.js';
const { clamp } = THREE.MathUtils;

const CITY_MODEL_URL = createModelUrl('loft2_free_interior-optimized.glb');
const TRAIN_MODEL_URL = createModelUrl('sci-fi_train-optimized.glb');
const F1_MODEL_URL = createModelUrl('2011_redbull_rb7-optimized.glb');
const TYRES_MODEL_URL = createModelUrl('f1_tyres_pack_2022_-_hard_-_medium_-_soft-optimized.glb');
const COMPUTER_MODEL_URL = createModelUrl('computer_1-optimized.glb');
const CARRIER_MODEL_URL = createModelUrl('charles_de_gaulle_french_aircraft_carrier-optimized.glb');

const PORTAL_VERTEX_SHADER = `
    varying vec2 vUv;
    void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;

const PORTAL_FRAGMENT_SHADER = `
    uniform float uTime;
    uniform float uOpacity;
    varying vec2 vUv;

    // ── Pseudo-random hash ──
    float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }

    // ── 2D value noise ──
    float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
            mix(hash(i), hash(i + vec2(1,0)), f.x),
            mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x),
            f.y
        );
    }

    void main() {
        vec2 uv = vUv - vec2(0.5);

        // ── Square border vignette ──
        float edgeX = smoothstep(0.5, 0.42, abs(uv.x));
        float edgeY = smoothstep(0.5, 0.42, abs(uv.y));
        float borderMask = edgeX * edgeY;

        float dist  = length(uv);
        float angle = atan(uv.y, uv.x);

        // ── Layer 1: deep swirl (slow, large scale) ──
        float swirl1 = sin(dist * 8.0 - uTime * 1.2 + angle * 3.0);

        // ── Layer 2: counter-rotating tight ripple ──
        float swirl2 = sin(dist * 18.0 + uTime * 2.0 - angle * 5.0) * 0.5;

        // ── Layer 3: value-noise turbulence ──
        vec2 noiseCoord = uv * 4.0 + vec2(uTime * 0.18, uTime * 0.12);
        float turb = noise(noiseCoord) * 2.0 - 1.0;

        // ── Layer 4: energy pulse rings radiating outward ──
        float pulse = sin(dist * 22.0 - uTime * 3.5) * 0.35;
        pulse *= smoothstep(0.5, 0.0, dist); // fade toward edges

        // ── Combine all layers ──
        float mixFactor = clamp(
            swirl1 * 0.35 + swirl2 * 0.2 + turb * 0.25 + pulse + 0.45,
            0.0, 1.0
        );

        // ── Base palette: near-black → electric violet ──
        vec3 colorBlack  = vec3(0.01, 0.005, 0.025);
        vec3 colorPurple = vec3(0.42, 0.02, 0.88);
        vec3 colorBlue   = vec3(0.05, 0.02, 0.55);  // deep indigo undertone

        vec3 portalColor = mix(colorBlack, mix(colorBlue, colorPurple, mixFactor), mixFactor);

        // ── Breathing core glow (slow sine) ──
        float breathe = 0.5 + 0.5 * sin(uTime * 0.9);
        float core = clamp(1.0 - dist * 2.8, 0.0, 1.0);
        core = pow(core, 1.6);
        portalColor += vec3(0.8, 0.15, 1.0) * core * (0.4 + breathe * 0.25);

        // ── Chromatic fringe at the rim ──
        float rim = smoothstep(0.3, 0.48, dist);
        portalColor += vec3(0.2, 0.0, 0.6) * rim * 0.3;

        // ── Edge energy arc flicker ──
        float arc = sin(angle * 6.0 + uTime * 4.0) * 0.5 + 0.5;
        arc *= smoothstep(0.35, 0.48, dist) * smoothstep(0.5, 0.44, dist);
        portalColor += vec3(0.6, 0.1, 1.0) * arc * 0.4;

        gl_FragColor = vec4(portalColor * borderMask, uOpacity * borderMask);
    }
`;

export default class City {
    constructor(glManager) {
        this.gl = glManager;
        this.isMobile = window.innerWidth < 1025;
        this.baseY = 0; // Set to camera eye-level
        this.modelScale = 1.0; // Updated for loft interior room native scale
        this.cityMaterials = [];
        this.model = null;
        this.modelReady = false;
        this.clock = new THREE.Clock();

        this.trainModel = null;
        this.trainMaterials = [];
        this.trainReady = false;

        this.rescueJet = null;
        this.rescueJetMat = null;
        this.rescueJetReady = false;

        this.carrierModel = null;
        this.carrierMaterials = [];
        this.carrierReady = false;

        this.hologramGroup = null;
        this.hologramBeam = null;
        this.hologramParticles = null;
        this.hologramRing = null;

        this.group = new THREE.Group();
        // Position the environment group relative to camera dive path
        this.group.position.set(0, this.baseY, -25);
        this.gl.scene.add(this.group);

        this.disposed = false;
        this.jets = [];
        this.jetsInitialized = false;

        this.initLights();
        this.loadCityModel();
        this.loadTrainModel();
        this.loadCarrierModel();
    }

    initLights() {
        // Soft ambient and directional lights for clean room lighting
        const hemiLight = new THREE.HemisphereLight(0xffffff, 0x1e293b, 1.8);
        this.group.add(hemiLight);

        const dirLight = new THREE.DirectionalLight(0xffffff, 2.5);
        dirLight.position.set(80, 120, -50);
        this.group.add(dirLight);

        const fillLight = new THREE.DirectionalLight(0xf1f5f9, 1.2);
        fillLight.position.set(-80, 40, 80);
        this.group.add(fillLight);
    }

    loadCityModel() {
        cloneCachedScene(CITY_MODEL_URL)
            .then((scene) => {
                this.model = scene;
                this.modelReady = true;
                console.log('Loft System: Model Loaded (loft2_free_interior-optimized.glb)');
                if (this.onLoad) this.onLoad();

                // Prepare materials for scroll-linked cross-fade opacity
                this.model.traverse((child) => {
                    if (child.isMesh) {
                        child.material.transparent = true;
                        child.material.opacity = 0;
                        child.material.depthWrite = true;
                        child.material.side = THREE.FrontSide; // Cull outer backfaces from the outside

                        if (child.geometry.attributes.color) {
                            child.material.vertexColors = true;
                        }
                        this.cityMaterials.push(child.material);

                        child.matrixAutoUpdate = false;
                        child.updateMatrix();
                    }
                });

                this.model.scale.setScalar(this.modelScale);
                this.model.position.set(0, 0, 0); // Center origin
                this.model.updateMatrix();

                this.group.add(this.model);
                this.group.updateMatrixWorld(true);

                // --- CRASH LANDING HOTSPOT ---
                // Map the camera waypoints to the exact crash landing coordinate inside the loft (restored to spacious 3.15 value)
                const landingSpot = new THREE.Vector3(3.1495619612478967, 2.5, 0.4868419314185841);
                const HOTSPOTS = {
                    archive: landingSpot,
                    p1: landingSpot,
                    p2: landingSpot,
                    p3: landingSpot,
                    p4: landingSpot,
                    p5: landingSpot,
                    p6: landingSpot,
                    p7: landingSpot,
                    p8: landingSpot,
                    about: landingSpot,
                    about_connect_p1: landingSpot,
                    about_connect_p2: landingSpot,
                    about_connect_p3: landingSpot,
                    about_connect_p4: landingSpot,
                    about_connect_p5: landingSpot,
                    connect: landingSpot
                };

                this.waypoints = {};

                Object.entries(HOTSPOTS).forEach(([key, pos]) => {
                    // Create invisible helper anchor
                    const geom = new THREE.BoxGeometry(0.1, 0.1, 0.1);
                    const mat = new THREE.MeshBasicMaterial({ color: 0xff0000, wireframe: true });
                    const anchor = new THREE.Mesh(geom, mat);

                    anchor.position.copy(pos);
                    anchor.visible = false;
                    anchor.name = `Waypoint_${key}`;

                    this.model.add(anchor);
                    this.waypoints[key] = anchor;
                });

                // Create the Futuristic Portal inside the room (Square Purple-Black)
                this.createPortal();

                // Create Wall Extension to mask the left hollow space using 3D walnut slats (Trimmed to Z = -1.5)
                this.createWallExtension();

                // Create Hologram emerging upwards from coffee table
                this.createHologram();

                // Create volumetric sun ray shafts coming through the windows
                this.createSunRays();
            })
            .catch((error) => {
                console.warn('Loft model failed to load:', error);
            });
    }

    loadTrainModel() {
        cloneCachedScene(TRAIN_MODEL_URL)
            .then((scene) => {
                this.trainModel = scene;
                this.trainReady = true;
                console.log('Loft System: Train Model Loaded (sci-fi_train-optimized.glb)');

                this.trainModel.traverse((child) => {
                    if (child.isMesh) {
                        child.frustumCulled = false; // Prevent culling when F1 car moves outside
                        child.material.transparent = true;
                        child.material.opacity = 0; // Starts invisible
                        child.material.depthWrite = true;
                        if (child.geometry.attributes.color) {
                            child.material.vertexColors = true;
                        }
                        this.trainMaterials.push(child.material);
                        child.matrixAutoUpdate = false;
                        child.updateMatrix();
                    }
                });

                // Position train scene inside portal (facing along negative X)
                // Train portal entrance is at local (9.49999988079071, 1.3583739129027417, -0.015480863694178476)
                // Room portal center is at (-2.21, 2.8740861808376628, 0.823518420500778)
                // Aligning them:
                const trainX = -2.21 - 9.49999988079071;
                const trainY = 2.8740861808376628 - 1.3583739129027417;
                const trainZ = 0.823518420500778 - (-0.015480863694178476);

                this.trainModel.position.set(trainX, trainY, trainZ);
                // No rotation needed: train runs parallel to X-axis by default
                this.trainModel.rotation.y = 0;
                this.trainModel.scale.setScalar(1.0);
                this.trainModel.updateMatrix();

                this.group.add(this.trainModel);
                this.group.updateMatrixWorld(true);

                // ── Tunnel exit portal — same shader as room portal ──
                this._createTunnelPortal();

                // Load F1 car at the hotspot position in train-local space
                // Hotspot from model-viewer: (7.9, -0.034, 0.113)
                this._loadF1Car();

                // Load tyre rack at its hotspot
                this._loadTyreRack();

                // Load computer below the tyre rack
                this._loadComputer();

                // Load rescue jet
                this._loadRescueJet();
            })
            .catch((error) => {
                console.warn('Train model failed to load:', error);
            });
    }

    _createTunnelPortal() {
        // Place a portal at the far end of the train corridor.
        // Train entrance is at local X=9.5, corridor runs in -X direction.
        // Portal sits at X=-18 (well beyond the camera park point at X≈-1.86).
        // The corridor midline is at Z≈0, Y≈1.36 (train floor height at entrance).
        // Portal faces +X (toward camera) so normal = +X → rotation.y = 0 (plane default faces +Z, rotate -PI/2)
        const portalGroup = new THREE.Group();
        this.tunnelPortalGroup = portalGroup;

        // Frame
        const size = 1.8;
        const thickness = 0.05;
        const frameMat = new THREE.MeshStandardMaterial({
            color: 0x111111, roughness: 0.15, metalness: 0.9,
            emissive: 0xaa00ff, emissiveIntensity: 0.4,
            transparent: true, opacity: 0
        });
        this.tunnelPortalFrameMat = frameMat;

        const horizGeom = new THREE.BoxGeometry(thickness, thickness, size);
        const vertGeom = new THREE.BoxGeometry(thickness, size - thickness * 2, thickness);

        [[0, size / 2 - thickness / 2, 0], [0, -size / 2 + thickness / 2, 0]].forEach(([x, y, z]) => {
            const m = new THREE.Mesh(horizGeom, frameMat); m.position.set(x, y, z); portalGroup.add(m);
        });
        [[0, 0, size / 2 - thickness / 2], [0, 0, -size / 2 + thickness / 2]].forEach(([x, y, z]) => {
            const m = new THREE.Mesh(vertGeom, frameMat); m.position.set(x, y, z); portalGroup.add(m);
        });

        // Vortex disc — same shader as room portal
        const discGeom = new THREE.PlaneGeometry(size - thickness * 0.5, size - thickness * 0.5);
        this.tunnelPortalShaderMat = new THREE.ShaderMaterial({
            vertexShader: PORTAL_VERTEX_SHADER,
            fragmentShader: PORTAL_FRAGMENT_SHADER,
            uniforms: { uTime: { value: 0 }, uOpacity: { value: 0 } },
            transparent: true, side: THREE.DoubleSide, depthWrite: true
        });
        const disc = new THREE.Mesh(discGeom, this.tunnelPortalShaderMat);
        disc.rotation.y = Math.PI / 2; // face +X toward camera
        disc.position.x = 0.005; // Shift 5mm forward relative to frame to prevent Z-fighting with frame
        portalGroup.add(disc);

        // Position: X=-9.48 in train-local (shifted 2cm forward from back wall to prevent Z-fighting)
        // Y = 1.3327245588922094 (center of the doorway)
        // Z = -0.008450158118888254
        portalGroup.position.set(-9.48, 1.3327245588922094, -0.008450158118888254);
        this.trainModel.add(portalGroup);
        console.log('Loft System: Tunnel exit portal created');
    }

    _loadF1Car() {
        cloneCachedScene(F1_MODEL_URL)
            .then((scene) => {
                this.f1Model = scene;

                // Hotspot position in train-local space from model-viewer annotation
                const HOTSPOT = new THREE.Vector3(4.369307666888172, -0.03397580435706371, -0.15858486492682247);

                // Parent to trainModel so it inherits train's world transform automatically
                // Position is in train-local space — hotspot sits on the floor of the train
                scene.position.copy(HOTSPOT);
                scene.position.y += 0.15; // lift above floor surface

                // Face the car down the corridor (nose pointing toward camera along -X)
                scene.rotation.y = -Math.PI / 2;

                // Scale up — make it clearly visible
                scene.scale.setScalar(80.0);

                // Sync opacity with train — start invisible, revealed via trainMaterials
                this.f1Model = scene;
                this.f1Materials = [];
                scene.traverse((child) => {
                    if (child.isMesh) {
                        child.frustumCulled = false; // Prevent culling during float animation
                        // Preserve original materials, just add transparency control
                        const mats = Array.isArray(child.material)
                            ? child.material
                            : [child.material];
                        mats.forEach(mat => {
                            mat.transparent = true;
                            mat.opacity = 0;
                            mat.depthWrite = true;
                            this.f1Materials.push(mat);
                        });
                    }
                });

                this.trainModel.add(scene);
                this.group.updateMatrixWorld(true);
                console.log('Loft System: RB7 F1 car loaded at train hotspot');
            })
            .catch((err) => {
                console.warn('F1 car failed to load:', err);
            });
    }

    _loadTyreRack() {
        cloneCachedScene(TYRES_MODEL_URL)
            .then((scene) => {
                this.tyreRackModel = scene;

                // Hotspot from model-viewer: (-8.930, -0.034, -0.979) train-local
                const HOTSPOT = new THREE.Vector3(-2.346537402037091, 1.4176050362318624, -1.7224156282774317);

                scene.position.copy(HOTSPOT);

                // Normal is (0,0,1) — wall-mounted, no floor lift needed

                // Face same direction as car (along corridor)
                scene.rotation.y = Math.PI / 2;

                // Scale to fit — tyre pack should be visible but not enormous
                scene.scale.setScalar(0.9);

                // Sync opacity with train
                this.tyreRackMaterials = [];
                scene.traverse(child => {
                    if (child.isMesh) {
                        const mats = Array.isArray(child.material) ? child.material : [child.material];
                        mats.forEach(mat => {
                            mat.transparent = true;
                            mat.opacity = 0;
                            mat.depthWrite = true;
                            this.tyreRackMaterials.push(mat);
                        });
                    }
                });

                this.trainModel.add(scene);
                console.log('Loft System: Tyre rack loaded at train hotspot');
            })
            .catch(err => {
                console.warn('Tyre rack failed to load:', err);
            });
    }

    _loadComputer() {
        cloneCachedScene(COMPUTER_MODEL_URL)
            .then((scene) => {
                this.computerModel = scene;

                scene.position.set(
                    -2.378898299432837,
                    1.2276002436806266e-9,
                    -1.3186084789363335
                );
                scene.rotation.y = 2 * Math.PI;
                scene.scale.setScalar(0.007);

                // Build projects canvas texture
                const projectsTex = this._buildProjectsCanvas();

                // Restore original materials — no more texture replacement
                this.computerMaterials = [];
                scene.traverse(child => {
                    if (child.isMesh) {
                        const mats = Array.isArray(child.material) ? child.material : [child.material];
                        mats.forEach(mat => {
                            mat.transparent = true;
                            mat.opacity = 0;
                            mat.depthWrite = true;
                            this.computerMaterials.push(mat);
                        });
                    }
                });

                // Overlay plane at the screen hotspot in computer-local space
                // Hotspot: (6.636, 103.585, -16.002), normal: (0, 0, 1)
                // Screen faces +Z so plane just sits at that position facing +Z
                // The computer scale is 0.007 so we size the plane to cover the screen
                const screenPlane = new THREE.Mesh(
                    new THREE.PlaneGeometry(200, 125), // larger screen overlay
                    new THREE.MeshBasicMaterial({
                        map: projectsTex,
                        transparent: true,
                        opacity: 0,
                        depthWrite: false,
                    })
                );
                screenPlane.position.set(6.636, 130.0, -15.5);
                // normal is +Z so default PlaneGeometry (facing +Z) is correct — no rotation needed
                scene.add(screenPlane);
                this.computerScreenMesh = screenPlane;
                this.computerScreenMat = screenPlane.material;
                this.computerMaterials.push(screenPlane.material);

                this.trainModel.add(scene);
                console.log('Loft System: Computer loaded with projects screen');
            })
            .catch(err => {
                console.warn('Computer failed to load:', err);
            });
    }

    _loadRescueJet() {
        const jetUrl = createModelUrl('jet_fighter-optimized.glb');
        cloneCachedScene(jetUrl)
            .then((scene) => {
                scene.scale.setScalar(0.008);

                // Preserve original model materials — just add transparency so we can fade in/out.
                // Collect all unique materials for opacity control.
                this.rescueJetMaterials = [];
                scene.traverse((child) => {
                    child.frustumCulled = false;
                    if (child.isMesh) {
                        child.renderOrder = 10;
                        const mats = Array.isArray(child.material) ? child.material : [child.material];
                        mats.forEach(mat => {
                            if (!this.rescueJetMaterials.includes(mat)) {
                                mat.transparent = true;
                                mat.opacity = 0;
                                this.rescueJetMaterials.push(mat);
                            }
                        });
                    }
                });

                // rescueJetMat kept as a proxy — we'll drive opacity via rescueJetMaterials in updateScene.
                // Create a dummy object so existing code that checks city.rescueJetMat.opacity still works.
                const matProxy = {
                    get opacity() { return rescueJetScene._opacityValue ?? 0; },
                    set opacity(v) {
                        rescueJetScene._opacityValue = v;
                        rescueJetScene.traverse(child => {
                            if (child.isMesh) {
                                const ms = Array.isArray(child.material) ? child.material : [child.material];
                                ms.forEach(m => { m.opacity = v; });
                            }
                        });
                    }
                };
                const rescueJetScene = scene;

                // Create cockpit HUD dashboard overlay (confined to the physical display screen)
                const hudCanvas = document.createElement('canvas');
                hudCanvas.width = 1024;
                hudCanvas.height = 1024;
                const hudCtx = hudCanvas.getContext('2d');
                const hudTexture = new THREE.CanvasTexture(hudCanvas);
                hudTexture.minFilter = THREE.LinearFilter;
                hudTexture.magFilter = THREE.LinearFilter;

                // HUD combiner glass plane — positioned at the physical HUD combiner in the cockpit.
                // model-viewer hotspot: (-317.66, 302.10, -5237.49), normal approx (0, 0.35, 1)
                // Z pushed to -5228 (9 units forward) to clear the combiner geometry.
                // Sized to match combiner glass footprint.
                const hudGeo = new THREE.PlaneGeometry(90, 70);
                const hudMat = new THREE.MeshBasicMaterial({
                    map: hudTexture,
                    transparent: true,
                    opacity: 0.92,
                    side: THREE.DoubleSide,
                    depthWrite: false,
                    blending: THREE.AdditiveBlending
                });
                const hudMesh = new THREE.Mesh(hudGeo, hudMat);

                // Sit the plane flush on the combiner glass face.
                // Tilt ~30° toward pilot (combiner glass typical angle).
                hudMesh.position.set(-317.66, 302.10, -5228.0);
                hudMesh.rotation.x = -0.52; // ~30° tilt toward pilot
                hudMesh.renderOrder = 5; // render after opaque cockpit geometry

                scene.add(hudMesh);

                this.hudCanvas = hudCanvas;
                this.hudCtx = hudCtx;
                this.hudTexture = hudTexture;
                this.hudMesh = hudMesh;

                scene.rotation.y = Math.PI / 2; // default rotation
                scene.position.y = -999; // hide far below

                this.rescueJet = scene;
                this.rescueJetMat = matProxy;
                this.rescueJetReady = true;
                this.group.add(scene);

                console.log('Loft System: Rescue Jet Loaded Normally');
            })
            .catch((err) => {
                console.error('Rescue jet failed to load:', err);
            });
    }

    loadCarrierModel() {
        cloneCachedScene(CARRIER_MODEL_URL)
            .then((scene) => {
                this.carrierMaterials = [];
                scene.traverse((child) => {
                    child.frustumCulled = false;
                    if (child.isMesh) {
                        child.renderOrder = 2;
                        const mats = Array.isArray(child.material) ? child.material : [child.material];
                        mats.forEach(mat => {
                            if (!this.carrierMaterials.includes(mat)) {
                                mat.transparent = true;
                                mat.opacity = 1.0;
                                this.carrierMaterials.push(mat);
                            }
                        });
                    }
                });

                scene.rotation.y = Math.PI / 2;
                scene.scale.setScalar(0.008);
                scene.position.set(-999, -999, -999);

                this.carrierModel = scene;
                this.carrierReady = true;
                this.group.add(scene);
                console.log('Loft System: Aircraft Carrier Model Loaded (Charles De Gaulle)');
            })
            .catch((err) => {
                console.warn('Aircraft Carrier model failed to load:', err);
            });
    }

    _buildProjectsCanvas() {
        const CW = 3840;
        const CH = 2160;
        const canvas = document.createElement('canvas');
        canvas.width = CW;
        canvas.height = CH;
        const ctx = canvas.getContext('2d');

        // ── Background ──
        ctx.fillStyle = '#07060d';
        ctx.fillRect(0, 0, CW, CH);

        // Grid
        ctx.strokeStyle = 'rgba(255,160,60,0.05)';
        ctx.lineWidth = 1;
        for (let y = 0; y < CH; y += 80) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CW, y); ctx.stroke(); }
        for (let x = 0; x < CW; x += 80) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, CH); ctx.stroke(); }

        // ── Header ──
        ctx.font = 'bold 130px "JetBrains Mono", monospace';
        ctx.fillStyle = '#ffaa44';
        ctx.textAlign = 'left';
        ctx.fillText('PROJECTS', 100, 160);
        ctx.font = '52px "JetBrains Mono", monospace';
        ctx.fillStyle = 'rgba(255,170,68,0.5)';
        ctx.textAlign = 'right';
        ctx.fillText('SYS.01 // STRATEGY_BOARD', CW - 100, 160);
        ctx.strokeStyle = 'rgba(255,170,68,0.4)';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(100, 195); ctx.lineTo(CW - 100, 195); ctx.stroke();

        // ── Projects ──
        const projects = [
            {
                name: 'BEAKAN',
                type: 'Android App',
                stack: 'Kotlin · Android · Firebase',
                desc: 'Beacon-based attendance system using BLE hardware. Built for VIT Chennai. Maximizes performance on rooted devices.',
                url: 'https://github.com/dopetpoc126/BEAKAN',
                status: 'DEPLOYED', statusColor: '#44ff88'
            },
            {
                name: 'ANADROME',
                type: 'Live Wallpaper',
                stack: 'Android · OpenGL ES · GLSL',
                desc: 'GPU-accelerated live wallpaper engine with a custom shader pipeline. Runs entirely on the GPU.',
                url: 'https://github.com/dopetpoc126/Anadrome',
                status: 'ACTIVE', statusColor: '#ffaa44'
            },
            {
                name: 'ANADROME',
                type: 'Live Wallpaper',
                stack: 'Android · OpenGL ES · GLSL',
                desc: 'GPU-accelerated live wallpaper engine with a custom shader pipeline. Runs entirely on the GPU.',
                url: 'https://github.com/dopetpoc126/Anadrome',
                status: 'ACTIVE', statusColor: '#ffaa44'
            }
        ];

        const cardW = 1120, cardH = 1700, startX = 100, cardY = 250, gap = 60;

        projects.forEach((p, i) => {
            const cx = startX + i * (cardW + gap);

            // Card bg
            ctx.fillStyle = 'rgba(16,10,3,0.96)';
            ctx.strokeStyle = 'rgba(255,170,68,0.4)';
            ctx.lineWidth = 3;
            ctx.beginPath(); ctx.roundRect(cx, cardY, cardW, cardH, 8); ctx.fill(); ctx.stroke();

            // Top bar
            ctx.fillStyle = '#ffaa44';
            ctx.fillRect(cx, cardY, cardW, 7);

            // Corner brackets
            const bL = 52; ctx.strokeStyle = '#ffaa44'; ctx.lineWidth = 4;
            [[cx + 18, cardY + 18, 1, 1], [cx + cardW - 18, cardY + 18, -1, 1], [cx + 18, cardY + cardH - 18, 1, -1], [cx + cardW - 18, cardY + cardH - 18, -1, -1]].forEach(([x, y, dx, dy]) => {
                ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + dx * bL, y); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + dy * bL); ctx.stroke();
            });

            // Number
            ctx.font = 'bold 40px "JetBrains Mono", monospace';
            ctx.fillStyle = 'rgba(255,170,68,0.45)'; ctx.textAlign = 'left';
            ctx.fillText(`0${i + 1}`, cx + 30, cardY + 78);

            // Status
            ctx.fillStyle = p.statusColor; ctx.textAlign = 'right';
            ctx.fillText(`● ${p.status}`, cx + cardW - 30, cardY + 78);

            // Name
            ctx.font = 'bold 110px "JetBrains Mono", monospace';
            ctx.fillStyle = '#fff5e8'; ctx.textAlign = 'left';
            ctx.fillText(p.name, cx + 30, cardY + 230);

            // Type
            ctx.font = '48px "JetBrains Mono", monospace';
            ctx.fillStyle = 'rgba(255,170,68,0.75)';
            ctx.fillText(p.type, cx + 30, cardY + 310);

            // Divider
            ctx.strokeStyle = 'rgba(255,170,68,0.25)'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(cx + 30, cardY + 345); ctx.lineTo(cx + cardW - 30, cardY + 345); ctx.stroke();

            // Stack
            ctx.font = 'bold 44px "JetBrains Mono", monospace';
            ctx.fillStyle = '#ffcc88';
            ctx.fillText(p.stack, cx + 30, cardY + 420);

            // Divider 2
            ctx.strokeStyle = 'rgba(255,170,68,0.15)'; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(cx + 30, cardY + 455); ctx.lineTo(cx + cardW - 30, cardY + 455); ctx.stroke();

            // Description word wrap
            ctx.font = '46px "Inter", sans-serif';
            ctx.fillStyle = 'rgba(255,235,195,0.78)';
            const words = p.desc.split(' ');
            let line = '', lineY = cardY + 560;
            words.forEach(w => {
                const test = line + w + ' ';
                if (ctx.measureText(test).width > cardW - 60 && line) {
                    ctx.fillText(line.trim(), cx + 30, lineY); line = w + ' '; lineY += 66;
                } else { line = test; }
            });
            ctx.fillText(line.trim(), cx + 30, lineY);

            // Link button
            ctx.strokeStyle = 'rgba(255,170,68,0.4)'; ctx.lineWidth = 2;
            ctx.fillStyle = 'rgba(255,170,68,0.1)';
            ctx.beginPath(); ctx.roundRect(cx + 30, cardY + cardH - 160, cardW - 60, 110, 6); ctx.fill(); ctx.stroke();
            ctx.font = 'bold 40px "JetBrains Mono", monospace';
            ctx.fillStyle = '#ffaa44'; ctx.textAlign = 'center';
            ctx.fillText(`>> ${p.url.replace('https://', '')}`, cx + cardW / 2, cardY + cardH - 90);
        });

        // Footer
        ctx.font = '40px "JetBrains Mono", monospace';
        ctx.fillStyle = 'rgba(255,170,68,0.22)'; ctx.textAlign = 'right';
        ctx.fillText('NEURAL_UPLINK: ACTIVE  //  ZENITH SYS.01', CW - 100, CH - 40);

        const tex = new THREE.CanvasTexture(canvas);
        tex.minFilter = THREE.LinearFilter;
        tex.anisotropy = 4;
        return tex;
    }

    createHologram() {
        this.hologramGroup = new THREE.Group();

        const startX = 0.26956884542429194;
        const startY = 1.2412928775135925;
        const startZ = 0.3246451894757918;

        // ─── Panel dimensions ───
        const PW = 0.85;
        const PH = 0.56;
        // Float the panel clearly above the table so it's fully visible.
        // Camera at y=1.74, tilt -26.6°. At 1m distance, line-of-sight center = y≈1.24.
        // Table surface is at y=1.24. Raise panel so its bottom clears the table.
        // Panel bottom = panelCenterY - PH/2. We want bottom ≥ startY + 0.08 (just above surface).
        // → panelCenterY = startY + PH/2 + 0.08 = 1.24 + 0.28 + 0.08 = 1.60
        const panelCenterY = startY + PH / 2 + 0.10; // bottom clears table surface
        const panelCenterZ = startZ;

        // ─── 1. Base projection ring ───
        const ringGeom = new THREE.RingGeometry(0.05, 0.18, 64);
        const ringMat = new THREE.MeshBasicMaterial({
            color: 0xff4d00,
            transparent: true, opacity: 0,
            side: THREE.DoubleSide, depthWrite: false,
            blending: THREE.AdditiveBlending
        });
        const ring = new THREE.Mesh(ringGeom, ringMat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(startX, startY + 0.003, startZ);
        ring.renderOrder = 1;
        this.hologramGroup.add(ring);
        this.hologramRing = ring;
        this.hologramRingMat = ringMat;

        // ─── 2. Projection pillar — short glow post from table to panel ───
        const beamH = 0.18; // fixed short post height
        const coneGeom = new THREE.CylinderGeometry(0.006, 0.14, beamH, 16, 1, true);
        const coneMat = new THREE.MeshBasicMaterial({
            color: 0xff4d00, transparent: true, opacity: 0,
            side: THREE.DoubleSide, depthWrite: false,
            blending: THREE.AdditiveBlending
        });
        const cone = new THREE.Mesh(coneGeom, coneMat);
        cone.position.set(startX, startY + beamH / 2, startZ);
        this.hologramGroup.add(cone);
        this.hologramBeam = cone;
        this.hologramBeamMat = coneMat;

        // ─── 3. Main panel — canvas texture with about content ───
        this._buildHologramCanvas(PW, PH);

        const panelGeo = new THREE.PlaneGeometry(PW, PH);
        this.hologramPanelMat = new THREE.MeshBasicMaterial({
            map: this.hologramTex,
            transparent: true, opacity: 0,
            depthWrite: true,
            blending: THREE.NormalBlending,
            side: THREE.FrontSide
        });
        const panel = new THREE.Mesh(panelGeo, this.hologramPanelMat);
        panel.rotation.y = Math.PI / 2;
        panel.position.set(startX, panelCenterY, panelCenterZ);
        panel.renderOrder = 10; // renders on top of beam/ring
        this.hologramGroup.add(panel);
        this.hologramPanel = panel;

        // ─── 4. Glowing border frame ───
        const borderMat = new THREE.MeshBasicMaterial({
            color: 0xff4d00, transparent: true, opacity: 0,
            depthWrite: false, blending: THREE.AdditiveBlending
        });
        this.hologramBorderMat = borderMat;
        const bT = 0.012; // border thickness
        const borders = [
            // top
            { w: PW + bT * 2, h: bT, x: startX, y: panelCenterY + PH / 2, z: panelCenterZ },
            // bottom
            { w: PW + bT * 2, h: bT, x: startX, y: panelCenterY - PH / 2, z: panelCenterZ },
            // left
            { w: bT, h: PH, x: startX, y: panelCenterY, z: panelCenterZ - PW / 2 },
            // right
            { w: bT, h: PH, x: startX, y: panelCenterY, z: panelCenterZ + PW / 2 },
        ];
        borders.forEach(b => {
            const g = new THREE.PlaneGeometry(b.w, b.h);
            const m = new THREE.Mesh(g, borderMat);
            m.rotation.y = Math.PI / 2;
            m.position.set(b.x, b.y, b.z);
            this.hologramGroup.add(m);
        });

        // ─── 5. Scanline overlay — animated scrolling lines ───
        this._buildScanlineCanvas();
        this.scanlineMat = new THREE.MeshBasicMaterial({
            map: this.scanlineTex,
            transparent: true, opacity: 0,
            depthWrite: false, blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide
        });
        const scanGeo = new THREE.PlaneGeometry(PW, PH);
        const scanMesh = new THREE.Mesh(scanGeo, this.scanlineMat);
        scanMesh.rotation.y = Math.PI / 2;
        scanMesh.position.set(startX - 0.002, panelCenterY, panelCenterZ);
        this.hologramGroup.add(scanMesh);
        this.hologramScanMesh = scanMesh;

        // ─── 6. Floating sparks ───
        const pCount = 20;
        const pGeom = new THREE.BufferGeometry();
        const pPos = new Float32Array(pCount * 3);
        const velocities = [];
        for (let i = 0; i < pCount; i++) {
            const r = Math.random() * 0.12;
            const theta = Math.random() * Math.PI * 2;
            pPos[i * 3] = startX + (Math.random() - 0.5) * 0.04;
            pPos[i * 3 + 1] = startY + Math.random() * (PH + 0.4);
            pPos[i * 3 + 2] = startZ + r * Math.sin(theta);
            velocities.push({ y: 0.06 + Math.random() * 0.08 });
        }
        pGeom.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
        const pMat = new THREE.PointsMaterial({
            color: 0xff6030, size: 0.007,
            transparent: true, opacity: 0,
            depthWrite: false, blending: THREE.AdditiveBlending
        });
        const sparks = new THREE.Points(pGeom, pMat);
        this.hologramGroup.add(sparks);
        this.hologramParticles = sparks;
        this.hologramSparkMat = pMat;
        this.particleVelocities = velocities;
        this.particleStartPos = { x: startX, y: startY, z: startZ };
        this._hologramPanelCenterY = panelCenterY;
        this._hologramPanelH = PH;

        this.model.add(this.hologramGroup);
        console.log('Loft System: Holographic about panel initialized on coffee table');
    }

    _buildHologramCanvas(PW, PH) {
        const CW = 1024;
        const CH = Math.round(CW * (PH / PW));

        const canvas = document.createElement('canvas');
        canvas.width = CW;
        canvas.height = CH;
        const ctx = canvas.getContext('2d');

        // ── Background — deep near-black ──
        ctx.fillStyle = '#060608';
        ctx.fillRect(0, 0, CW, CH);

        // Subtle dot-grid (more modern than lines)
        for (let y = 24; y < CH; y += 40) {
            for (let x = 24; x < CW; x += 40) {
                ctx.beginPath();
                ctx.arc(x, y, 1, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(255,77,0,0.07)';
                ctx.fill();
            }
        }

        // Left accent bar — full height orange stripe
        ctx.fillStyle = '#ff4d00';
        ctx.fillRect(0, 0, 5, CH);

        // ── Corner brackets — crisp orange ──
        const bLen = 44, bW = 2.5, pad = 18;
        ctx.strokeStyle = 'rgba(255,77,0,0.7)';
        ctx.lineWidth = bW;
        [[pad, pad, 1, 1], [CW - pad, pad, -1, 1],
         [pad, CH - pad, 1, -1], [CW - pad, CH - pad, -1, -1]].forEach(([x, y, dx, dy]) => {
            ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + dx * bLen, y); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + dy * bLen); ctx.stroke();
        });

        // ── Left-padding for safe 3D framing ──
        const leftOffset = pad + 120;

        // ── Section tag — top left ──
        ctx.font = '500 24px "JetBrains Mono", monospace';
        ctx.fillStyle = 'rgba(255,77,0,0.6)';
        ctx.textAlign = 'left';
        ctx.fillText('[ OPERATIVE_PROFILE ]', leftOffset, pad + 38);

        // ── Horizontal rule ──
        const rule1Y = pad + 52;
        const grad = ctx.createLinearGradient(leftOffset, 0, CW - pad - 60, 0);
        grad.addColorStop(0,   'rgba(255,77,0,0.6)');
        grad.addColorStop(0.4, 'rgba(255,77,0,0.2)');
        grad.addColorStop(1,   'rgba(255,77,0,0)');
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(leftOffset, rule1Y); ctx.lineTo(CW - pad - 60, rule1Y); ctx.stroke();

        // ── Name — crisp & well-padded ──
        ctx.font = 'bold 84px "JetBrains Mono", monospace';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'left';
        ctx.fillText('SHRIYAN', leftOffset, rule1Y + 90);

        // ── Title/role line ──
        ctx.font = '500 26px "JetBrains Mono", monospace';
        ctx.fillStyle = '#ff4d00';
        ctx.fillText('CS UNDERGRADUATE  ·  SYSTEMS BUILDER', leftOffset, rule1Y + 135);

        // ── Bio data grid ──
        const bioY = rule1Y + 180;
        const bioItems = [
            { label: 'FOCUS',    value: 'Android & Web'  },
            { label: 'BASE',     value: 'VIT Chennai'    },
            { label: 'STATUS',   value: '● AVAILABLE',  accent: true },
        ];
        const colStep = (CW - leftOffset - pad - 40) / 3;
        bioItems.forEach((item, i) => {
            const bx = leftOffset + i * colStep;
            ctx.font = '500 20px "JetBrains Mono", monospace';
            ctx.fillStyle = 'rgba(255,77,0,0.5)';
            ctx.textAlign = 'left';
            ctx.fillText(item.label, bx, bioY);
            ctx.font = 'bold 26px "JetBrains Mono", monospace';
            ctx.fillStyle = item.accent ? '#44ff88' : 'rgba(255,255,255,0.88)';
            ctx.fillText(item.value, bx, bioY + 35);
        });

        // ── Divider ──
        const rule2Y = bioY + 80;
        ctx.strokeStyle = 'rgba(255,255,255,0.07)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(leftOffset, rule2Y); ctx.lineTo(CW - pad - 60, rule2Y); ctx.stroke();

        // ── Core statement ──
        ctx.font = 'bold 28px "JetBrains Mono", monospace';
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        ctx.fillText('> Building high-performance interfaces.', leftOffset, rule2Y + 44);

        // ── Description lines ──
        const descLines = [
            'Android & web dev with a focus on efficiency.',
            'Roots every device to maximize performance.',
            'I don\'t just write code — I optimize it.',
        ];
        ctx.font = '24px "Inter", sans-serif';
        descLines.forEach((line, i) => {
            ctx.fillStyle = `rgba(255,235,215,${0.55 - i * 0.08})`;
            ctx.fillText(line, leftOffset, rule2Y + 44 + 44 + i * 36);
        });

        // ── Mandate pills ──
        const mandateY = rule2Y + 44 + 44 + descLines.length * 36 + 20;
        ['>  Performance is paramount.', '>  User experience is priority.'].forEach((txt, i) => {
            const tx = leftOffset + i * 400;
            ctx.fillStyle = 'rgba(255,77,0,0.12)';
            const tw = ctx.measureText(txt).width + 20;
            ctx.fillRect(tx - 6, mandateY - 20, tw, 30);
            ctx.fillStyle = '#ffaa77';
            ctx.font = 'bold 18px "JetBrains Mono", monospace';
            ctx.fillText(txt, tx, mandateY);
        });
            ctx.strokeStyle = 'rgba(255,77,0,0.3)';
            ctx.lineWidth = 1;
            ctx.strokeRect(tx - 8, mandateY - 24, tw, 34);
            ctx.font = '500 24px "JetBrains Mono", monospace';
            ctx.fillStyle = 'rgba(255,120,60,0.8)';
            ctx.fillText(txt, tx, mandateY);
        });

        // ── Footer ──
        ctx.font = '500 20px "JetBrains Mono", monospace';
        ctx.fillStyle = 'rgba(255,77,0,0.2)';
        ctx.textAlign = 'right';
        ctx.fillText('UPLINK: ACTIVE  //  ZENITH SYS.01', CW - pad - 10, CH - pad - 10);

        this.hologramTex = new THREE.CanvasTexture(canvas);
        this.hologramTex.minFilter = THREE.LinearFilter;
    }

    _buildScanlineCanvas() {
        const CW = 8, CH = 256;
        const canvas = document.createElement('canvas');
        canvas.width = CW;
        canvas.height = CH;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, CW, CH);
        for (let y = 0; y < CH; y += 4) {
            ctx.fillStyle = 'rgba(255, 77, 0, 0.05)';
            ctx.fillRect(0, y, CW, 2);
        }
        this.scanlineTex = new THREE.CanvasTexture(canvas);
        this.scanlineTex.wrapS = THREE.RepeatWrapping;
        this.scanlineTex.wrapT = THREE.RepeatWrapping;
        this.scanlineTex.repeat.set(1, 8);
    }

    createPortal() {
        this.portalGroup = new THREE.Group();

        // 1. Physical 3D Square Frame (4 interlocking bar meshes in YZ plane)
        const frameMat = new THREE.MeshStandardMaterial({
            color: 0x111111,
            roughness: 0.15,
            metalness: 0.9,
            emissive: 0xaa00ff, // Vibrant purple emissive glow
            emissiveIntensity: 0.35,
            transparent: true,
            opacity: 0
        });
        this.ringMat = frameMat; // Bind to this.ringMat for scroll opacity updates

        const thickness = 0.05;
        const size = 1.8;

        // Horizontal top & bottom bars (along Z in YZ plane, offset along Y)
        const horizGeom = new THREE.BoxGeometry(thickness, thickness, size);
        const topBar = new THREE.Mesh(horizGeom, frameMat);
        topBar.position.set(0, size / 2 - thickness / 2, 0);

        const bottomBar = new THREE.Mesh(horizGeom, frameMat);
        bottomBar.position.set(0, -size / 2 + thickness / 2, 0);

        // Vertical left & right bars (along Y in YZ plane, offset along Z)
        const vertGeom = new THREE.BoxGeometry(thickness, size - thickness * 2, thickness);
        const leftBar = new THREE.Mesh(vertGeom, frameMat);
        leftBar.position.set(0, 0, size / 2 - thickness / 2);

        const rightBar = new THREE.Mesh(vertGeom, frameMat);
        rightBar.position.set(0, 0, -size / 2 + thickness / 2);

        this.portalGroup.add(topBar);
        this.portalGroup.add(bottomBar);
        this.portalGroup.add(leftBar);
        this.portalGroup.add(rightBar);

        // 2. Vortex event horizon (Square Plane, rotated internally on Y to YZ plane)
        const discGeom = new THREE.PlaneGeometry(size - thickness * 0.5, size - thickness * 0.5);
        this.portalShaderMat = new THREE.ShaderMaterial({
            vertexShader: PORTAL_VERTEX_SHADER,
            fragmentShader: PORTAL_FRAGMENT_SHADER,
            uniforms: {
                uTime: { value: 0 },
                uOpacity: { value: 0 }
            },
            transparent: true,
            side: THREE.DoubleSide,
            depthWrite: true // Write to depth buffer so background geometry cannot draw on top
        });
        const portalVortex = new THREE.Mesh(discGeom, this.portalShaderMat);
        // Rotate the plane internally so it lies in the YZ plane (normal X)
        portalVortex.rotation.y = Math.PI / 2;
        this.portalGroup.add(portalVortex);

        // No Y-rotation on this.portalGroup itself to prevent coordinate mapping shifts!

        // Position flush on top of the wooden slats at X = -2.19 (shifted 2cm forward to prevent Z-fighting):
        this.portalGroup.position.set(-2.19, 2.8740861808376628, 0.823518420500778);

        this.model.add(this.portalGroup);
        console.log('Loft System: Square Purple-Black Portal Initialized flush on wall');
    }

    createWallExtension() {
        this.wallExtGroup = new THREE.Group();

        // 1. Backing board (dark warm shadow gap backdrop - trimmed on the right, starts at Z = -1.5)
        const backGeom = new THREE.PlaneGeometry(14.5, 12);
        this.backBoardMat = new THREE.MeshStandardMaterial({
            color: 0x110f0d,
            roughness: 0.95,
            transparent: true,
            opacity: 0
        });
        const backMesh = new THREE.Mesh(backGeom, this.backBoardMat);
        backMesh.rotation.y = Math.PI / 2;
        backMesh.position.set(-2.274, 2.888, 5.75);
        this.wallExtGroup.add(backMesh);

        // 2. Vertical wooden slats (cozy modern walnut wood panels)
        this.slatMat = new THREE.MeshStandardMaterial({
            color: 0x61483c, // Cozy dark walnut tone
            roughness: 0.65,
            metalness: 0.05,
            transparent: true,
            opacity: 0
        });

        // Width of wall is 14.5. Spanned from Z = -1.5 to 13.0
        const startZ = -1.5;
        const endZ = 13.0;
        const spacing = 0.4;
        const slatThickness = 0.05;
        const slatWidth = 0.2;

        const slatGeom = new THREE.BoxGeometry(slatThickness, 12, slatWidth);

        for (let z = startZ; z <= endZ; z += spacing) {
            const slatMesh = new THREE.Mesh(slatGeom, this.slatMat);
            // Slat is parallel to the YZ plane. 
            // Position it slightly in front of the backing board on X
            slatMesh.position.set(-2.274 + slatThickness / 2 + 0.005, 2.888, z);
            this.wallExtGroup.add(slatMesh);
        }

        this.model.add(this.wallExtGroup);
        console.log('Loft System: 3D wooden slats wall extension created to mask left void');
    }

    createSunRays() {
        this.sunRayGroup = new THREE.Group();

        const RAY_SHADER_VERT = `
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `;

        const RAY_SHADER_FRAG = `
            uniform float uOpacity;
            uniform float uTime;
            uniform float uPhase;
            varying vec2 vUv;
            void main() {
                // Bright at top (entry), fades to nothing at bottom (floor)
                float lenFade = pow(vUv.y, 0.5) * (1.0 - pow(max(0.0, 1.0 - vUv.y * 1.2), 2.0));
                // Bright centre strip, soft edges
                float widFade = 1.0 - abs(vUv.x * 2.0 - 1.0);
                widFade = pow(widFade, 1.2);
                // Slow ambient breathing per shaft
                float flicker = 0.82 + 0.18 * sin(uTime * 0.55 + uPhase);
                float alpha = lenFade * widFade * flicker * uOpacity;
                // Warm afternoon sun — golden/amber
                vec3 colour = vec3(1.0, 0.85, 0.50);
                gl_FragColor = vec4(colour, alpha);
            }
        `;

        // Model-space: floor ≈ y=0, camera landing y=2.5, ceiling ≈ y=5
        // Window wall is at high Z (right side). Rays originate near ceiling on window side,
        // tilt steeply downward (rotX ~1.3 rad ≈ 75°) so they cast nearly vertically.
        // rotY angles them slightly inward toward the room centre.
        const rays = [
            // Main wide shaft — large centre window panel
            { x: 2.0, y: 4.8, z: 5.0, rX: 1.30, rY: -0.20, w: 1.1, h: 7.0, phase: 0.0 },
            // Second beam — left of centre, hits sofa area
            { x: 1.4, y: 4.8, z: 6.5, rX: 1.25, rY: -0.28, w: 0.7, h: 6.5, phase: 1.4 },
            // Narrow sliver — window frame gap, pencil beam
            { x: 2.8, y: 4.8, z: 3.8, rX: 1.35, rY: -0.15, w: 0.3, h: 6.0, phase: 2.1 },
            // Wide soft fill — far window, ambient wash across rug
            { x: 3.0, y: 4.8, z: 8.0, rX: 1.20, rY: -0.35, w: 1.5, h: 6.0, phase: 0.8 },
        ];

        this.sunRayMats = [];

        rays.forEach(r => {
            const geo = new THREE.PlaneGeometry(r.w, r.h);
            const mat = new THREE.ShaderMaterial({
                vertexShader: RAY_SHADER_VERT,
                fragmentShader: RAY_SHADER_FRAG,
                uniforms: {
                    uOpacity: { value: 0.0 },
                    uTime: { value: 0.0 },
                    uPhase: { value: r.phase }
                },
                transparent: true,
                depthWrite: false,
                blending: THREE.AdditiveBlending,
                side: THREE.DoubleSide,
            });

            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(r.x, r.y, r.z);
            mesh.rotation.x = r.rX;  // tilt forward/down
            mesh.rotation.y = r.rY;  // angle left into room

            this.sunRayMats.push(mat);
            this.sunRayGroup.add(mesh);
        });

        this.model.add(this.sunRayGroup);
        console.log('Loft System: Sun ray shafts created');
    }

    getWaypoint(name) {
        if (!this.waypoints || !this.waypoints[name]) return null;
        const target = new THREE.Vector3();
        this.waypoints[name].getWorldPosition(target);
        return target;
    }

    setScrollProgress(progress) {
        const clamped = clamp(progress, 0, 1);

        this.group.position.y = this.baseY;
        this.group.position.z = -25;

        // Dynamic fog masking to hide the floating box in black space
        let fogDensity = 0;
        if (clamped >= 0.06 && clamped < 0.12) {
            const t = (clamped - 0.06) / 0.06;
            fogDensity = t * 0.055; // Ramps up to thick black fog
        } else if (clamped >= 0.12 && clamped < 0.16) {
            const t = (clamped - 0.12) / 0.04;
            fogDensity = (1.0 - t) * 0.055; // Clears up inside the room
        }
        if (this.gl.scene.fog) {
            this.gl.scene.fog.density = fogDensity;
        }

        // Room and Train Opacity Cross-fade
        let roomOpacity = 0;
        let trainOpacity = 0;

        if (clamped >= 0.10 && clamped < 0.15) {
            const t = (clamped - 0.10) / 0.05;
            roomOpacity = t * t * (3 - 2 * t);
        } else if (clamped >= 0.15 && clamped < 0.60) {
            // Room fully opaque until camera is fully through the portal (15%–60%)
            roomOpacity = 1.0;
            trainOpacity = 0.0;
        } else if (clamped >= 0.60 && clamped < 0.65) {
            // Room gone, train fades in quickly (60%–65%)
            roomOpacity = 0.0;
            const t = (clamped - 0.60) / 0.05;
            trainOpacity = t * t * (3 - 2 * t);
        } else if (clamped >= 0.65) {
            roomOpacity = 0.0;
            trainOpacity = 1.0;
        }

        // Apply Room Materials Opacity
        if (this.modelReady && this.model) {
            this.cityMaterials.forEach(material => {
                material.opacity = roomOpacity;
                material.transparent = roomOpacity < 1.0;
                material.depthWrite = true;
            });

            // Sync portal opacity
            if (this.portalShaderMat) {
                this.portalShaderMat.uniforms.uOpacity.value = roomOpacity;
            }
            if (this.ringMat) {
                this.ringMat.opacity = roomOpacity;
                this.ringMat.transparent = roomOpacity < 1.0;
            }

            // Sync wall extension opacity
            if (this.backBoardMat) {
                this.backBoardMat.opacity = roomOpacity;
                this.backBoardMat.transparent = roomOpacity < 1.0;
            }
            if (this.slatMat) {
                this.slatMat.opacity = roomOpacity;
                this.slatMat.transparent = roomOpacity < 1.0;
            }
        }

        if (this.trainReady && this.trainModel) {
            // Tunnel exit portal — fades in with train, fully visible from 68%+
            if (this.tunnelPortalShaderMat) {
                this.tunnelPortalShaderMat.uniforms.uOpacity.value = trainOpacity;
            }
            if (this.tunnelPortalFrameMat) {
                this.tunnelPortalFrameMat.opacity = trainOpacity;
                this.tunnelPortalFrameMat.transparent = trainOpacity < 1.0;
            }
            this.trainMaterials.forEach(material => {
                material.opacity = trainOpacity;
                material.transparent = trainOpacity < 1.0;
                material.depthWrite = true;
            });
            // F1 car synced to train opacity
            if (this.f1Materials) {
                this.f1Materials.forEach(mat => {
                    mat.opacity = trainOpacity;
                    mat.transparent = trainOpacity < 1.0;
                    mat.depthWrite = true;
                });
            }
            // Tyre rack synced to train opacity
            if (this.tyreRackMaterials) {
                this.tyreRackMaterials.forEach(mat => {
                    mat.opacity = trainOpacity;
                    mat.transparent = trainOpacity < 1.0;
                    mat.depthWrite = true;
                });
            }
            // Computer synced to train opacity
            if (this.computerMaterials) {
                this.computerMaterials.forEach(mat => {
                    mat.opacity = trainOpacity;
                    mat.transparent = trainOpacity < 1.0;
                    mat.depthWrite = true;
                });
            }
        }

        // Sun rays — visible while room is visible, fade with roomOpacity
        if (this.sunRayMats && this.sunRayMats.length) {
            const rayOpacity = roomOpacity * 0.75;
            this.sunRayMats.forEach(mat => {
                mat.uniforms.uOpacity.value = rayOpacity;
            });
        }

        // Tunnel exit portal — fades in with train, stays visible
        if (this.tunnelPortalShaderMat) {
            this.tunnelPortalShaderMat.uniforms.uOpacity.value = trainOpacity;
        }
        if (this.tunnelPortalFrameMat) {
            this.tunnelPortalFrameMat.opacity = trainOpacity;
            this.tunnelPortalFrameMat.transparent = trainOpacity < 1.0;
        }

        // Apply Hologram Opacities — synced to zoom-to-table scroll phases
        // Fade in: 16%→26% | Hold: 26%→38% | Fade out: 38%→45%
        let hologramOpacity = 0;
        if (clamped >= 0.16 && clamped < 0.26) {
            const t = (clamped - 0.16) / 0.10;
            hologramOpacity = t * t * (3 - 2 * t);
        } else if (clamped >= 0.26 && clamped < 0.38) {
            hologramOpacity = 1.0;
        } else if (clamped >= 0.38 && clamped < 0.45) {
            hologramOpacity = 1.0 - (clamped - 0.38) / 0.07;
        }

        if (this.hologramRingMat) this.hologramRingMat.opacity = hologramOpacity * 0.9;
        if (this.hologramBeamMat) this.hologramBeamMat.opacity = hologramOpacity * 0.35;
        if (this.hologramPanelMat) this.hologramPanelMat.opacity = hologramOpacity * 0.92;
        if (this.hologramBorderMat) this.hologramBorderMat.opacity = hologramOpacity * 0.85;
        if (this.scanlineMat) this.scanlineMat.opacity = hologramOpacity * 0.55;
        if (this.hologramSparkMat) this.hologramSparkMat.opacity = hologramOpacity * 0.7;
    }

    update(progress = 0) {
        // Animate the portal vortex shader uTime
        if (this.portalShaderMat) {
            this.portalShaderMat.uniforms.uTime.value = this.clock.getElapsedTime();
        }

        // Animate tunnel exit portal uTime
        if (this.tunnelPortalShaderMat) {
            this.tunnelPortalShaderMat.uniforms.uTime.value = this.clock.getElapsedTime();
        }

        // Animate sun ray flicker uTime
        if (this.sunRayMats && this.sunRayMats.length) {
            const t = this.clock.getElapsedTime();
            this.sunRayMats.forEach(mat => {
                mat.uniforms.uTime.value = t;
            });
        }

        // Animate Hologram — scanline scroll, panel flicker, spark rise, ring pulse
        if (this.hologramGroup) {
            const elapsed = this.clock.getElapsedTime();

            // Scanline UV scroll — shifts lines upward over time
            if (this.scanlineTex) {
                this.scanlineTex.offset.y = (elapsed * 0.18) % 1;
                this.scanlineTex.needsUpdate = true;
            }

            // Panel flicker — removed (pulse was making text hard to read)

            // Ring pulse
            if (this.hologramRing) {
                const pulse = 1.0 + Math.sin(elapsed * 2.8) * 0.08;
                this.hologramRing.scale.setScalar(pulse);
            }

            // Sparks rising in beam column
            if (this.hologramParticles && this.particleVelocities) {
                const positions = this.hologramParticles.geometry.attributes.position.array;
                const count = positions.length / 3;
                const topY = this.particleStartPos.y + (this._hologramPanelCenterY - this.particleStartPos.y) + this._hologramPanelH / 2;
                for (let i = 0; i < count; i++) {
                    positions[i * 3 + 1] += this.particleVelocities[i].y * 0.016;
                    if (positions[i * 3 + 1] > topY) {
                        positions[i * 3] = this.particleStartPos.x + (Math.random() - 0.5) * 0.04;
                        positions[i * 3 + 1] = this.particleStartPos.y;
                        positions[i * 3 + 2] = this.particleStartPos.z + (Math.random() - 0.5) * 0.1;
                        this.particleVelocities[i].y = 0.06 + Math.random() * 0.08;
                    }
                }
                this.hologramParticles.geometry.attributes.position.needsUpdate = true;
            }
        }
    }

    dispose() {
        this.disposed = true;
        console.log('Loft System: Disposing...');

        // Clean up fog
        if (this.gl.scene.fog) {
            this.gl.scene.fog = null;
        }

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
        if (this.portalGroup) {
            this.portalGroup.traverse(node => {
                if (node.isMesh) {
                    if (node.geometry) node.geometry.dispose();
                    if (node.material) node.material.dispose();
                }
            });
        }
        if (this.wallExtGroup) {
            this.wallExtGroup.traverse(node => {
                if (node.isMesh) {
                    if (node.geometry) node.geometry.dispose();
                    if (node.material) node.material.dispose();
                }
            });
        }
        if (this.sunRayGroup) {
            this.sunRayGroup.traverse(node => {
                if (node.isMesh) {
                    if (node.geometry) node.geometry.dispose();
                    if (node.material) node.material.dispose();
                }
            });
        }
        if (this.trainModel) {
            this.trainModel.traverse(node => {
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
            this.group.remove(this.trainModel);
        }
        if (this.rescueJet) {
            this.rescueJet.traverse(node => {
                if (node.isMesh) {
                    if (node.geometry) node.geometry.dispose();
                    if (node.material) {
                        if (Array.isArray(node.material)) {
                            node.material.forEach(mat => mat.dispose());
                        } else {
                            node.material.dispose();
                        }
                    }
                }
            });
            this.group.remove(this.rescueJet);
        }
        if (this.hologramGroup) {
            this.hologramGroup.traverse(node => {
                if (node.isMesh || node.isPoints) {
                    if (node.geometry) node.geometry.dispose();
                    if (node.material) node.material.dispose();
                }
            });
            if (this.model) this.model.remove(this.hologramGroup);
        }
    }
}
