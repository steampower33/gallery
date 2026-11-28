// 신호 없는 아날로그 TV 화면 (static / snow).
// 노이즈는 (셀 x, 셀 y, 프레임 번호)를 정수 해시 pcg3d 에 넣어 만든다.

struct U {
  res: vec2f,
  time: f32,
  grain: f32,   // 알갱이 크기 (CSS px)
  scan: f32,    // 주사선 강도 0..1
  roll: f32,    // 굴러가는 띠 강도 0..1
  chroma: f32,  // 색 얼룩 0..1
  fps: f32,     // 노이즈 갱신 속도
  dpr: f32,
  jitter: f32,  // 줄 단위 가로 흔들림 0..1
  _pad: vec2f,
}
@group(0) @binding(0) var<uniform> u: U;

// 전체 화면을 덮는 삼각형 하나 (정점 버퍼 없음)
@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  let p = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
  return vec4f(p * 2.0 - 1.0, 0.0, 1.0);
}

// Jarzynski & Olano, "Hash Functions for GPU Rendering" (JCGT 2020)
fn pcg3d(v_in: vec3u) -> vec3u {
  var v = v_in * 1664525u + 1013904223u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  v ^= v >> vec3u(16u);
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  return v;
}

// 정수 셀 좌표 → 0..1 난수 3개. 음수 좌표가 u32 변환에서 0으로 고정되지 않게 오프셋을 더한다.
fn rand3(c: vec2f, seed: u32) -> vec3f {
  let h = pcg3d(vec3u(vec2u(c + 65536.0), seed));
  return vec3f(h) / 4294967295.0;
}

@fragment fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let frame = u32(floor(u.time * u.fps));
  let uv = pos.xy / u.res;
  let cell = max(1.0, u.grain * u.dpr);

  // 줄(주사선) 번호와 줄 단위 가로 흔들림 (수평 동기 상실)
  let line = floor(pos.y / cell);
  let lj = rand3(vec2f(0.0, line), frame ^ 0x68e31da4u).x;
  let shift = (lj - 0.5) * u.jitter * 24.0 * u.dpr;

  // 알갱이: 가로로 1.6배 넓게 (아날로그 대역폭 번짐 흉내)
  let c = vec2f(floor((pos.x + shift) / (cell * 1.6)), line);

  // 균일 난수 3개 평균 → 가우시안에 가까운 분포, 대비를 다시 늘림
  let r = rand3(c, frame);
  var n = (r.x + r.y + r.z) / 3.0;
  n = clamp((n - 0.5) * 2.4 + 0.5, 0.0, 1.0);

  // 아주 약한 색 얼룩 (color killer 때문에 기본은 거의 흑백)
  let rc = rand3(c, frame ^ 0x9e3779b9u) - 0.5;
  var col = vec3f(n) + rc * u.chroma * 0.5;

  // 주사선
  let s = 0.5 + 0.5 * cos(pos.y / cell * 3.14159265);
  col *= mix(1.0, 0.55 + 0.45 * s, u.scan);

  // 굴러가는 띠 (수직 동기 상실)
  let rb = fract(uv.y + u.time * 0.12);
  let bar = smoothstep(0.0, 0.06, rb) * (1.0 - smoothstep(0.06, 0.3, rb));
  col *= 1.0 + u.roll * (bar * 0.45 - 0.12);

  // 비네팅
  let d = uv - 0.5;
  col *= 1.0 - dot(d, d) * 1.1;

  return vec4f(clamp(col, vec3f(0.0), vec3f(1.0)), 1.0);
}
