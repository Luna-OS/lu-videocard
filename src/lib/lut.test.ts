import { describe, expect, it } from "vitest";
import { lutName, parseCube } from "./lut";

const identity2 = `TITLE "Identity"
# a comment
LUT_3D_SIZE 2
DOMAIN_MIN 0.0 0.0 0.0
DOMAIN_MAX 1.0 1.0 1.0
0 0 0
1 0 0
0 1 0
1 1 0
0 0 1
1 0 1
0 1 1
1 1 1
`;

describe("parseCube", () => {
  it("reads a 3D cube", () => {
    const lut = parseCube(identity2);
    expect(lut.size).toBe(2);
    expect(lut.title).toBe("Identity");
    expect(Array.from(lut.data.slice(0, 6))).toEqual([0, 0, 0, 1, 0, 0]);
    expect(Array.from(lut.data.slice(21))).toEqual([1, 1, 1]);
  });

  it("complains about broken files", () => {
    expect(() => parseCube("LUT_1D_SIZE 2\n0 0 0\n1 1 1")).toThrow(/1D/);
    expect(() => parseCube("0 0 0")).toThrow(/LUT_3D_SIZE/);
    expect(() => parseCube("LUT_3D_SIZE 2\n0 0 0")).toThrow(/rows/);
    expect(() => parseCube("LUT_3D_SIZE 999")).toThrow(/size/);
    expect(() => parseCube("LUT_3D_SIZE 2\n0 0 x\n".repeat(1))).toThrow(/number/);
  });

  it("names a LUT after its file", () => {
    expect(lutName("C:\\LUTs\\Teal Orange.cube")).toBe("Teal Orange");
    expect(lutName("/home/luna/film.CUBE")).toBe("film");
  });
});
