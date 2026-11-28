// BVH(Bounding Volume Hierarchy) 빌더. CPU에서 한 번 만들고 GPU 로 그대로 올린다.
//
// 노드 하나 = 32바이트 (셰이더의 struct Node 와 같은 배치)
//   f32 x3  AABB 최소점
//   u32     leftFirst : 내부 노드면 왼쪽 자식 번호(오른쪽은 +1), 리프면 첫 삼각형 번호
//   f32 x3  AABB 최대점
//   u32     count     : 리프면 삼각형 수, 내부 노드면 0

export const NODE_BYTES = 32
const BINS = 16 // SAH 후보 평면을 축마다 15개만 본다 (binned SAH)
const MAX_DEPTH = 40 // 셰이더 스택(48칸)을 넘지 않게 막는다

export interface Bvh {
  /** 노드 배열. 0번이 루트. */
  nodes: ArrayBuffer
  nodeCount: number
  leafCount: number
  maxDepth: number
  /** SAH 비용: 광선 하나가 이 트리에서 치를 것으로 기대되는 테스트 횟수 (작을수록 좋다). */
  sahCost: number
  /** 삼각형 재배열 순서. order[i] = i번째 자리에 올 원래 삼각형 번호. 리프는 연속 구간을 가리킨다. */
  order: Uint32Array
}

/** 상자의 겉넓이의 절반. 비율만 쓰므로 2배는 생략한다. */
const halfArea = (dx: number, dy: number, dz: number) => dx * dy + dy * dz + dz * dx

/**
 * @param tris     삼각형마다 9개 (v0, v1, v2 의 xyz)
 * @param useSah   true 면 SAH, false 면 가장 긴 축의 한가운데에서 자른다
 * @param leafMax  이 수 이하로 남으면 더 나누지 않는다
 */
