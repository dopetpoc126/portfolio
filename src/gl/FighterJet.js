import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';

export default class FighterJet {
    constructor() {
        this.group = new THREE.Group();
        this.loader = new GLTFLoader();

        // DRACO Configuration
        this.dracoLoader = new DRACOLoader();
        this.dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
        this.loader.setDRACOLoader(this.dracoLoader);

        this.init();
    }

    init() {
        // Load the F-35 model
        // Assuming the user has placed 'f35_fighter_jet.glb' in the public/models/ folder
        // or directly in public/ if no models folder exists.
        // Based on typical Vite structure, public assets are served at root.

        const modelPath = import.meta.env.BASE_URL + 'f35-small.glb';

        this.loader.load(
            modelPath,
            (gltf) => {
                const model = gltf.scene;

                // Wireframe Material - dimmer for subtlety
                const wireframeMat = new THREE.MeshBasicMaterial({
                    color: 0x666666, // Darker gray instead of white
                    wireframe: true,
                    transparent: true,
                    opacity: 0.3 // Reduced from 0.5
                });

                // Apply material to all meshes in the model
                model.traverse((child) => {
                    if (child.isMesh) {
                        child.material = wireframeMat;
                    }
                });

                // Scale and Orient
                // Based on user feedback: The nose is spinning, likely due to compounded rotations.
                // Reset this to 0. Let Terrain.js handle orientation.
                model.scale.set(1.5, 1.5, 1.5);
                model.rotation.set(0, 0, 0);

                this.group.add(model);

                this.group.add(model);
                console.log('F-35 Model Loaded');
            },
            undefined,
            (error) => {
                console.error('An error occurred loading the F-35 model:', error);
                // Fallback to simple geometry if load fails?
                // For now, just log error.
            }
        );
    }

    // Get world position for bomb drop
    getBombPosition() {
        const worldPos = new THREE.Vector3();
        this.group.getWorldPosition(worldPos);
        worldPos.y -= 1;
        return worldPos;
    }

    dispose() {
        console.log('FighterJet: Disposing...');
        this.group.traverse(node => {
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
        if (this.dracoLoader) this.dracoLoader.dispose();
    }
}
