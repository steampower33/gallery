// BVH 로 삼각형 장면을 레이트레이싱한다. 픽셀마다 광선 하나.
// 노드와 삼각형은 CPU(bvh.ts)에서 만들어 스토리지 버퍼로 올린 것이다.

struct U {
  camPos: vec3f,   boxDepth: f32,    // 박스 표시 깊이 (0 = 끔)
  camRight: vec3f, heat: f32,        // 히트맵 섞는 정도 0..1
  camUp: vec3f,    heatMax: f32,     // 히트맵에서 가장 뜨거운 색이 되는 테스트 횟수
  camFwd: vec3f,   tanHalfFov: f32,
  res: vec2f,      _pad: vec2f,
}

// 32바이트. bvh.ts 의 노드 배치와 같다.
struct Node {
  mn: vec3f, leftFirst: u32,  // 내부 노드: 왼쪽 자식 번호 (오른쪽은 +1) / 리프: 첫 삼각형 번호
  mx: vec3f, count: u32,      // 리프: 삼각형 수 / 내부 노드: 0
}

// 48바이트. v0.w 에 재질 번호.
struct Tri { v0: vec4f, v1: vec4f, v2: vec4f }

@group(0) @binding(0) var<uniform> u: U;
@group(0) @binding(1) var<storage, read> nodes: array<Node>;
@group(0) @binding(2) var<storage, read> tris: array<Tri>;

const INF = 1e30;
const STACK = 48u;

@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  let p = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
  return vec4f(p * 2.0 - 1.0, 0.0, 1.0);
}

// 광선-AABB 교차 (slab 방법). x, y, z 세 쌍의 평행한 면 사이를 지나는 구간을 구해 겹치는지 본다.
// 반환: (들어가는 t, 나가는 t). 빗나가면 들어가는 t 가 INF.
fn hitBox(mn: vec3f, mx: vec3f, ro: vec3f, inv: vec3f, tmax: f32) -> vec2f {
  let t1 = (mn - ro) * inv;
  let t2 = (mx - ro) * inv;
  let lo = min(t1, t2);
  let hi = max(t1, t2);
  let tn = max(max(lo.x, lo.y), lo.z);
  let tf = min(min(hi.x, hi.y), hi.z);
  if (tf >= max(tn, 0.0) && tn < tmax) { return vec2f(tn, tf); }
  return vec2f(INF, INF);
}

// 광선-삼각형 교차 (Möller–Trumbore). 빗나가면 INF.
fn hitTri(tr: Tri, ro: vec3f, rd: vec3f) -> f32 {
  let e1 = tr.v1.xyz - tr.v0.xyz;
  let e2 = tr.v2.xyz - tr.v0.xyz;
  let p = cross(rd, e2);
  let det = dot(e1, p);
  if (abs(det) < 1e-12) { return INF; }
  let f = 1.0 / det;
  let s = ro - tr.v0.xyz;
  let bu = f * dot(s, p);
  if (bu < 0.0 || bu > 1.0) { return INF; }
  let q = cross(s, e1);
  let bv = f * dot(rd, q);
  if (bv < 0.0 || bu + bv > 1.0) { return INF; }
  let t = f * dot(e2, q);
  if (t > 1e-4) { return t; }
  return INF;
}

struct Hit {
  t: f32,
  tri: u32,
  boxTests: u32,  // 상자 테스트 횟수
  triTests: u32,  // 삼각형 테스트 횟수
}

