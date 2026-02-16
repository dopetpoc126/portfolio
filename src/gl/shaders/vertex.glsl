uniform float uTime;
uniform float uScroll;
uniform float uScrollProgress;
uniform float uScrollVelocity;
uniform float uScrollPhase;
uniform float uPulse;
uniform float uAudioEnergy;
uniform float uMode;
uniform vec2 uMouse;

attribute float aSize;
attribute vec3 aRandom;

varying vec3 vColor;
varying float vAlpha;
varying float vGlow;

// Simplex 3D Noise
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) { 
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);

  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);

  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;

  i = mod289(i); 
  vec4 p = permute(permute(permute(
    i.z + vec4(0.0, i1.z, i2.z, 1.0))
    + i.y + vec4(0.0, i1.y, i2.y, 1.0)) 
    + i.x + vec4(0.0, i1.x, i2.x, 1.0));

  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;

  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);

  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);

  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);

  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));

  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);

  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;

  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}

void main() {
  vec3 pos = position;

  float noiseScale = 0.23;
  float noiseTime = uTime * 0.08;
  float surfaceNoise = snoise(vec3(pos * noiseScale + vec3(0.0, 0.0, noiseTime)));
  pos += normalize(pos) * surfaceNoise * 0.25;

  float stageGlow = smoothstep(0.25, 0.8, uScrollProgress);
  float travelZ = mix(0.0, 45.0, stageGlow);
  pos.z -= travelZ * 0.6;

  float warp = smoothstep(0.25, 0.65, uScrollProgress) * 8.0 * uScrollVelocity;
  pos.x += warp * (aRandom.x - 0.5);
  pos.y += warp * (aRandom.y - 0.5);

  float velocityGrip = clamp(abs(uScrollVelocity), 0.0, 1.5);
  float pulse = 0.65 + 0.35 * sin(uTime * 4.8 + aRandom.x * 7.0 + uScrollPhase * 4.0);
  float energyBoost = clamp(uAudioEnergy * 1.4, 0.0, 1.3);
  float globalPulse = pulse + uPulse * 0.9 + energyBoost * 0.9;

  float sizeFactor = mix(0.9, 1.8, stageGlow + globalPulse * 0.35);
  float dynamicSize = aSize * sizeFactor * (1.0 + velocityGrip * 0.4 + energyBoost * 0.15);

  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  gl_PointSize = dynamicSize * (240.0 / max(0.1, -mvPosition.z));

  float fresnel = pow(1.0 - abs(dot(normalize(pos), vec3(0.0, 0.0, 1.0))), 2.4);
  float alpha = smoothstep(0.45, 6.0, -mvPosition.z);
  alpha *= (0.45 + 0.55 * (0.85 + globalPulse * 0.25));
  alpha *= (0.7 + velocityGrip * 0.35);
  alpha *= (0.8 + energyBoost * 0.4);

  float colorMix = clamp(stageGlow + fresnel * 0.6 + pulse * 0.4, 0.0, 1.0);
  vColor = mix(vec3(0.35), vec3(1.0), colorMix);
  vGlow = fresnel * 0.6 + globalPulse * 0.9 + velocityGrip * 0.5 + energyBoost * 0.4;
  vAlpha = alpha;

  gl_Position = projectionMatrix * mvPosition;
}
