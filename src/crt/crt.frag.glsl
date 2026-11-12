precision highp float;
varying vec2 uv;
uniform sampler2D screen;
uniform sampler2D glowNear;
uniform sampler2D glowFar;
uniform vec2 resolution;
uniform vec4 raster;
uniform vec4 screenFrame;
uniform vec4 glowFrame;
uniform vec2 logical;
uniform float radius;
uniform float pixelRatio;
uniform float time;
uniform float curvature;
uniform float scanlines;
uniform float bloom;
uniform float noise;
uniform float vignette;
uniform float fault;
uniform float faultProgress;
uniform float warmup;
uniform float reduced;
uniform float contrast;
uniform float raw;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
vec3 decode(vec4 c) { return pow(c.rgb, vec3(2.2)); }
float roundedBox(vec2 p, vec2 halfSize, float r) {
  vec2 q = abs(p) - halfSize + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
// One raster line as the beam paints it. The spot widens with brightness and defocus, and
// the limited video bandwidth lets bright pixels trail slightly to the right.
vec3 scanline(float row, float x, float spread) {
  if (row < 0.0 || row > logical.y - 1.0) return vec3(0.0);
  vec2 p = vec2(x, (row + 0.5) / logical.y) * screenFrame.xy + screenFrame.zw;
  vec3 core = decode(texture2D(screen, p));
  vec2 d = vec2(spread * (0.8 + 0.6 * clamp(luma(core) * 2.5, 0.0, 1.0)) / logical.x * screenFrame.x, 0.0);
  return core * 0.46 +
    decode(texture2D(screen, p - d)) * 0.3 +
    decode(texture2D(screen, p + d)) * 0.18 +
    decode(texture2D(screen, p - d * 2.2)) * 0.06;
}
// Vertical beam profile. Brighter lines spread wider, and the profile is widened by the
// pixel footprint so fine rasters average out instead of producing moire.
float beam(float d, float light, float footprint, float defocus) {
  float sigma = mix(0.27, 0.42, clamp(light * 1.8, 0.0, 1.0)) * defocus;
  sigma = sqrt(sigma * sigma + footprint * footprint / 12.0);
  return exp(-0.5 * d * d / (sigma * sigma)) / (sigma * 2.5066283);
}
void main() {
  vec2 frag = vec2(uv.x, 1.0 - uv.y) * resolution;
  vec2 halfSize = 0.5 * resolution;
  vec2 center = frag - halfSize;
  if (raw > 0.5) {
    vec2 t = (frag - raster.xy) / raster.zw;
    bool inside = t.x >= 0.0 && t.y >= 0.0 && t.x <= 1.0 && t.y <= 1.0;
    gl_FragColor = inside ? vec4(texture2D(screen, t).rgb, 1.0) : vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }
  float motion = 1.0 - reduced;
  vec2 g = frag / resolution;
  // Barrel distortion across the raster, so rows and columns bow toward the tube edges.
  // While the tube warms up the high voltage is low and the picture is oversized.
  float settle = 1.0 - warmup;
  vec2 n = (frag - raster.xy - raster.zw * 0.5) / (raster.zw * 0.5);
  float r2 = dot(n, n);
  vec2 t = n * (1.0 + curvature * r2) / (1.0 + 0.05 * settle * settle) * 0.5 + 0.5;
  float line = floor(t.y * logical.y);
  float visible = 1.0;
  if (fault > 0.0) {
    if (reduced > 0.5) {
      t.x += step(0.6, sin(line * 0.038)) * fault * 0.006;
    } else if (t.x >= 0.0 && t.x <= 1.0) {
      // Lost horizontal sync: the line oscillator free-runs, each line starts a little later
      // than the one above, and the picture shears into wrapping bands split by the blanking gap.
      float shear = t.y * (1.4 - faultProgress * 0.9);
      float slip = faultProgress * 2.3 + sin(time * 19.0) * 0.04;
      float tremor = (hash(vec2(floor(line / 3.0), floor(time * 60.0))) - 0.5) * 0.007;
      float phase = mod(t.x + fault * (shear + slip + tremor), 1.18);
      visible = step(phase, 1.0);
      t.x = phase;
      visible *= 1.0 - step(1.0 - 0.1 * fault, hash(vec2(line, floor(time * 30.0) + 7.0)));
    }
  }
  // A tired line oscillator: each line wanders by a fraction of a pixel.
  t.x += (hash(vec2(line, floor(time * 12.0))) - 0.5) * 0.00016 * motion;
  // The spot loses focus toward the tube edge and while the tube is still warming up.
  float defocus = 1.0 + 0.16 * min(r2, 2.0) + settle * 1.8;
  float footprint = logical.y / raster.w;
  float scan = scanlines * smoothstep(0.8, 0.42, footprint) / defocus;
  float y = t.y * logical.y - 0.5;
  float row = floor(y);
  float f = y - row;
  float columns = smoothstep(-0.0015, 0.0, t.x) * smoothstep(1.0015, 1.0, t.x);
  vec3 upper = scanline(row, t.x, 0.5 * defocus) * columns;
  vec3 lower = scanline(row + 1.0, t.x, 0.5 * defocus) * columns;
  vec3 even = mix(upper, lower, f);
  vec3 traced = upper * beam(f, luma(upper), footprint, defocus) +
    lower * beam(1.0 - f, luma(lower), footprint, defocus);
  vec3 light = mix(even, traced, scan);
  // Phosphor bloom: a tight halo plus a wide diffuse glow that spills past the raster.
  vec2 glowAt = t * glowFrame.xy + glowFrame.zw;
  vec3 near = decode(texture2D(glowNear, glowAt));
  vec3 far = decode(texture2D(glowFar, glowAt));
  light += (near * 2.4 + far * 2.2) * bloom * vec3(1.0, 0.8, 0.62);
  // The beam never cuts off completely: the scanned area glows just above the bare glass,
  // revealing the raster's bowed outline and its line structure on an empty screen.
  float scanned = smoothstep(-0.006, 0.006, t.x) * smoothstep(1.006, 0.994, t.x) *
    smoothstep(-0.008, 0.008, t.y) * smoothstep(1.008, 0.992, t.y);
  float structure = mix(1.0, beam(f, 0.0, footprint, defocus) + beam(1.0 - f, 0.0, footprint, defocus), scan);
  light += vec3(0.0013, 0.00058, 0.00012) * scanned * structure * (1.0 - contrast * 0.8);
  // Supply ripple beating against the vertical refresh rolls a faint hum bar down the tube.
  float roll = fract(g.y * 0.8 - time * 0.07);
  light *= 1.0 + motion * (exp(-pow((roll - 0.5) * 6.0, 2.0)) * 0.035 + sin(g.y * 4.0 - time * 0.23) * 0.008);
  float power = pow(smoothstep(0.0, 1.0, warmup), 1.6);
  light *= visible * power * (1.0 - 0.3 * fault);
  // Unlit phosphor is never black: the glass returns a little warm room light. Its grain
  // scales with that light, so it lives in the dark areas and never sparkles on its own.
  float gr2 = dot(center, center) / dot(halfSize, halfSize);
  float seed = mod(floor(time * 24.0), 61.0) * motion;
  vec2 cell = floor(frag / max(pixelRatio, 1.0));
  float grain = hash(cell + seed * vec2(37.0, 17.0)) - 0.5;
  float mottle = hash(floor(cell / 3.0) + seed * vec2(11.0, 29.0)) - 0.5;
  vec3 glass = vec3(0.0042, 0.0035, 0.0028) * (0.4 + 0.85 * (1.0 - gr2)) * (1.0 - contrast * 0.7);
  vec3 color = light + glass * (1.0 + (grain + mottle * 0.6) * noise);
  // A faint reflection of the room on the curved glass, kept away from text brightness.
  vec2 sheen = (g - vec2(0.26, 0.1)) * vec2(1.3, 2.3);
  color += vec3(0.0075, 0.0078, 0.0085) * exp(-dot(sheen, sheen) * 2.6) * (1.0 - contrast);
  // Uneven vignette: the brightest point sits a little high and left of centre.
  vec2 v = (g - vec2(0.47, 0.44)) * vec2(1.0, 1.15);
  float shade = 1.04 - vignette * (dot(v, v) * 2.4 + (g.x - 0.5) * 0.08) * (1.0 - contrast * 0.5);
  // The tube darkens toward its rounded edge where it meets the bezel.
  float rim = smoothstep(0.0, 0.14 * resolution.y, -roundedBox(center, halfSize, radius));
  color *= mix(0.12, 1.0, rim) * shade;
  color *= 1.0 + contrast * 0.3;
  // Soft shoulder on the brightest channel keeps hot glyph cores from clipping or shifting hue.
  float peak = max(color.r, max(color.g, color.b));
  color *= (1.0 - exp(-peak * 1.45)) / max(peak, 1e-5);
  gl_FragColor = vec4(pow(max(color, vec3(0.0)), vec3(1.0 / 2.2)), 1.0);
}