// BVH 탐색. 재귀 대신 직접 관리하는 스택을 쓴다 (셰이더에는 재귀가 없다).
// anyHit 이 true 면 아무거나 하나 맞는 즉시 끝낸다 (그림자 광선용).
fn trace(ro: vec3f, rd: vec3f, inv: vec3f, tmax: f32, anyHit: bool) -> Hit {
  var hit = Hit(tmax, 0xffffffffu, 1u, 0u);
  if (hitBox(nodes[0].mn, nodes[0].mx, ro, inv, hit.t).x == INF) { return hit; }

  var stack: array<u32, STACK>;
  var stackT: array<f32, STACK>;
  var sp = 0u;
  var cur = 0u;

  loop {
    let n = nodes[cur];
    if (n.count > 0u) {
      // 리프: 들어 있는 삼각형을 전부 검사한다.
      for (var i = 0u; i < n.count; i++) {
        let t = hitTri(tris[n.leftFirst + i], ro, rd);
        hit.triTests++;
        if (t < hit.t) {
          hit.t = t;
          hit.tri = n.leftFirst + i;
          if (anyHit) { return hit; }
        }
      }
    } else {
      // 내부 노드: 두 자식 상자를 검사하고, 가까운 쪽부터 내려간다.
      // 가까운 쪽에서 먼저 맞으면 hit.t 가 줄어들어 먼 쪽을 통째로 건너뛸 수 있다.
      var a = n.leftFirst;
      var b = a + 1u;
      var ta = hitBox(nodes[a].mn, nodes[a].mx, ro, inv, hit.t).x;
      var tb = hitBox(nodes[b].mn, nodes[b].mx, ro, inv, hit.t).x;
      hit.boxTests += 2u;
      if (tb < ta) {
        let ti = a; a = b; b = ti;
        let tt = ta; ta = tb; tb = tt;
      }
      if (ta < INF) {
        if (tb < INF && sp < STACK) {
          stack[sp] = b;
          stackT[sp] = tb;
          sp++;
        }
        cur = a;
        continue;
      }
    }
    // 스택에서 다음 노드를 꺼낸다. 넣어 둔 뒤로 더 가까운 교차를 찾았다면 버린다.
    var found = false;
    while (sp > 0u) {
      sp--;
      if (stackT[sp] < hit.t) {
        cur = stack[sp];
        found = true;
        break;
      }
    }
    if (!found) { break; }
  }
  return hit;
}

