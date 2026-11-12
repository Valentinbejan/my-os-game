import vertex from './crt.vert.glsl?raw';
import fragment from './crt.frag.glsl?raw';
import { crtDefaults, type CrtPreset } from './presets';
import type { Settings } from '../game/types';
/** Logical VGA text raster: 80x25 cells of 9x16 pixels. */
const RASTER = { width: 720, height: 400 };
const persistenceShader = `precision highp float;
varying vec2 uv;
uniform sampler2D currentFrame;
uniform sampler2D previousFrame;
uniform float decay;
void main() {
 vec3 current = texture2D(currentFrame,uv).rgb;
 vec3 previous = pow(texture2D(previousFrame,uv).rgb,vec3(2.2));
 // Subtract one storage step so RGBA8 rounding cannot retain a permanent ghost.
 vec3 trail=max(pow(previous*decay,vec3(1.0/2.2))-vec3(1.0/255.0),vec3(0.0));
 gl_FragColor=vec4(max(current,trail),1.0);
}`;
// Sampling a linear texture at the shared corner of a 2x2 block averages all four texels.
// The first reduction also adds a black border so glow can fall off past the raster edge.
const downsampleShader = `precision highp float;
varying vec2 uv;
uniform sampler2D image;
uniform vec4 frame;
void main() {
 vec2 p = uv * frame.xy + frame.zw;
 float inside = step(0.0, p.x) * step(0.0, p.y) * step(p.x, 1.0) * step(p.y, 1.0);
 gl_FragColor = vec4(texture2D(image, p).rgb * inside, 1.0);
}`;
/** Border added around the glow chain, in half-resolution texels. */
const GLOW_PAD = 32;
/** Time for the tube to reach full brightness and focus after power-on, in milliseconds. */
const WARM_UP = 2400;
const smoothstep = (from: number, to: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - from) / (to - from)));
  return t * t * (3 - 2 * t);
};
// Nine-tap Gaussian folded into five linear fetches.
const blurShader = `precision highp float;
varying vec2 uv;
uniform sampler2D image;
uniform vec2 direction;
void main() {
 vec3 c = texture2D(image, uv).rgb * 0.2270270;
 c += (texture2D(image, uv + direction * 1.3846154).rgb + texture2D(image, uv - direction * 1.3846154).rgb) * 0.3162162;
 c += (texture2D(image, uv + direction * 3.2307692).rgb + texture2D(image, uv - direction * 3.2307692).rgb) * 0.0702703;
 gl_FragColor = vec4(c, 1.0);
}`;
type Uniform = number | readonly number[];
interface Pass {
  program: WebGLProgram;
  uniforms: Map<string, WebGLUniformLocation | null>;
}
interface Target {
  texture: WebGLTexture;
  framebuffer: WebGLFramebuffer;
  width: number;
  height: number;
}
export interface RasterRect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export class CrtRenderer {
  private gl: WebGLRenderingContext | null;
  /** Without WebGL the plane is drawn as it is, with no tube: plain, but playable. */
  private flat: CanvasRenderingContext2D | null = null;
  private buffer?: WebGLBuffer;
  private present?: Pass;
  private persist?: Pass;
  private downsample?: Pass;
  private blur?: Pass;
  private source?: WebGLTexture;
  private history: Target[] = [];
  private chain: Target[] = [];
  private index = 0;
  private last = 0;
  private lost = false;
  private size = '';
  private radius = 0;
  private rasterPx = [0, 0, 1, 1];
  private ratio = 1;
  private poweredAt = -1;
  private faultStart = 0;
  private faultEnd = 0;
  preset: CrtPreset = { ...crtDefaults };
  status = 'CRT ACTIVE';
  /** Where the 4:3 character raster sits on the page, in CSS pixels. */
  raster: RasterRect = { x: 0, y: 0, width: 0, height: 0 };
  constructor(
    private canvas: HTMLCanvasElement,
    private planeWidth: number,
    private planeHeight: number,
  ) {
    this.gl = canvas.getContext('webgl', {
      alpha: false,
      antialias: false,
      powerPreference: 'low-power',
      preserveDrawingBuffer: true,
    });
    if (!this.gl) {
      this.flat = canvas.getContext('2d');
      this.status = this.flat ? 'PLAIN DISPLAY' : 'CRT UNAVAILABLE';
      return;
    }
    canvas.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      this.lost = true;
      this.status = 'DISPLAY RECOVERY REQUIRED';
    });
    canvas.addEventListener('webglcontextrestored', () => {
      this.lost = false;
      this.poweredAt = -1;
      this.initialize();
      this.status = 'CRT ACTIVE';
    });
    this.initialize();
  }
  private initialize() {
    const gl = this.gl!;
    this.buffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const makePass = (source: string): Pass => {
      const program = gl.createProgram()!;
      for (const [type, code] of [
        [gl.VERTEX_SHADER, vertex],
        [gl.FRAGMENT_SHADER, source],
      ] as const) {
        const shader = gl.createShader(type)!;
        gl.shaderSource(shader, code);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
          throw new Error(gl.getShaderInfoLog(shader) || 'Shader compile failure');
        gl.attachShader(program, shader);
        gl.deleteShader(shader);
      }
      gl.bindAttribLocation(program, 0, 'position');
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('CRT link failure');
      return { program, uniforms: new Map() };
    };
    this.present = makePass(fragment);
    this.persist = makePass(persistenceShader);
    this.downsample = makePass(downsampleShader);
    this.blur = makePass(blurShader);
    const texture = (width: number, height: number) => {
      const t = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      return t;
    };
    const target = (divisor: number, padded = false): Target => {
      const pad = padded ? (GLOW_PAD * 4) / divisor : 0;
      const width = Math.round(this.planeWidth / divisor + pad),
        height = Math.round(this.planeHeight / divisor + pad);
      const t = texture(width, height);
      const framebuffer = gl.createFramebuffer()!;
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      return { texture: t, framebuffer, width, height };
    };
    this.source = texture(this.planeWidth, this.planeHeight);
    this.history = [target(1), target(1)];
    // Half, quarter, near glow (two), eighth, sixteenth, far glow (two).
    this.chain = [2, 4, 4, 4, 8, 16, 16, 16].map((divisor) => target(divisor, true));
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.size = '';
  }
  private run(
    pass: Pass,
    output: Target | null,
    textures: Record<string, WebGLTexture>,
    values: Record<string, Uniform> = {},
  ) {
    const gl = this.gl!;
    const location = (name: string) => {
      if (!pass.uniforms.has(name))
        pass.uniforms.set(name, gl.getUniformLocation(pass.program, name));
      return pass.uniforms.get(name)!;
    };
    gl.useProgram(pass.program);
    gl.bindFramebuffer(gl.FRAMEBUFFER, output ? output.framebuffer : null);
    gl.viewport(
      0,
      0,
      output ? output.width : this.canvas.width,
      output ? output.height : this.canvas.height,
    );
    Object.entries(textures).forEach(([name, texture], unit) => {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform1i(location(name), unit);
    });
    for (const [name, value] of Object.entries(values)) {
      if (typeof value === 'number') gl.uniform1f(location(name), value);
      else if (value.length === 2) gl.uniform2f(location(name), value[0], value[1]);
      else gl.uniform4f(location(name), value[0], value[1], value[2], value[3]);
    }
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
  private resize() {
    const rect = this.canvas.getBoundingClientRect();
    // Cap the backing store so very large or dense displays stay within an integrated GPU budget.
    const ratio = Math.min(
      window.devicePixelRatio || 1,
      2,
      Math.sqrt(4.5e6 / Math.max(1, rect.width * rect.height)),
    );
    const width = Math.max(1, Math.round(rect.width * ratio)),
      height = Math.max(1, Math.round(rect.height * ratio));
    const key = [width, height, rect.left, rect.top].join();
    if (key === this.size) return;
    this.size = key;
    this.ratio = ratio;
    this.canvas.width = width;
    this.canvas.height = height;
    const style = this.canvas.parentElement && getComputedStyle(this.canvas.parentElement);
    this.radius = (parseFloat(style?.borderTopLeftRadius || '0') || 0) * ratio;
    // The 80x25 raster keeps its 4:3 tube geometry and is centred on whatever glass the window allows.
    const h = Math.min(height * 0.9, width * 0.93 * 0.75),
      w = (h * 4) / 3;
    this.rasterPx = [(width - w) / 2, (height - h) / 2, w, h];
    this.raster = {
      x: rect.left + this.rasterPx[0] / ratio,
      y: rect.top + this.rasterPx[1] / ratio,
      width: w / ratio,
      height: h / ratio,
    };
  }
  /** The supply dipped: the tube warms up again from dark, as at power-on. */
  rewarm() {
    this.poweredAt = -1;
  }
  /** Loses horizontal sync for `duration` milliseconds, then relocks. */
  fault(duration: number) {
    this.faultStart = performance.now();
    this.faultEnd = this.faultStart + duration;
  }
  /** The plane on a black screen, scaled into the raster; a fault still shakes it. */
  private drawFlat(context: CanvasRenderingContext2D, plane: HTMLCanvasElement, now: number) {
    this.resize();
    const { width, height } = this.canvas;
    context.fillStyle = '#050403';
    context.fillRect(0, 0, width, height);
    const [x, y, w, h] = this.rasterPx;
    const faulting = now >= this.faultStart && now < this.faultEnd;
    const shift = faulting ? Math.sin(now / 23) * w * 0.02 : 0;
    context.imageSmoothingEnabled = true;
    context.drawImage(plane, x + shift, y, w, h);
  }
  draw(plane: HTMLCanvasElement, dirty: boolean, settings: Settings, now: number) {
    if (this.flat) return this.drawFlat(this.flat, plane, now);
    const gl = this.gl;
    if (!gl || this.lost || !this.present || !this.persist || !this.downsample || !this.blur)
      return;
    // Real elapsed time: after a pause (hidden window, stalled frame) the phosphor has fully
    // decayed, so no stale screen survives as an afterimage.
    const dt = Math.max(0.001, (now - this.last) / 1000);
    this.last = now;
    if (this.poweredAt < 0) this.poweredAt = now;
    const faultProgress =
      this.faultEnd > this.faultStart
        ? (now - this.faultStart) / (this.faultEnd - this.faultStart)
        : 1;
    const fault =
      faultProgress >= 0 && faultProgress < 1
        ? smoothstep(0, 0.12, faultProgress) * (1 - smoothstep(0.6, 1, faultProgress))
        : 0;
    if (dirty) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.source!);
      // Glyph edges carry coverage in alpha; premultiply so they fade instead of turning solid.
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, plane);
    }
    const next = 1 - this.index;
    this.run(
      this.persist,
      this.history[next],
      { currentFrame: this.source!, previousFrame: this.history[this.index].texture },
      {
        decay: settings.reducedFlicker
          ? 0
          : Math.exp(-dt / Math.max(0.001, this.preset.persistence)),
      },
    );
    this.index = next;
    const frame = this.history[this.index];
    const [half, quarter, nearA, nearB, eighth, sixteenth, farA, farB] = this.chain;
    const blur = (input: Target, via: Target, output: Target) => {
      this.run(this.blur!, via, { image: input.texture }, { direction: [1 / input.width, 0] });
      this.run(this.blur!, output, { image: via.texture }, { direction: [0, 1 / via.height] });
    };
    // Every padded level shares the same proportions, so one transform maps raster to glow space.
    const padded = [
      this.planeWidth / 2 / half.width,
      this.planeHeight / 2 / half.height,
      GLOW_PAD / half.width,
      GLOW_PAD / half.height,
    ];
    const identity = [1, 1, 0, 0];
    this.run(
      this.downsample,
      half,
      { image: frame.texture },
      { frame: [1 / padded[0], 1 / padded[1], -padded[2] / padded[0], -padded[3] / padded[1]] },
    );
    this.run(this.downsample, quarter, { image: half.texture }, { frame: identity });
    blur(quarter, nearA, nearB);
    this.run(this.downsample, eighth, { image: nearB.texture }, { frame: identity });
    this.run(this.downsample, sixteenth, { image: eighth.texture }, { frame: identity });
    blur(sixteenth, farA, farB);
    this.resize();
    // Small rasters read from the half-resolution copy so thin strokes do not alias away.
    const small = !this.preset.raw && this.rasterPx[2] < this.planeWidth * 0.75;
    this.run(
      this.present,
      null,
      {
        screen: (small ? half : frame).texture,
        glowNear: nearB.texture,
        glowFar: farB.texture,
      },
      {
        resolution: [this.canvas.width, this.canvas.height],
        raster: this.rasterPx,
        screenFrame: small ? padded : identity,
        glowFrame: padded,
        logical: [RASTER.width, RASTER.height],
        radius: this.radius,
        pixelRatio: this.ratio,
        time: now / 1000,
        curvature: this.preset.curvature,
        scanlines: this.preset.scanlines,
        bloom: settings.bloom,
        noise: this.preset.noise,
        vignette: this.preset.vignette,
        fault,
        faultProgress: Math.max(0, Math.min(1, faultProgress)),
        warmup: Math.min(1, (now - this.poweredAt) / WARM_UP),
        reduced: settings.reducedFlicker ? 1 : 0,
        contrast: settings.highContrast ? 1 : 0,
        raw: this.preset.raw ? 1 : 0,
      },
    );
  }
  dispose() {
    const gl = this.gl;
    if (!gl) return;
    for (const t of [...this.history, ...this.chain]) {
      gl.deleteTexture(t.texture);
      gl.deleteFramebuffer(t.framebuffer);
    }
    if (this.source) gl.deleteTexture(this.source);
    if (this.buffer) gl.deleteBuffer(this.buffer);
    for (const pass of [this.present, this.persist, this.downsample, this.blur])
      if (pass) gl.deleteProgram(pass.program);
  }
}
