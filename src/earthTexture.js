// Tekstur Bumi dari geografi dunia nyata (Natural Earth, domain publik), dipindahkan dari proyek Nasa.
// Garis pantai berasal dari data vektor di earthData.js dan dirasterisasi saat runtime menjadi
// tekstur ekuirektangular (x = bujur -180..180, y = lintang 90..-90). Hanya tekstur; bentuk bola tidak diubah.
import * as THREE from 'three';
import { EARTH_GLACIERS, EARTH_ICE_SHELVES, EARTH_LAKES, EARTH_LAND } from './earthData';
import { createRandom } from './utils/seededRandom';

export const EARTH_TEXTURE = { width: 1536, height: 768 };

/* ---------- noise 3D berseed (identik dengan proyek Nasa) ---------- */
const PERM_SIZE = 256;
const GRAD3 = [
  [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0], [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
  [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1],
];
const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);

const createNoise3D = (seed) => {
  const rng = createRandom(seed);
  const perm = Array.from({ length: PERM_SIZE }, (_, i) => i);
  for (let i = PERM_SIZE - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  const p = (i) => perm[i & (PERM_SIZE - 1)];
  const dot = (ix, iy, iz, x, y, z) => {
    const g = GRAD3[p(p(p(ix) + iy) + iz) % 12];
    return g[0] * x + g[1] * y + g[2] * z;
  };
  const lerp = (t, a, b) => a + t * (b - a);
  return (x, y, z) => {
    const x0 = Math.floor(x), y0 = Math.floor(y), z0 = Math.floor(z);
    const dx = x - x0, dy = y - y0, dz = z - z0;
    const u = fade(dx), v = fade(dy), w = fade(dz);
    return lerp(w,
      lerp(v, lerp(u, dot(x0, y0, z0, dx, dy, dz), dot(x0 + 1, y0, z0, dx - 1, dy, dz)),
        lerp(u, dot(x0, y0 + 1, z0, dx, dy - 1, dz), dot(x0 + 1, y0 + 1, z0, dx - 1, dy - 1, dz))),
      lerp(v, lerp(u, dot(x0, y0, z0 + 1, dx, dy, dz - 1), dot(x0 + 1, y0, z0 + 1, dx - 1, dy, dz - 1)),
        lerp(u, dot(x0, y0 + 1, z0 + 1, dx, dy - 1, dz - 1), dot(x0 + 1, y0 + 1, z0 + 1, dx - 1, dy - 1, dz - 1)))) * 1.15;
  };
};

const fbm3 = (noise, x, y, z, octaves = 4, lacunarity = 2.02, gain = 0.5) => {
  let amp = 1, freq = 1, sum = 0, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += noise(x * freq, y * freq, z * freq) * amp;
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm;
};

/* ---------- util warna ---------- */
const hex = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (a, b, x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const mix = (out, a, b, t) => {
  out[0] = a[0] + (b[0] - a[0]) * t;
  out[1] = a[1] + (b[1] - a[1]) * t;
  out[2] = a[2] + (b[2] - a[2]) * t;
};

/* ---------- rasterisasi data geografi ---------- */
// Cincin terkode (selisih, seperseratus derajat) → koordinat piksel bujur/lintang
const toPixelRing = (flat, w, h) => {
  const n = flat.length / 2;
  const out = new Float64Array(n * 2);
  let x = 0, y = 0;
  for (let i = 0; i < n; i++) {
    x += flat[i * 2];
    y += flat[i * 2 + 1];
    out[i * 2] = ((x / 100 + 180) / 360) * w;
    out[i * 2 + 1] = ((90 - y / 100) / 180) * h;
  }
  return out;
};

// Isi poligon (aturan genap-ganjil, mencakup lubang) pada grid w x h; 1 = di dalam
const rasterizeRings = (rings, w, h) => {
  const rows = Array.from({ length: h }, () => []);
  for (const flat of rings) {
    const p = toPixelRing(flat, w, h);
    const n = p.length / 2;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const x1 = p[i * 2], y1 = p[i * 2 + 1], x2 = p[j * 2], y2 = p[j * 2 + 1];
      if (y1 === y2) continue;
      const lo = Math.min(y1, y2), hi = Math.max(y1, y2);
      const r0 = Math.max(0, Math.ceil(lo - 0.5)), r1 = Math.min(h - 1, Math.ceil(hi - 0.5) - 1);
      for (let r = r0; r <= r1; r++) rows[r].push(x1 + ((r + 0.5 - y1) * (x2 - x1)) / (y2 - y1));
    }
  }
  const mask = new Uint8Array(w * h);
  for (let r = 0; r < h; r++) {
    const xs = rows[r].sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const a = Math.max(0, Math.ceil(xs[k] - 0.5)), b = Math.min(w - 1, Math.ceil(xs[k + 1] - 0.5) - 1);
      for (let x = a; x <= b; x++) mask[r * w + x] = 1;
    }
  }
  return mask;
};