fn hue(h: f32) -> vec3f {
  return clamp(abs(fract(h + vec3f(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0) - 1.0, vec3f(0.0), vec3f(1.0));
}

fn hash1(x: u32) -> f32 {
  var v = x * 747796405u + 2891336453u;
  v = ((v >> ((v >> 28u) + 4u)) ^ v) * 277803737u;
  return f32((v >> 22u) ^ v) / 4294967295.0;
}

// 상자 표면 위의 점 p 가 모서리 근처인가. 세 축의 "면까지 거리" 중 둘이 작으면 모서리다.
fn edgeAt(p: vec3f, mn: vec3f, mx: vec3f, w: f32) -> f32 {
  let d = min(p - mn, mx - p);
  let lo = min(d.x, min(d.y, d.z));
  let hi = max(d.x, max(d.y, d.z));
  let mid = d.x + d.y + d.z - lo - hi;
  return 1.0 - smoothstep(w * 0.5, w * 1.5, mid);
}

// 깊이 depth 인 노드 (그보다 얕은 리프 포함) 의 상자를 선으로 그린다. 반환: (색, 불투명도).
fn boxOverlay(ro: vec3f, rd: vec3f, inv: vec3f, tHit: f32, depth: u32, pixel: f32) -> vec4f {
  var acc = vec4f(0.0);
  var stack: array<u32, STACK>;  // 아래 24비트 = 노드 번호, 위 8비트 = 깊이
  var sp = 1u;
  stack[0] = 0u;
  while (sp > 0u) {
    sp--;
    let e = stack[sp];
    let idx = e & 0xffffffu;
    let d = e >> 24u;
    let n = nodes[idx];
    let tb = hitBox(n.mn, n.mx, ro, inv, INF);
    if (tb.x == INF) { continue; }
    if (d == depth || n.count > 0u) {
      let col = hue(hash1(idx));
      var a = 0.0;
      // 들어가는 점과 나가는 점. 물체 뒤에 가려진 부분은 그리지 않는다.
      if (tb.x > 0.0 && tb.x < tHit) { a = max(a, edgeAt(ro + rd * tb.x, n.mn, n.mx, tb.x * pixel)); }
      if (tb.y < tHit) { a = max(a, 0.6 * edgeAt(ro + rd * tb.y, n.mn, n.mx, tb.y * pixel)); }
      acc += vec4f(col * a, a);
    } else if (sp + 2u <= STACK) {
      stack[sp] = n.leftFirst | ((d + 1u) << 24u);
      stack[sp + 1u] = (n.leftFirst + 1u) | ((d + 1u) << 24u);
      sp += 2u;
    }
  }
  return vec4f(acc.rgb / max(acc.a, 1.0), min(acc.a, 1.0));
}

// 0..1 → 검정, 파랑, 청록, 노랑, 빨강, 흰색
fn heatColor(x: f32) -> vec3f {
  let t = clamp(x, 0.0, 1.0) * 5.0;
  var c = mix(vec3f(0.0, 0.0, 0.08), vec3f(0.1, 0.2, 0.9), clamp(t, 0.0, 1.0));
  c = mix(c, vec3f(0.0, 0.8, 0.8), clamp(t - 1.0, 0.0, 1.0));
  c = mix(c, vec3f(1.0, 0.9, 0.1), clamp(t - 2.0, 0.0, 1.0));
  c = mix(c, vec3f(1.0, 0.15, 0.05), clamp(t - 3.0, 0.0, 1.0));
  c = mix(c, vec3f(1.0), clamp(t - 4.0, 0.0, 1.0));
  return c;
}

// 0 이 섞인 방향은 1/0 이 되어 slab 계산에서 NaN 을 만들 수 있으니 살짝 밀어 둔다.
fn safeInv(rd: vec3f) -> vec3f {
  let eps = vec3f(1e-8);
  return 1.0 / select(rd, select(-eps, eps, rd >= vec3f(0.0)), abs(rd) < eps);
}

@fragment fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let ndc = (pos.xy - 0.5 * u.res) / (0.5 * u.res.y);
  let rd = normalize(u.camFwd + (ndc.x * u.camRight - ndc.y * u.camUp) * u.tanHalfFov);
  let ro = u.camPos;
  let inv = safeInv(rd);

  let hit = trace(ro, rd, inv, INF, false);

  let sun = normalize(vec3f(0.5, 0.9, 0.35));
  var col = mix(vec3f(0.55, 0.65, 0.8), vec3f(0.12, 0.2, 0.42), clamp(rd.y * 1.6 + 0.2, 0.0, 1.0));
  if (hit.tri != 0xffffffffu) {
    let tr = tris[hit.tri];
    let p = ro + rd * hit.t;
    var nrm = normalize(cross(tr.v1.xyz - tr.v0.xyz, tr.v2.xyz - tr.v0.xyz));
    if (dot(nrm, rd) > 0.0) { nrm = -nrm; }

    let m = tr.v0.w;
    var albedo = vec3f(0.85, 0.8, 0.72);
    if (m < 0.5) {
      let c = floor(p.xz);
      albedo = mix(vec3f(0.32), vec3f(0.42), fract((c.x + c.y) * 0.5) * 2.0);
    } else if (m > 1.5) {
      albedo = mix(vec3f(0.9), hue(m * 0.137), 0.6);
    }

    // 그림자 광선: 교차점에서 해 방향으로 한 번 더 탐색한다.
    let sh = trace(p + nrm * 1e-3, sun, safeInv(sun), INF, true);
    let lit = select(1.0, 0.0, sh.tri != 0xffffffffu) * max(dot(nrm, sun), 0.0);
    col = albedo * (vec3f(1.0, 0.95, 0.85) * lit + vec3f(0.2, 0.25, 0.35) * (0.6 + 0.4 * nrm.y));
  }

  // 히트맵: 이 픽셀의 광선(1차 광선만)이 치른 상자 + 삼각형 테스트 횟수.
  let cost = f32(hit.boxTests + hit.triTests);
  col = mix(col, heatColor(cost / u.heatMax), u.heat);

  if (u.boxDepth >= 0.5) {
    let pixel = 2.0 * u.tanHalfFov / u.res.y * 1.3;
    let o = boxOverlay(ro, rd, inv, hit.t, u32(u.boxDepth) - 1u, pixel);
    col = mix(col, o.rgb, o.a * 0.9);
  }

  // 표시용 감마
  return vec4f(pow(clamp(col, vec3f(0.0), vec3f(1.0)), vec3f(1.0 / 2.2)), 1.0);
}
