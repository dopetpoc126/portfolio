uniform vec3 uColor;
uniform vec3 uRimColor;
uniform float uRimPower;

varying vec3 vNormal;
varying vec3 vViewPosition;

void main() {
    // 1. Base Color (Black Void)
    vec3 color = vec3(0.0);

    // 2. Fresnel Rim Light
    vec3 viewDir = normalize(vViewPosition);
    vec3 normal = normalize(vNormal);
    float fresnel = 1.0 - dot(viewDir, normal);
    fresnel = pow(fresnel, uRimPower);

    // 3. Atmosphere Glow (Standard additives)
    color = mix(color, uRimColor, fresnel);

    gl_FragColor = vec4(color, 1.0);
}