export function buildBvh(tris: Float32Array, triCount: number, useSah: boolean, leafMax: number): Bvh {
  // 1) 삼각형마다 AABB 와 중심점을 미리 구한다. 분할은 중심점 기준, 상자는 AABB 기준.
  const tmin = new Float32Array(triCount * 3)
  const tmax = new Float32Array(triCount * 3)
  const cen = new Float32Array(triCount * 3)
  for (let t = 0; t < triCount; t++) {
    for (let a = 0; a < 3; a++) {
      const p0 = tris[t * 9 + a]!
      const p1 = tris[t * 9 + 3 + a]!
      const p2 = tris[t * 9 + 6 + a]!
      const lo = Math.min(p0, p1, p2)
      const hi = Math.max(p0, p1, p2)
      tmin[t * 3 + a] = lo
      tmax[t * 3 + a] = hi
      cen[t * 3 + a] = (lo + hi) * 0.5
    }
  }

  const order = new Uint32Array(triCount)
  for (let i = 0; i < triCount; i++) order[i] = i

  // 이진 트리이므로 노드는 많아야 2N-1 개.
  const nodes = new ArrayBuffer(Math.max(1, 2 * triCount - 1) * NODE_BYTES)
  const nf = new Float32Array(nodes)
  const nu = new Uint32Array(nodes)
  let nodeCount = 1
  let leafCount = 0
  let maxDepth = 0

  // SAH 용 작업 공간 (bin 마다 개수와 AABB)
  const binCount = new Uint32Array(BINS)
  const binMin = new Float32Array(BINS * 3)
  const binMax = new Float32Array(BINS * 3)
  const leftArea = new Float32Array(BINS)
  const leftCount = new Uint32Array(BINS)

  const subdivide = (node: number, first: number, count: number, depth: number): void => {
    if (depth > maxDepth) maxDepth = depth

    // 2) 이 노드의 AABB (삼각형 전체를 감쌈) 와 중심점들의 범위.
    const bmin = [Infinity, Infinity, Infinity]
    const bmax = [-Infinity, -Infinity, -Infinity]
    const cmin = [Infinity, Infinity, Infinity]
    const cmax = [-Infinity, -Infinity, -Infinity]
    for (let i = first; i < first + count; i++) {
      const t = order[i]! * 3
      for (let a = 0; a < 3; a++) {
        if (tmin[t + a]! < bmin[a]!) bmin[a] = tmin[t + a]!
        if (tmax[t + a]! > bmax[a]!) bmax[a] = tmax[t + a]!
        if (cen[t + a]! < cmin[a]!) cmin[a] = cen[t + a]!
        if (cen[t + a]! > cmax[a]!) cmax[a] = cen[t + a]!
      }
    }
    const o = node * 8
    nf[o] = bmin[0]!
    nf[o + 1] = bmin[1]!
    nf[o + 2] = bmin[2]!
    nf[o + 4] = bmax[0]!
    nf[o + 5] = bmax[1]!
    nf[o + 6] = bmax[2]!

    // 3) 충분히 작으면 리프.
    if (count <= leafMax || depth >= MAX_DEPTH) {
      nu[o + 3] = first
      nu[o + 7] = count
      leafCount++
      return
    }

    // 4) 어디서 자를지 고른다: (축, 그 축을 K 등분했을 때 몇 번째 경계).
    const ext = [cmax[0]! - cmin[0]!, cmax[1]! - cmin[1]!, cmax[2]! - cmin[2]!]
    const longest = ext[0]! >= ext[1]! && ext[0]! >= ext[2]! ? 0 : ext[1]! >= ext[2]! ? 1 : 2
    let axis = longest
    let bins = 2 // 중점 분할 = 2등분의 1번 경계
    let splitBin = 1

    if (useSah) {
      let best = Infinity
      for (let a = 0; a < 3; a++) {
        if (ext[a]! <= 0) continue
        // 삼각형을 중심점 위치에 따라 bin 에 넣는다.
        binCount.fill(0)
        binMin.fill(Infinity)
        binMax.fill(-Infinity)
        const scale = BINS / ext[a]!
        for (let i = first; i < first + count; i++) {
          const t = order[i]! * 3
          const b = Math.min(BINS - 1, Math.floor((cen[t + a]! - cmin[a]!) * scale))
          binCount[b]!++
          for (let k = 0; k < 3; k++) {
            if (tmin[t + k]! < binMin[b * 3 + k]!) binMin[b * 3 + k] = tmin[t + k]!
            if (tmax[t + k]! > binMax[b * 3 + k]!) binMax[b * 3 + k] = tmax[t + k]!
          }
        }
        // 왼쪽에서부터 누적한 (겉넓이, 개수) 를 적어 두고,
        let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity
        let n = 0
        for (let b = 0; b < BINS - 1; b++) {
          n += binCount[b]!
          x0 = Math.min(x0, binMin[b * 3]!); y0 = Math.min(y0, binMin[b * 3 + 1]!); z0 = Math.min(z0, binMin[b * 3 + 2]!)
          x1 = Math.max(x1, binMax[b * 3]!); y1 = Math.max(y1, binMax[b * 3 + 1]!); z1 = Math.max(z1, binMax[b * 3 + 2]!)
          leftCount[b] = n
          leftArea[b] = n > 0 ? halfArea(x1 - x0, y1 - y0, z1 - z0) : 0
        }
        // 오른쪽에서부터 누적하면서 경계마다 비용 = 넓이×개수 (왼쪽) + 넓이×개수 (오른쪽) 를 비교한다.
        x0 = y0 = z0 = Infinity
        x1 = y1 = z1 = -Infinity
        n = 0
        for (let b = BINS - 1; b >= 1; b--) {
          n += binCount[b]!
          x0 = Math.min(x0, binMin[b * 3]!); y0 = Math.min(y0, binMin[b * 3 + 1]!); z0 = Math.min(z0, binMin[b * 3 + 2]!)
          x1 = Math.max(x1, binMax[b * 3]!); y1 = Math.max(y1, binMax[b * 3 + 1]!); z1 = Math.max(z1, binMax[b * 3 + 2]!)
          const nl = leftCount[b - 1]!
          if (n === 0 || nl === 0) continue
          const cost = leftArea[b - 1]! * nl + halfArea(x1 - x0, y1 - y0, z1 - z0) * n
          if (cost < best) {
            best = cost
            axis = a
            bins = BINS
            splitBin = b
          }
        }
      }
    }

    // 5) 구간 [first, first+count) 를 제자리에서 둘로 나눈다 (퀵소트의 partition 과 같다).
    let mid = first
    if (ext[axis]! > 0) {
      const scale = bins / ext[axis]!
      const lo = cmin[axis]!
      let j = first + count - 1
      while (mid <= j) {
        const t = order[mid]!
        if (Math.min(bins - 1, Math.floor((cen[t * 3 + axis]! - lo) * scale)) < splitBin) mid++
        else {
          order[mid] = order[j]!
          order[j--] = t
        }
      }
    }
    // 한쪽이 비면 (중심점이 전부 겹치는 경우 등) 개수 기준으로 반씩 나눈다.
    if (mid === first || mid === first + count) {
      order.subarray(first, first + count).sort((p, q) => cen[p * 3 + longest]! - cen[q * 3 + longest]!)
      mid = first + (count >> 1)
    }

    // 6) 자식 둘을 나란히 만들고 재귀. 내부 노드는 count = 0.
    const left = nodeCount
    nodeCount += 2
    nu[o + 3] = left
    nu[o + 7] = 0
    subdivide(left, first, mid - first, depth + 1)
    subdivide(left + 1, mid, first + count - mid, depth + 1)
  }

  if (triCount > 0) subdivide(0, 0, triCount, 0)

  // SAH 비용: Σ (노드 넓이 / 루트 넓이) × (내부 노드면 1, 리프면 삼각형 수)
  const area = (n: number) => halfArea(nf[n * 8 + 4]! - nf[n * 8]!, nf[n * 8 + 5]! - nf[n * 8 + 1]!, nf[n * 8 + 6]! - nf[n * 8 + 2]!)
  const rootArea = area(0) || 1
  let sahCost = 0
  for (let n = 0; n < nodeCount; n++) sahCost += (area(n) / rootArea) * (nu[n * 8 + 7]! || 1)

  return { nodes, nodeCount, leafCount, maxDepth, sahCost, order }
}
