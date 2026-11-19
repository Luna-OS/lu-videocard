/**
 * The fragment shaders of the enhancement pipeline (GLSL ES 3.00; the common header and the
 * vertex shader are in program.ts). Texture row 0 is the top of the picture everywhere, so
 * only the present pass flips.
 *
 * FSR 1.0 (EASU and RCAS) follows AMD's FidelityFX Super Resolution 1.0 algorithm, which is
 * MIT-licensed (© Advanced Micro Devices, Inc.); FXAA follows Timothy Lottes' FXAA 3.11 in its
 * widely used short form.
 */

const LUMA = `float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }`;

/** Copies a texture; u_flip = 1 turns it upside down (for the canvas). */
export const COPY = `
uniform sampler2D u_tex;
uniform int u_flip;
void main() {
  vec2 uv = v_uv;
  if (u_flip == 1) uv.y = 1.0 - uv.y;
  o_color = vec4(texture(u_tex, uv).rgb, 1.0);
}
`;

/** Spatial denoise: a 5×5 bilateral filter whose range grows with the strength. */
export const DENOISE = `
uniform sampler2D u_tex;
uniform vec2 u_texel;
uniform float u_strength;
${LUMA}
void main() {
  vec3 c = texture(u_tex, v_uv).rgb;
  float lc = luma(c);
  float sigmaR = mix(0.012, 0.10, u_strength);
  float invR = 1.0 / (2.0 * sigmaR * sigmaR);
  vec3 acc = vec3(0.0);
  float wsum = 0.0;
  for (int dy = -2; dy <= 2; dy++) {
    for (int dx = -2; dx <= 2; dx++) {
      vec3 s = texture(u_tex, v_uv + vec2(float(dx), float(dy)) * u_texel).rgb;
      float d = luma(s) - lc;
      float w = exp(-float(dx * dx + dy * dy) * 0.18) * exp(-d * d * invR);
      acc += s * w;
      wsum += w;
    }
  }
  o_color = vec4(acc / wsum, 1.0);
}
`;

/**
 * Temporal denoise: blends with the last frame where nothing moved (the difference of a 3×3
 * neighbourhood is small), never more than 90 % so the picture can't freeze.
 */
export const TEMPORAL = `
uniform sampler2D u_cur;
uniform sampler2D u_hist;
uniform vec2 u_texel;
uniform float u_strength;
uniform int u_hasHist;
${LUMA}
void main() {
  vec3 c = texture(u_cur, v_uv).rgb;
  if (u_hasHist == 0) { o_color = vec4(c, 1.0); return; }
  vec3 h = texture(u_hist, v_uv).rgb;
  float d = 0.0;
  for (int dy = -1; dy <= 1; dy++) {
    for (int dx = -1; dx <= 1; dx++) {
      vec2 off = vec2(float(dx), float(dy)) * u_texel;
      d += abs(luma(texture(u_cur, v_uv + off).rgb) - luma(texture(u_hist, v_uv + off).rgb));
    }
  }
  d /= 9.0;
  float thresh = mix(0.015, 0.07, u_strength);
  float w = u_strength * 0.9 * (1.0 - smoothstep(0.0, thresh, d));
  o_color = vec4(mix(c, h, w), 1.0);
}
`;

