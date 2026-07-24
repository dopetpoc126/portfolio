/**
 * BalatroLoader — vanilla WebGL port of the Balatro shader from React Bits.
 * No ogl, no React. Uses a raw fullscreen triangle.
 *
 * Portfolio palette:
 *   color1 = #ff4d00 (orange accent)
 *   color2 = #00ffcc (cyan accent)
 *   color3 = #050505 (void)
 */

const VERT = `
attribute vec2 position;
attribute vec2 uv;
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const FRAG = `
precision highp float;
#define PI 3.14159265359

uniform float iTime;
uniform vec3  iResolution;
uniform float uSpinRotation;
uniform float uSpinSpeed;
uniform vec2  uOffset;
uniform vec4  uColor1;
uniform vec4  uColor2;
uniform vec4  uColor3;
uniform float uContrast;
uniform float uLighting;
uniform float uSpinAmount;
uniform float uPixelFilter;
uniform float uSpinEase;
uniform bool  uIsRotate;
uniform vec2  uMouse;

varying vec2 vUv;

vec4 effect(vec2 screenSize, vec2 screen_coords) {
  float pixel_size = length(screenSize.xy) / uPixelFilter;
  vec2 uv = (floor(screen_coords.xy * (1.0 / pixel_size)) * pixel_size
    - 0.5 * screenSize.xy) / length(screenSize.xy) - uOffset;
  float uv_len = length(uv);

  float speed = (uSpinRotation * uSpinEase * 0.2);
  if (uIsRotate) { speed = iTime * speed; }
  speed += 302.2;

  float mouseInfluence = (uMouse.x * 2.0 - 1.0);
  speed += mouseInfluence * 0.1;

  float new_pixel_angle = atan(uv.y, uv.x) + speed
    - uSpinEase * 20.0 * (uSpinAmount * uv_len + (1.0 - uSpinAmount));
  vec2 mid = (screenSize.xy / length(screenSize.xy)) / 2.0;
  uv = (vec2(uv_len * cos(new_pixel_angle) + mid.x,
             uv_len * sin(new_pixel_angle) + mid.y) - mid);

  uv *= 30.0;
  float baseSpeed = iTime * uSpinSpeed;
  speed = baseSpeed + mouseInfluence * 2.0;

  vec2 uv2 = vec2(uv.x + uv.y);

  for (int i = 0; i < 5; i++) {
    uv2 += sin(max(uv.x, uv.y)) + uv;
    uv += 0.5 * vec2(
      cos(5.1123314 + 0.353 * uv2.y + speed * 0.131121),
      sin(uv2.x - 0.113 * speed)
    );
    uv -= cos(uv.x + uv.y) - sin(uv.x * 0.711 - uv.y);
  }

  float contrast_mod = (0.25 * uContrast + 0.5 * uSpinAmount + 1.2);
  float paint_res = min(2.0, max(0.0, length(uv) * 0.035 * contrast_mod));
  float c1p = max(0.0, 1.0 - contrast_mod * abs(1.0 - paint_res));
  float c2p = max(0.0, 1.0 - contrast_mod * abs(paint_res));
  float c3p = 1.0 - min(1.0, c1p + c2p);
  float light = (uLighting - 0.2) * max(c1p * 5.0 - 4.0, 0.0)
              + uLighting * max(c2p * 5.0 - 4.0, 0.0);

  return (0.3 / uContrast) * uColor1
    + (1.0 - 0.3 / uContrast) * (uColor1 * c1p + uColor2 * c2p
      + vec4(c3p * uColor3.rgb, c3p * uColor1.a)) + light;
}

