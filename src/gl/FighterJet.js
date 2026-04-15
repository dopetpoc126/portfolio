import * as THREE from 'three';
import { cloneCachedScene, createModelUrl } from './modelCache.js';

const JET_MODEL_URL = createModelUrl('f35-small.glb');

export default class FighterJet {
    constructor() {
        this.group = new THREE.Group();
        this.init();
    }

    init() {
        cloneCachedScene(JET_MODEL_URL)
            .then((model) => {

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
                console.log('F-35 Model Loaded');
            })
            .catch((error) => {
                console.error('An error occurred loading the F-35 model:', error);
                // Fallback to simple geometry if load fails?
                // For now, just log error.
            });
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
    }
}