/** FSR 1.0 EASU: edge-adaptive upscaling from the input size to the output size. */
export const EASU = `
uniform sampler2D u_tex;
uniform vec2 u_inSize;
uniform vec2 u_outSize;

vec3 fetchC(ivec2 p) {
  p = clamp(p, ivec2(0), ivec2(u_inSize) - 1);
  return texelFetch(u_tex, p, 0).rgb;
}
float lum(vec3 c) { return c.r * 0.5 + c.g + c.b * 0.5; }

void easuSet(inout vec2 dir, inout float len, vec2 pp, bool biS, bool biT, bool biU, bool biV,
             float lA, float lB, float lC, float lD, float lE) {
  float w = 0.0;
  if (biS) w = (1.0 - pp.x) * (1.0 - pp.y);
  if (biT) w = pp.x * (1.0 - pp.y);
  if (biU) w = (1.0 - pp.x) * pp.y;
  if (biV) w = pp.x * pp.y;
  float dc = lD - lC;
  float cb = lC - lB;
  float lenX = max(abs(dc), abs(cb));
  lenX = 1.0 / max(lenX, 1e-5);
  float dirX = lD - lB;
  dir.x += dirX * w;
  lenX = clamp(abs(dirX) * lenX, 0.0, 1.0);
  lenX *= lenX;
  len += lenX * w;
  float ec = lE - lC;
  float ca = lC - lA;
  float lenY = max(abs(ec), abs(ca));
  lenY = 1.0 / max(lenY, 1e-5);
  float dirY = lE - lA;
  dir.y += dirY * w;
  lenY = clamp(abs(dirY) * lenY, 0.0, 1.0);
  lenY *= lenY;
  len += lenY * w;
}

void easuTap(inout vec3 aC, inout float aW, vec2 off, vec2 dir, vec2 len, float lob, float clp,
             vec3 c) {
  vec2 v = vec2(dot(off, dir), dot(off, vec2(-dir.y, dir.x)));
  v *= len;
  float d2 = min(dot(v, v), clp);
  float wB = 2.0 / 5.0 * d2 - 1.0;
  float wA = lob * d2 - 1.0;
  wB *= wB;
  wA *= wA;
  wB = 25.0 / 16.0 * wB - (25.0 / 16.0 - 1.0);
  float w = wB * wA;
  aC += c * w;
  aW += w;
}

void main() {
  vec2 pp = gl_FragCoord.xy * (u_inSize / u_outSize) - 0.5;
  vec2 fp = floor(pp);
  pp -= fp;
  ivec2 ip = ivec2(fp);
  vec3 b = fetchC(ip + ivec2(0, -1));
  vec3 c = fetchC(ip + ivec2(1, -1));
  vec3 e = fetchC(ip + ivec2(-1, 0));
  vec3 f = fetchC(ip + ivec2(0, 0));
  vec3 g = fetchC(ip + ivec2(1, 0));
  vec3 h = fetchC(ip + ivec2(2, 0));
  vec3 i = fetchC(ip + ivec2(-1, 1));
  vec3 j = fetchC(ip + ivec2(0, 1));
  vec3 k = fetchC(ip + ivec2(1, 1));
  vec3 l = fetchC(ip + ivec2(2, 1));
  vec3 n = fetchC(ip + ivec2(0, 2));
  vec3 o = fetchC(ip + ivec2(1, 2));
  float bL = lum(b), cL = lum(c), eL = lum(e), fL = lum(f), gL = lum(g), hL = lum(h);
  float iL = lum(i), jL = lum(j), kL = lum(k), lL = lum(l), nL = lum(n), oL = lum(o);

  vec2 dir = vec2(0.0);
  float len = 0.0;
  easuSet(dir, len, pp, true, false, false, false, bL, eL, fL, gL, jL);
  easuSet(dir, len, pp, false, true, false, false, cL, fL, gL, hL, kL);
  easuSet(dir, len, pp, false, false, true, false, fL, iL, jL, kL, nL);
  easuSet(dir, len, pp, false, false, false, true, gL, jL, kL, lL, oL);

  vec2 dir2 = dir * dir;
  float dirR = dir2.x + dir2.y;
  bool zro = dirR < (1.0 / 32768.0);
  dirR = inversesqrt(max(dirR, 1e-12));
  dirR = zro ? 1.0 : dirR;
  dir.x = zro ? 1.0 : dir.x;
  dir *= dirR;
  len = len * 0.5;
  len *= len;
  float stretch = dot(dir, dir) / max(abs(dir.x), abs(dir.y));
  vec2 len2 = vec2(1.0 + (stretch - 1.0) * len, 1.0 - 0.5 * len);
  float lob = 0.5 + ((1.0 / 4.0 - 0.04) - 0.5) * len;
  float clp = 1.0 / lob;

  vec3 min4 = min(min(f, g), min(j, k));
  vec3 max4 = max(max(f, g), max(j, k));
  vec3 aC = vec3(0.0);
  float aW = 0.0;
  easuTap(aC, aW, vec2(0.0, -1.0) - pp, dir, len2, lob, clp, b);
  easuTap(aC, aW, vec2(1.0, -1.0) - pp, dir, len2, lob, clp, c);
  easuTap(aC, aW, vec2(-1.0, 1.0) - pp, dir, len2, lob, clp, i);
  easuTap(aC, aW, vec2(0.0, 1.0) - pp, dir, len2, lob, clp, j);
  easuTap(aC, aW, vec2(0.0, 0.0) - pp, dir, len2, lob, clp, f);
  easuTap(aC, aW, vec2(-1.0, 0.0) - pp, dir, len2, lob, clp, e);
  easuTap(aC, aW, vec2(1.0, 1.0) - pp, dir, len2, lob, clp, k);
  easuTap(aC, aW, vec2(2.0, 1.0) - pp, dir, len2, lob, clp, l);
  easuTap(aC, aW, vec2(2.0, 0.0) - pp, dir, len2, lob, clp, h);
  easuTap(aC, aW, vec2(1.0, 0.0) - pp, dir, len2, lob, clp, g);
  easuTap(aC, aW, vec2(1.0, 2.0) - pp, dir, len2, lob, clp, o);
  easuTap(aC, aW, vec2(0.0, 2.0) - pp, dir, len2, lob, clp, n);
  vec3 pix = min(max4, max(min4, aC * (1.0 / aW)));
  o_color = vec4(pix, 1.0);
}
`;