// Blur kotak terpisah (bujur menyambung, lintang dijepit): pecahan daratan lokal 0-1
const blurMask = (mask, w, h, radius) => {
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  const norm = 1 / (2 * radius + 1);
  for (let y = 0; y < h; y++) {
    let sum = 0;
    for (let k = -radius; k <= radius; k++) sum += mask[y * w + ((k + w) % w)];
    for (let x = 0; x < w; x++) {
      tmp[y * w + x] = sum * norm;
      sum += mask[y * w + ((x + radius + 1) % w)] - mask[y * w + ((x - radius + w) % w)];
    }
  }
  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let k = -radius; k <= radius; k++) sum += tmp[Math.min(h - 1, Math.max(0, k)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = sum * norm;
      sum += tmp[Math.min(h - 1, y + radius + 1) * w + x] - tmp[Math.max(0, y - radius) * w + x];
    }
  }
  return out;
};

/* ---------- wilayah iklim kasar untuk gurun dan hutan hujan ---------- */
const DESERTS = [
  { lat: 23, lon: 10, ry: 8, rx: 28 }, { lat: 24, lon: 45, ry: 8, rx: 12 }, { lat: 41, lon: 100, ry: 5, rx: 16 },
  { lat: 27, lon: 71, ry: 4, rx: 4 }, { lat: -25, lon: 132, ry: 9, rx: 18 }, { lat: -24, lon: 20, ry: 6, rx: 8 },
  { lat: -23, lon: -69, ry: 8, rx: 2.5 }, { lat: -45, lon: -69, ry: 6, rx: 5 }, { lat: 37, lon: -115, ry: 5, rx: 6 },
  { lat: 30, lon: -107, ry: 4, rx: 6 }, { lat: 9, lon: 45, ry: 3, rx: 6 }, { lat: 33, lon: 55, ry: 5, rx: 8 },
];
const RAINFOREST = [
  { lat: -5, lon: -62, ry: 10, rx: 14 }, { lat: 0, lon: 22, ry: 6, rx: 10 }, { lat: 1, lon: 110, ry: 7, rx: 20 },
  { lat: 20, lon: 100, ry: 8, rx: 6 }, { lat: -18, lon: 47, ry: 6, rx: 2 }, { lat: 7, lon: -77, ry: 4, rx: 3 },
];
const regionWeight = (regions, lat, lon) => {
  let best = 0;
  for (const r of regions) {
    const d = Math.hypot((lat - r.lat) / r.ry, (lon - r.lon) / r.rx);
    if (d < 1.15) best = Math.max(best, 1 - smooth(0.55, 1.1, d));
  }
  return best;
};

const noise = createNoise3D(31415);
const f3 = (x, y, z, oct) => fbm3(noise, x, y, z, oct);

const DEEP = hex(0x06265a), SHALLOW = hex(0x2377b4), LAKE = hex(0x3a86bd);
const GREEN = hex(0x3a8638), FOREST = hex(0x24632c), RAIN = hex(0x14501f), SAVANNA = hex(0x9b9a48);
const TAIGA = hex(0x2a5330), TUNDRA = hex(0x8c9068), SAND = hex(0xcdb26b), ROCK = hex(0x86745a), SNOW = hex(0xf3f7f9);
const SEA_ICE = hex(0xe3eef4);

