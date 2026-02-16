uniform float uTime;
uniform float uScroll;
uniform float uScrollProgress;

varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vViewPosition;

void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vViewPosition = -mvPosition.xyz;

    // --- Unlimited Scroll Logic (Same as Particles) ---
    vec3 pos = position;
    
    // We need to handle the scroll offset manually in JS for meshes usually, 
    // but if we want them to "fly past" in the shader like the particles:
    // actually, meshes are better moved in JS for frustum culling to work.
    // BUT to keep sync perfect, let's do JS positioning.
    
    // However, the particles use a vertex-shader based offset "travelZ".
    // If we move meshes in JS, we need to match that exactly.
    // Let's stick to standard mesh rendering and handle movement in Suns.js update loop to be safe.
    
    gl_Position = projectionMatrix * mvPosition;
}