/** FSR 1.0 RCAS: contrast-adaptive sharpening; u_sharp = exp2(-sharpness), 1 = strongest. */
export const RCAS = `
uniform sampler2D u_tex;
uniform vec2 u_size;
uniform float u_sharp;

vec3 fetchC(ivec2 p) {
  p = clamp(p, ivec2(0), ivec2(u_size) - 1);
  return texelFetch(u_tex, p, 0).rgb;
}

void main() {
  ivec2 ip = ivec2(gl_FragCoord.xy);
  vec3 b = fetchC(ip + ivec2(0, -1));
  vec3 d = fetchC(ip + ivec2(-1, 0));
  vec3 e = fetchC(ip);
  vec3 f = fetchC(ip + ivec2(1, 0));
  vec3 h = fetchC(ip + ivec2(0, 1));
  float bL = b.b * 0.5 + (b.r * 0.5 + b.g);
  float dL = d.b * 0.5 + (d.r * 0.5 + d.g);
  float eL = e.b * 0.5 + (e.r * 0.5 + e.g);
  float fL = f.b * 0.5 + (f.r * 0.5 + f.g);
  float hL = h.b * 0.5 + (h.r * 0.5 + h.g);
  // Noise detection: sharpen noise less.
  float nz = 0.25 * bL + 0.25 * dL + 0.25 * fL + 0.25 * hL - eL;
  float maxL = max(max(bL, dL), max(eL, max(fL, hL)));
  float minL = min(min(bL, dL), min(eL, min(fL, hL)));
  nz = clamp(abs(nz) / max(maxL - minL, 1e-5), 0.0, 1.0);
  nz = -0.5 * nz + 1.0;
  vec3 mn4 = min(min(b, d), min(f, h));
  vec3 mx4 = max(max(b, d), max(f, h));
  vec2 peakC = vec2(1.0, -4.0);
  vec3 hitMin = mn4 / (4.0 * max(mx4, vec3(1e-5)));
  vec3 hitMax = (peakC.x - mx4) / (4.0 * mn4 + peakC.y);
  vec3 lobeRGB = max(-hitMin, hitMax);
  float lobe = max(-0.1875, min(max(lobeRGB.r, max(lobeRGB.g, lobeRGB.b)), 0.0)) * u_sharp;
  lobe *= nz;
  vec3 pix = ((b + d + f + h) * lobe + e) / (4.0 * lobe + 1.0);
  o_color = vec4(pix, 1.0);
}
`;

