const fs = require('fs');

try {
    const buffer = fs.readFileSync('public/new.glb');
    
    // GLB Header: magic (4), version (4), length (4)
    const magic = buffer.toString('utf8', 0, 4);
    if (magic !== 'glTF') {
        throw new Error('Not a valid GLB file');
    }
    
    // Chunk 0: length (4), type (4), data
    const chunk0Length = buffer.readUInt32LE(12);
    const chunk0Type = buffer.toString('utf8', 16, 20);
    
    if (chunk0Type !== 'JSON') {
        throw new Error('First chunk is not JSON');
    }
    
    const jsonString = buffer.toString('utf8', 20, 20 + chunk0Length);
    const gltf = JSON.parse(jsonString);
    
    console.log('--- MODEL SPECIFICATIONS ---');
    console.log(`File Size: ${(buffer.length / 1024 / 1024).toFixed(2)} MB`);
    console.log(`Meshes: ${gltf.meshes ? gltf.meshes.length : 0}`);
    console.log(`Nodes: ${gltf.nodes ? gltf.nodes.length : 0}`);
    console.log(`Materials: ${gltf.materials ? gltf.materials.length : 0}`);
    console.log(`Textures: ${gltf.textures ? gltf.textures.length : 0}`);
    console.log(`Images: ${gltf.images ? gltf.images.length : 0}`);
    
    // Calculate total triangles (rough estimate by looking at accessors used for indices)
    let totalTriangles = 0;
    if (gltf.meshes && gltf.accessors) {
        gltf.meshes.forEach(mesh => {
            if (mesh.primitives) {
                mesh.primitives.forEach(prim => {
                    if (prim.indices !== undefined) {
                        const accessor = gltf.accessors[prim.indices];
                        if (accessor) {
                            totalTriangles += accessor.count / 3;
                        }
                    } else if (prim.attributes && prim.attributes.POSITION !== undefined) {
                        const accessor = gltf.accessors[prim.attributes.POSITION];
                        if (accessor) {
                            totalTriangles += accessor.count / 3;
                        }
                    }
                });
            }
        });
    }
    console.log(`Total Triangles: ${Math.round(totalTriangles).toLocaleString()}`);
    
} catch (e) {
    console.error(e);
}
