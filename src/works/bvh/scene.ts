// BVH 예제의 장면: 바닥 + 토러스 매듭 + 흩어진 구들. 전부 삼각형으로 만든다.
// 삼각형이 고르게 퍼져 있지 않아야 (큰 바닥, 촘촘한 매듭, 뭉친 작은 구) 분할 방식의 차이가 드러난다.

export interface Scene {
  /** 삼각형마다 9개 (v0, v1, v2 의 xyz) */
  positions: Float32Array
  /** 삼각형마다 재질 번호. 0 바닥, 1 매듭, 2 이상은 구 */
  materials: Float32Array
  triCount: number
}

type Vec3 = [number, number, number]

// 시드 고정 난수 (매번 같은 장면이 나오게)
function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** detail 1..5. 삼각형 수는 대략 detail² 에 비례한다. */
export function buildScene(detail: number): Scene {
  const pos: number[] = []
  const mat: number[] = []
  const tri = (a: Vec3, b: Vec3, c: Vec3, m: number) => {
    pos.push(...a, ...b, ...c)
    mat.push(m)
  }
  // 격자 (u, v) → 점 함수로 사각형 그물을 만들고 삼각형 둘씩으로 쪼갠다.
  const grid = (nu: number, nv: number, f: (u: number, v: number) => Vec3, m: number) => {
    for (let i = 0; i < nu; i++) {
      for (let j = 0; j < nv; j++) {
        const a = f(i / nu, j / nv)
        const b = f((i + 1) / nu, j / nv)
        const c = f((i + 1) / nu, (j + 1) / nv)
        const d = f(i / nu, (j + 1) / nv)
        tri(a, b, c, m)
        tri(a, c, d, m)
      }
    }
  }

  // 바닥: 큰 삼각형 2개
  const G = 7
  tri([-G, 0, -G], [G, 0, -G], [G, 0, G], 0)
  tri([-G, 0, -G], [G, 0, G], [-G, 0, G], 0)

  // 토러스 매듭 (2, 3). 중심선 주위로 관을 두른다.
  const knot = (t: number): Vec3 => {
    const a = t * Math.PI * 2
    const r = Math.cos(3 * a) + 2
    return [r * Math.cos(2 * a) * 0.55, r * Math.sin(2 * a) * 0.55 + 2.1, -Math.sin(3 * a) * 0.55]
  }
  const tube = 0.2
  grid(80 * detail, 8 * detail, (u, v) => {
    const p1 = knot(u)
    const p2 = knot(u + 0.001)
    // 접선 T, 그리고 T 에 수직인 두 축 N, B
    const T: Vec3 = [p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]]
    const S: Vec3 = [p2[0] + p1[0], p2[1] + p1[1] - 4.2, p2[2] + p1[2]]
    let B: Vec3 = [T[1] * S[2] - T[2] * S[1], T[2] * S[0] - T[0] * S[2], T[0] * S[1] - T[1] * S[0]]
    let N: Vec3 = [B[1] * T[2] - B[2] * T[1], B[2] * T[0] - B[0] * T[2], B[0] * T[1] - B[1] * T[0]]
    const bl = Math.hypot(...B)
    const nl = Math.hypot(...N)
    B = [B[0] / bl, B[1] / bl, B[2] / bl]
    N = [N[0] / nl, N[1] / nl, N[2] / nl]
    const c = Math.cos(v * Math.PI * 2) * tube
    const s = Math.sin(v * Math.PI * 2) * tube
    return [p1[0] + c * N[0] + s * B[0], p1[1] + c * N[1] + s * B[1], p1[2] + c * N[2] + s * B[2]]
  }, 1)

  // 구: 바닥에 흩어 놓은 큰 구 + 한쪽에 뭉쳐 놓은 작은 구
  const rand = mulberry32(7)
  const sphere = (cx: number, cy: number, cz: number, r: number, m: number) => {
    grid(8 * detail, 4 * detail, (u, v) => {
      const th = u * Math.PI * 2
      const ph = v * Math.PI
      return [cx + r * Math.sin(ph) * Math.cos(th), cy + r * Math.cos(ph), cz + r * Math.sin(ph) * Math.sin(th)]
    }, m)
  }
  for (let i = 0; i < 18; i++) {
    const ang = (i / 18) * Math.PI * 2 + rand() * 0.2
    const dist = 2.6 + rand() * 3
    const r = 0.25 + rand() * 0.4
    sphere(Math.cos(ang) * dist, r, Math.sin(ang) * dist, r, 2 + i)
  }
  for (let i = 0; i < 14; i++) {
    const r = 0.08 + rand() * 0.1
    sphere(3.2 + rand() * 1.4, r + rand() * 1.2, -3.4 + rand() * 1.4, r, 20 + i)
  }

  return { positions: new Float32Array(pos), materials: new Float32Array(mat), triCount: mat.length }
}
