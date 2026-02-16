uniform float uTime;
uniform float uRevealProgress;
uniform float uDisintegrate;
uniform vec3 uAccentColor;
varying vec2 vUv;
varying float vNoise;

// Random noise
float random(vec2 st) {
    return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
}

void main() {
    vec2 uv = vUv;
    
    // Deep dark base for readability
    vec3 baseColor = vec3(0.03, 0.03, 0.03);
    
    // Accent color (Zenith orange)
    vec3 accent = uAccentColor;
    
    // Subtle border frame - accent glow at edges only
    float borderX = smoothstep(0.0, 0.08, uv.x) * smoothstep(1.0, 0.92, uv.x);
    float borderY = smoothstep(0.0, 0.08, uv.y) * smoothstep(1.0, 0.92, uv.y);
    float border = 1.0 - (borderX * borderY);
    
    // Very subtle scanlines - reduced intensity
    float scanline = sin(uv.y * 150.0) * 0.015;
    
    // Minimal noise - only at edges
    float noise = random(uv + uTime * 0.05) * border * 0.1;
    
    // Corner accents
    float cornerDist = min(
        min(length(uv - vec2(0.0, 0.0)), length(uv - vec2(1.0, 0.0))),
        min(length(uv - vec2(0.0, 1.0)), length(uv - vec2(1.0, 1.0)))
    );
    float cornerGlow = smoothstep(0.15, 0.0, cornerDist) * 0.3;
    
    // Build final color
    vec3 color = baseColor;
    
    // Add accent to border only
    color += accent * border * 0.4;
    color += accent * cornerGlow;
    
    // Subtle effects
    color -= scanline;
    color += noise;
    
    // Hover reveal - subtle brightening
    color += accent * uRevealProgress * 0.15;
    
    // Disintegrate Dissolve
    if (uDisintegrate > 0.0) {
        float noiseVal = random(uv + uDisintegrate);
        // Add burn edge
        if (noiseVal < uDisintegrate) discard;
        if (noiseVal < uDisintegrate + 0.05) color = accent * 2.0;
    }
    
    gl_FragColor = vec4(color, 1.0);
}
