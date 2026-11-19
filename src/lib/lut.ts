/**
 * Reads .cube colour look-up tables (the format DaVinci Resolve, Photoshop and most LUT packs use)
 * into the RGB float data a 3D texture takes.
 */

export interface Lut {
  /** Points per axis (17, 33, 65, …). */
  size: number;
  /** size³ × 3 floats, red fastest, then green, then blue – the order of the file. */
  data: Float32Array;
  /** The input range the table covers (DOMAIN_MIN/MAX), usually 0..1. */
  domainMin: [number, number, number];
  domainMax: [number, number, number];
  title: string;
}

/** The biggest table accepted: 129³ × 3 floats ≈ 25 MB. */
export const MAX_LUT_SIZE = 129;

export function parseCube(text: string): Lut {
  let size = 0;
  let title = "";
  const domainMin: [number, number, number] = [0, 0, 0];
  const domainMax: [number, number, number] = [1, 1, 1];
  let data: Float32Array | null = null;
  let count = 0;

  const triple = (parts: string[], what: string): [number, number, number] => {
    const v = parts.slice(1, 4).map(Number);
    if (v.length !== 3 || v.some((n) => !Number.isFinite(n))) {
      throw new Error(`Bad ${what} in the LUT.`);
    }
    return [v[0], v[1], v[2]];
  };

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const parts = line.split(/\s+/);
    const key = parts[0].toUpperCase();
    if (key === "TITLE") {
      title = line.slice(5).trim().replace(/^"|"$/g, "");
    } else if (key === "LUT_3D_SIZE") {
      size = Number(parts[1]);
      if (!Number.isInteger(size) || size < 2 || size > MAX_LUT_SIZE) {
        throw new Error(`Unsupported LUT size ${parts[1] ?? ""} (2–${MAX_LUT_SIZE} per axis).`);
      }
      data = new Float32Array(size * size * size * 3);
    } else if (key === "LUT_1D_SIZE") {
      throw new Error("1D LUTs aren't supported; use a 3D .cube LUT.");
    } else if (key === "DOMAIN_MIN") {
      const v = triple(parts, "DOMAIN_MIN");
      domainMin[0] = v[0];
      domainMin[1] = v[1];
      domainMin[2] = v[2];
    } else if (key === "DOMAIN_MAX") {
      const v = triple(parts, "DOMAIN_MAX");
      domainMax[0] = v[0];
      domainMax[1] = v[1];
      domainMax[2] = v[2];
    } else if (/^[-+.\d]/.test(key)) {
      if (!data) throw new Error("The LUT has colour data before LUT_3D_SIZE.");
      if (parts.length < 3) throw new Error("A LUT row doesn't have three values.");
      if (count * 3 + 3 > data.length) throw new Error("The LUT has more rows than its size says.");
      const r = Number(parts[0]);
      const g = Number(parts[1]);
      const b = Number(parts[2]);
      if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) {
        throw new Error("A LUT row isn't a number.");
      }
      data[count * 3] = r;
      data[count * 3 + 1] = g;
      data[count * 3 + 2] = b;
      count++;
    }
    // Other keywords are ignored.
  }
  if (!data) throw new Error("Not a 3D .cube LUT (LUT_3D_SIZE is missing).");
  if (count !== size * size * size) {
    throw new Error(`The LUT has ${count} rows but its size needs ${size * size * size}.`);
  }
  for (let i = 0; i < 3; i++) {
    if (!(domainMax[i] > domainMin[i])) throw new Error("The LUT's domain is empty.");
  }
  return { size, data, domainMin, domainMax, title };
}

/** The file name without folder and extension, for the settings. */
export function lutName(path: string): string {
  const base = path.split(/[\\/]/).pop() ?? path;
  return base.replace(/\.cube$/i, "");
}