// Lukis piksel Bumi: { width, height, data(RGBA) }
export const paintEarth = (width = EARTH_TEXTURE.width, height = EARTH_TEXTURE.height) => {
  const m = {
    land: rasterizeRings(EARTH_LAND, width, height),
    lakes: rasterizeRings(EARTH_LAKES, width, height),
    glaciers: rasterizeRings(EARTH_GLACIERS, width, height),
    shelves: rasterizeRings(EARTH_ICE_SHELVES, width, height),
  };
  const coast = blurMask(m.land, width, height, Math.max(2, Math.round(width / 256)));
  const data = new Uint8ClampedArray(width * height * 4);
  const c = [0, 0, 0];
  const tmp = [0, 0, 0];
  for (let y = 0; y < height; y++) {
    const latDeg = 90 - ((y + 0.5) / height) * 180;
    const lat = (latDeg * Math.PI) / 180;
    const cl = Math.cos(lat), sl = Math.sin(lat);
    const al = Math.abs(latDeg);
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const lonDeg = ((x + 0.5) / width) * 360 - 180;
      const lon = (lonDeg * Math.PI) / 180;
      const px = cl * Math.cos(lon), pz = cl * Math.sin(lon);
      const isLand = m.land[i] === 1 && m.lakes[i] === 0;
      if (!isLand) {
        // Laut: gelap di tengah samudra, makin biru muda ke arah paparan benua; danau besar lebih terang
        if (m.lakes[i] === 1) mix(c, LAKE, SHALLOW, 0.3);
        else mix(c, DEEP, SHALLOW, smooth(0.02, 0.5, coast[i]) * 0.95 + 0.06 * noise(px * 3, sl * 3, pz * 3));
        // Es laut kutub: tutupan tidak beraturan di Arktik dan tepi Antarktika
        if (al > 62) {
          const edge = latDeg > 0 ? 76 + 4 * f3(px * 4 + 9, sl * 4, pz * 4, 3) : 67 + 3 * f3(px * 4 + 9, sl * 4, pz * 4, 3);
          mix(tmp, c, SEA_ICE, smooth(edge - 1.5, edge + 1.5, al) * 0.92);
        } else { tmp[0] = c[0]; tmp[1] = c[1]; tmp[2] = c[2]; }
        data[i * 4] = tmp[0]; data[i * 4 + 1] = tmp[1]; data[i * 4 + 2] = tmp[2];
        data[i * 4 + 3] = 255;
        continue;
      }
      const moist = f3(px * 3 + 20, sl * 3, pz * 3, 2);
      const relief = f3(px * 6 + 5, sl * 6, pz * 6, 2);
      // Batas iklim dibengkokkan noise agar tidak berbentuk elips atau pita lurus
      const wLat = latDeg + 7 * moist, wLon = lonDeg + 10 * relief, wAl = Math.abs(wLat);
      mix(c, GREEN, FOREST, smooth(-0.15, 0.2, moist));
      // Tropis kering (sabana) di sabuk lintang rendah-menengah
      mix(c, c.slice(), SAVANNA, smooth(5, 14, wAl) * (1 - smooth(22, 33, wAl)) * smooth(-0.1, 0.25, -moist));
      mix(c, c.slice(), RAIN, regionWeight(RAINFOREST, wLat, wLon) * 0.9);
      // Hutan boreal (taiga) lalu tundra ke arah kutub
      mix(c, c.slice(), TAIGA, smooth(48, 56, wAl) * (1 - smooth(64, 70, wAl)));
      mix(c, c.slice(), TUNDRA, smooth(62, 71, wAl));
      // Gurun besar
      const desert = regionWeight(DESERTS, wLat, wLon);
      mix(c, c.slice(), SAND, desert * (0.55 + 0.4 * smooth(-0.2, 0.3, relief)));
      mix(c, c.slice(), ROCK, desert * smooth(0.25, 0.55, relief) * 0.6);
      // Pegunungan dan batuan terbuka
      mix(c, c.slice(), ROCK, smooth(0.28, 0.5, relief) * 0.45);
      // Es: gletser nyata, lapisan es, dan seluruh Antarktika
      if (m.glaciers[i] === 1 || m.shelves[i] === 1 || latDeg < -62) mix(c, c.slice(), SNOW, 0.9 + 0.1 * noise(px * 8, sl * 8, pz * 8));
      if (al > 78) mix(c, c.slice(), SNOW, smooth(78, 83, al) * 0.7);
      data[i * 4] = c[0]; data[i * 4 + 1] = c[1]; data[i * 4 + 2] = c[2];
      data[i * 4 + 3] = 255;
    }
  }
  return { width, height, data };
};

// Tekstur three.js siap pakai untuk material Bumi
export const createEarthTexture = () => {
  const { width, height, data } = paintEarth();
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.putImageData(new ImageData(data, width, height), 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
};