/** FXAA 3.11 (short form) with an edge threshold, so flat areas stay untouched. */
export const FXAA = `
uniform sampler2D u_tex;
uniform vec2 u_texel;
${LUMA}
void main() {
  vec2 uv = v_uv;
  vec3 rgbNW = texture(u_tex, uv + vec2(-1.0, -1.0) * u_texel).rgb;
  vec3 rgbNE = texture(u_tex, uv + vec2(1.0, -1.0) * u_texel).rgb;
  vec3 rgbSW = texture(u_tex, uv + vec2(-1.0, 1.0) * u_texel).rgb;
  vec3 rgbSE = texture(u_tex, uv + vec2(1.0, 1.0) * u_texel).rgb;
  vec3 rgbM = texture(u_tex, uv).rgb;
  float lumaNW = luma(rgbNW), lumaNE = luma(rgbNE), lumaSW = luma(rgbSW), lumaSE = luma(rgbSE);
  float lumaM = luma(rgbM);
  float lumaMin = min(lumaM, min(min(lumaNW, lumaNE), min(lumaSW, lumaSE)));
  float lumaMax = max(lumaM, max(max(lumaNW, lumaNE), max(lumaSW, lumaSE)));
  if (lumaMax - lumaMin < max(0.0625, lumaMax * 0.125)) {
    o_color = vec4(rgbM, 1.0);
    return;
  }
  vec2 dir;
  dir.x = -((lumaNW + lumaNE) - (lumaSW + lumaSE));
  dir.y = ((lumaNW + lumaSW) - (lumaNE + lumaSE));
  float dirReduce = max((lumaNW + lumaNE + lumaSW + lumaSE) * (0.25 * (1.0 / 8.0)), 1.0 / 128.0);
  float rcpDirMin = 1.0 / (min(abs(dir.x), abs(dir.y)) + dirReduce);
  dir = min(vec2(8.0), max(vec2(-8.0), dir * rcpDirMin)) * u_texel;
  vec3 rgbA = 0.5 * (texture(u_tex, uv + dir * (1.0 / 3.0 - 0.5)).rgb +
                     texture(u_tex, uv + dir * (2.0 / 3.0 - 0.5)).rgb);
  vec3 rgbB = rgbA * 0.5 + 0.25 * (texture(u_tex, uv + dir * -0.5).rgb +
                                   texture(u_tex, uv + dir * 0.5).rgb);
  float lumaB = luma(rgbB);
  o_color = vec4((lumaB < lumaMin || lumaB > lumaMax) ? rgbA : rgbB, 1.0);
}
`;

/** A 4×4 box downsample (bilinear taps), for the HDR look's low-pass and the luma pyramid. */
export const DOWNSAMPLE = `
uniform sampler2D u_tex;
uniform vec2 u_texel;
void main() {
  vec3 c = texture(u_tex, v_uv + vec2(-1.0, -1.0) * u_texel).rgb +
           texture(u_tex, v_uv + vec2(1.0, -1.0) * u_texel).rgb +
           texture(u_tex, v_uv + vec2(-1.0, 1.0) * u_texel).rgb +
           texture(u_tex, v_uv + vec2(1.0, 1.0) * u_texel).rgb;
  o_color = vec4(c * 0.25, 1.0);
}
`;