void main() {
  vec2 coords = vUv * iResolution.xy;
  gl_FragColor = effect(iResolution.xy, coords);
}
`;

function hexToVec4(hex) {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
    1.0,
  ];
}

function compileShader(gl, type, src) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error('Shader compile error:', gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function createProgram(gl, vertSrc, fragSrc) {
  const vert = compileShader(gl, gl.VERTEX_SHADER, vertSrc);
  const frag = compileShader(gl, gl.FRAGMENT_SHADER, fragSrc);
  const prog = gl.createProgram();
  gl.attachShader(prog, vert);
  gl.attachShader(prog, frag);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error('Program link error:', gl.getProgramInfoLog(prog));
    return null;
  }
  return prog;
}

export default class BalatroLoader {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.opts = Object.assign({
      spinRotation: -2.0,
      spinSpeed:     7.0,
      offset:        [0.0, 0.0],
      color1:        '#ff4d00',   // portfolio orange
      color2:        '#001a14',   // deep cyan-tinted void
      color3:        '#050505',   // void
      contrast:      3.5,
      lighting:      0.4,
      spinAmount:    0.25,
      pixelFilter:   700.0,
      spinEase:      1.0,
      isRotate:      false,
      mouseInteraction: true,
    }, opts);

    this._raf = null;
    this._mouse = [0.5, 0.5];
    this._destroyed = false;

    this._init();
  }

  _init() {
    const canvas = this.canvas;
    const gl = canvas.getContext('webgl', { antialias: false, alpha: false });
    if (!gl) { console.warn('BalatroLoader: WebGL not available'); return; }
    this.gl = gl;

    const prog = createProgram(gl, VERT, FRAG);
    if (!prog) return;
    this.prog = prog;

    // Fullscreen triangle (covers NDC with a single triangle)
    // positions: covers [-1,3] x [-1,3] which fills the viewport
    const verts = new Float32Array([
      -1, -1,  0, 0,
       3, -1,  2, 0,
      -1,  3,  0, 2,
    ]);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);

    const posLoc = gl.getAttribLocation(prog, 'position');
    const uvLoc  = gl.getAttribLocation(prog, 'uv');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(uvLoc);
    gl.vertexAttribPointer(uvLoc,  2, gl.FLOAT, false, 16, 8);

    // Cache uniform locations
    this._u = {};
    const names = ['iTime','iResolution','uSpinRotation','uSpinSpeed','uOffset',
      'uColor1','uColor2','uColor3','uContrast','uLighting','uSpinAmount',
      'uPixelFilter','uSpinEase','uIsRotate','uMouse'];
    for (const n of names) this._u[n] = gl.getUniformLocation(prog, n);

    this._resize();
    window.addEventListener('resize', this._onResize = () => this._resize());
    if (this.opts.mouseInteraction) {
      canvas.addEventListener('mousemove', this._onMouse = (e) => {
        const r = canvas.getBoundingClientRect();
        this._mouse = [
          (e.clientX - r.left) / r.width,
          1.0 - (e.clientY - r.top) / r.height,
        ];
      });
    }

    this._loop(0);
  }

  _resize() {
    const canvas = this.canvas;
    const dpr = Math.min(window.devicePixelRatio, 2);
    canvas.width  = canvas.offsetWidth  * dpr;
    canvas.height = canvas.offsetHeight * dpr;
    if (this.gl) this.gl.viewport(0, 0, canvas.width, canvas.height);
  }

  _loop(ms) {
    if (this._destroyed) return;
    this._raf = requestAnimationFrame((t) => this._loop(t));

    const gl = this.gl;
    const u  = this._u;
    const o  = this.opts;
    const t  = ms * 0.001;

    gl.useProgram(this.prog);
    gl.uniform1f(u.iTime, t);
    gl.uniform3f(u.iResolution, gl.canvas.width, gl.canvas.height, gl.canvas.width / gl.canvas.height);
    gl.uniform1f(u.uSpinRotation, o.spinRotation);
    gl.uniform1f(u.uSpinSpeed,    o.spinSpeed);
    gl.uniform2f(u.uOffset,       o.offset[0], o.offset[1]);
    gl.uniform4fv(u.uColor1, hexToVec4(o.color1));
    gl.uniform4fv(u.uColor2, hexToVec4(o.color2));
    gl.uniform4fv(u.uColor3, hexToVec4(o.color3));
    gl.uniform1f(u.uContrast,     o.contrast);
    gl.uniform1f(u.uLighting,     o.lighting);
    gl.uniform1f(u.uSpinAmount,   o.spinAmount);
    gl.uniform1f(u.uPixelFilter,  o.pixelFilter);
    gl.uniform1f(u.uSpinEase,     o.spinEase);
    gl.uniform1i(u.uIsRotate,     o.isRotate ? 1 : 0);
    gl.uniform2f(u.uMouse, this._mouse[0], this._mouse[1]);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  destroy() {
    this._destroyed = true;
    if (this._raf) cancelAnimationFrame(this._raf);
    window.removeEventListener('resize', this._onResize);
    if (this._onMouse) this.canvas.removeEventListener('mousemove', this._onMouse);
    if (this.gl) {
      this.gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
  }
}
