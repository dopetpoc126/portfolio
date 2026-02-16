uniform vec3 uColor;

varying vec3 vColor;
varying float vAlpha;
varying float vGlow;

void main() {
  float r = distance(gl_PointCoord, vec2(0.5));
  if (r > 0.5) discard;

  float glow = 1.0 - (r * 2.0);
  glow = pow(max(glow, 0.0), 5.0);

  float boost = 1.0 + vGlow * 0.6;
  gl_FragColor = vec4(vColor * uColor * boost, vAlpha * glow * (0.8 + vGlow * 0.2));
}