/** Colour grading, the HDR look and the LUT, in one pass. */
export const COLOUR = `
uniform sampler2D u_tex;
uniform sampler2D u_low;
uniform sampler3D u_lut;
uniform int u_hasLut;
uniform float u_lutStrength;
uniform float u_lutSize;
uniform vec3 u_lutMin;
uniform vec3 u_lutMax;
uniform float u_hdr;
uniform float u_brightness;
uniform float u_contrast;
uniform float u_saturation;
uniform float u_vibrance;
uniform float u_gamma;
uniform float u_temperature;
uniform float u_tint;
${LUMA}
void main() {
  vec3 c = texture(u_tex, v_uv).rgb;
  if (u_hdr > 0.0) {
    // Local contrast (a wide unsharp mask) and a soft S-curve: deeper shadows, brighter lights.
    vec3 low = texture(u_low, v_uv).rgb;
    c += (c - low) * (1.1 * u_hdr);
    vec3 s = c * c * (3.0 - 2.0 * clamp(c, 0.0, 1.0));
    c = mix(c, s, 0.45 * u_hdr);
    c = clamp(c, 0.0, 1.0);
  }
  if (u_temperature != 0.0) {
    c *= vec3(1.0 + 0.14 * u_temperature, 1.0 + 0.03 * u_temperature, 1.0 - 0.14 * u_temperature);
  }
  if (u_tint != 0.0) {
    c *= vec3(1.0 + 0.06 * u_tint, 1.0 - 0.10 * u_tint, 1.0 + 0.06 * u_tint);
  }
  c = (c - 0.5) * u_contrast + 0.5 + u_brightness * 0.5;
  c = clamp(c, 0.0, 1.0);
  if (u_gamma != 1.0) c = pow(c, vec3(1.0 / u_gamma));
  float l = luma(c);
  if (u_vibrance != 1.0) {
    float sat = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
    c = mix(vec3(l), c, 1.0 + (u_vibrance - 1.0) * (1.0 - sat));
  }
  c = mix(vec3(l), c, u_saturation);
  c = clamp(c, 0.0, 1.0);
  if (u_hasLut == 1) {
    vec3 p = (c - u_lutMin) / (u_lutMax - u_lutMin);
    p = clamp(p, 0.0, 1.0) * ((u_lutSize - 1.0) / u_lutSize) + 0.5 / u_lutSize;
    vec3 g = texture(u_lut, p).rgb;
    c = mix(c, clamp(g, 0.0, 1.0), u_lutStrength);
  }
  o_color = vec4(c, 1.0);
}
`;

/** Luma of a picture, downsampled 2× (bilinear at the centre of each 2×2 group). */
export const LUMA_DOWN = `
uniform sampler2D u_tex;
${LUMA}
void main() {
  o_color = vec4(vec3(luma(texture(u_tex, v_uv).rgb)), 1.0);
}
`;

/**
 * Motion estimation for frame generation: symmetric block matching. For each block of the
 * frame in the middle (between the previous frame P and the current one C) it finds the vector
 * v with the smallest difference between P(x - v/2) and C(x + v/2), searching ±RADIUS around
 * the coarser level's vector. Vectors are stored as (v + 128) / 255 in rg, the match error in b.
 */
export const motionShader = (block: number, radius: number) => `
#define BLOCK ${block}
#define RADIUS ${radius}
uniform sampler2D u_prev;
uniform sampler2D u_cur;
uniform sampler2D u_coarse;
uniform int u_hasCoarse;
uniform vec2 u_size;
uniform float u_penalty;

float sad(vec2 base, vec2 v) {
  float s = 0.0;
  vec2 half_v = 0.5 * v;
  for (int y = 0; y < BLOCK; y++) {
    for (int x = 0; x < BLOCK; x++) {
      vec2 p = base + vec2(float(x), float(y)) + 0.5;
      s += abs(texture(u_prev, (p - half_v) / u_size).r - texture(u_cur, (p + half_v) / u_size).r);
    }
  }
  return s / float(BLOCK * BLOCK);
}

void main() {
  ivec2 blk = ivec2(gl_FragCoord.xy);
  vec2 base = vec2(blk * BLOCK);
  vec2 center = vec2(0.0);
  if (u_hasCoarse == 1) {
    vec4 cv = texelFetch(u_coarse, blk / 2, 0);
    center = floor((cv.rg * 255.0 - 128.0) * 2.0 + 0.5);
  }
  float best = 1e9;
  vec2 bestV = center;
  for (int dy = -RADIUS; dy <= RADIUS; dy++) {
    for (int dx = -RADIUS; dx <= RADIUS; dx++) {
      vec2 v = center + vec2(float(dx), float(dy));
      float s = sad(base, v) + length(v) * u_penalty;
      if (s < best) { best = s; bestV = v; }
    }
  }
  // Still prefers standing still when it is about as good.
  float zero = sad(base, vec2(0.0));
  if (zero <= best + u_penalty * 2.0) { best = zero; bestV = vec2(0.0); }
  bestV = clamp(bestV, -127.0, 127.0);
  o_color = vec4((bestV + 128.0) / 255.0, clamp(best * 4.0, 0.0, 1.0), 1.0);
}
`;

