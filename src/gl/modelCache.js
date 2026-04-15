import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';

const DRACO_DECODER_PATH = `${import.meta.env.BASE_URL}draco/gltf/`;

const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderConfig({ type: 'wasm' });
dracoLoader.setDecoderPath(DRACO_DECODER_PATH);

const gltfLoader = new GLTFLoader();
gltfLoader.setDRACOLoader(dracoLoader);

const gltfCache = new Map();

export const createModelUrl = (filename, version = 'compressed') =>
    `${import.meta.env.BASE_URL}${filename}?v=${version}`;

export const loadCachedGLTF = (url) => {
    if (!gltfCache.has(url)) {
        const pendingLoad = new Promise((resolve, reject) => {
            gltfLoader.load(
                url,
                resolve,
                undefined,
                (error) => {
                    gltfCache.delete(url);
                    reject(error);
                }
            );
        });

        gltfCache.set(url, pendingLoad);
    }

    return gltfCache.get(url);
};

export const cloneCachedScene = async (url) => {
    const gltf = await loadCachedGLTF(url);
    return clone(gltf.scene);
};