/** Vector refinement: each block takes the best of its own and its 8 neighbours' vectors. */
export const refineShader = (block: number) => `
#define BLOCK ${block}
uniform sampler2D u_prev;
uniform sampler2D u_cur;
uniform sampler2D u_vec;
uniform vec2 u_size;
uniform ivec2 u_vecSize;

float sad(vec2 base, vec2 v) {
  float s = 0.0;
  vec2 half_v = 0.5 * v;
  for (int y = 0; y < BLOCK; y++) {
    for (int x = 0; x < BLOCK; x++) {
      vec2 p = base + vec2(float(x), float(y)) + 0.5;
      s += abs(texture(u_prev, (p - half_v) / u_size).r - texture(u_cur, (p + half_v) / u_size).r);
    }
  }
  return s / float(BLOCK * BLOCK);
}

void main() {
  ivec2 blk = ivec2(gl_FragCoord.xy);
  vec2 base = vec2(blk * BLOCK);
  float best = 1e9;
  vec2 bestV = vec2(0.0);
  for (int dy = -1; dy <= 1; dy++) {
    for (int dx = -1; dx <= 1; dx++) {
      ivec2 nb = clamp(blk + ivec2(dx, dy), ivec2(0), u_vecSize - 1);
      vec2 v = texelFetch(u_vec, nb, 0).rg * 255.0 - 128.0;
      float s = sad(base, v) + (dx == 0 && dy == 0 ? 0.0 : 0.002);
      if (s < best) { best = s; bestV = v; }
    }
  }
  o_color = vec4((bestV + 128.0) / 255.0, clamp(best * 4.0, 0.0, 1.0), 1.0);
}
`;

/**
 * The generated frame: each pixel is the average of P and C pulled along half the motion
 * vector each way. Where the two don't agree (occlusions, wrong vectors) or the vector points
 * off the picture, it falls back to a plain blend of both frames – more so with higher
 * protection.
 */
export const INTERPOLATE = `
uniform sampler2D u_prev;
uniform sampler2D u_cur;
uniform sampler2D u_vec;
uniform vec2 u_size;
uniform vec2 u_vecScale;
uniform float u_level;
uniform float u_protect;
${LUMA}
void main() {
  vec2 uv = v_uv;
  vec4 vt = texture(u_vec, uv * u_vecScale);
  vec2 v = (vt.rg * 255.0 - 128.0) * u_level;
  vec2 d = 0.5 * v / u_size;
  vec2 pA = uv - d;
  vec2 pB = uv + d;
  vec3 a = texture(u_prev, pA).rgb;
  vec3 b = texture(u_cur, pB).rgb;
  vec3 warped = 0.5 * (a + b);
  vec3 blend = 0.5 * (texture(u_prev, uv).rgb + texture(u_cur, uv).rgb);
  float err = abs(luma(a) - luma(b));
  float lo = mix(0.10, 0.02, u_protect);
  float hi = mix(0.40, 0.12, u_protect);
  float w = smoothstep(lo, hi, err);
  w = max(w, smoothstep(0.35, 0.8, vt.b) * u_protect);
  bool inside = all(greaterThanEqual(pA, vec2(0.0))) && all(lessThanEqual(pA, vec2(1.0))) &&
                all(greaterThanEqual(pB, vec2(0.0))) && all(lessThanEqual(pB, vec2(1.0)));
  if (!inside) w = 1.0;
  o_color = vec4(mix(warped, blend, w), 1.0);
}
`;

/** The mean difference of two luma pictures over a 32×18 grid, into one pixel (for dedup). */
export const DIFF = `
uniform sampler2D u_prev;
uniform sampler2D u_cur;
void main() {
  float s = 0.0;
  for (int y = 0; y < 18; y++) {
    for (int x = 0; x < 32; x++) {
      vec2 uv = (vec2(float(x), float(y)) + 0.5) / vec2(32.0, 18.0);
      s += abs(texture(u_prev, uv).r - texture(u_cur, uv).r);
    }
  }
  s /= 576.0;
  o_color = vec4(min(1.0, s * 32.0), 0.0, 0.0, 1.0);
}
`;
