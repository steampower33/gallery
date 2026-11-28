// BVH(Bounding Volume Hierarchy) 로 삼각형 장면을 레이트레이싱하고, 트리 자체를 눈으로 본다.
//   scene.ts   장면(삼각형) 생성
//   bvh.ts     CPU 에서 BVH 만들기
//   trace.wgsl 프래그먼트 셰이더에서 BVH 탐색
// 설명 글: notes.html

import type { GpuContext, ParamDef, WorkMeta } from '../types'
import thumbnail from './thumbnail.svg'
import shaderCode from './trace.wgsl?raw'
import builderCode from './bvh.ts?raw'
import notesHtml from './notes.html?raw'
import { buildBvh } from './bvh'
import { buildScene } from './scene'

export const meta: WorkMeta = {
  title: 'BVH',
  description: '경계 상자 트리로 광선-삼각형 교차를 빠르게 찾기',
  thumbnail,
}

const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
export const notes = notesHtml
  .replace('{{builder}}', () => escapeHtml(builderCode.trim()))
  .replace('{{shader}}', () => escapeHtml(shaderCode.trim()))

const values = {
  split: 1, // 0 = 가장 긴 축의 중점, 1 = SAH
  leaf: 4, // 리프당 최대 삼각형 수
  detail: 3, // 장면 디테일. 삼각형 수는 detail² 에 비례
  boxDepth: 6, // 상자를 그릴 트리 깊이. 0 = 끔, 1 = 루트
  heat: 0, // 탐색 비용 히트맵 섞기
  heatMax: 200, // 히트맵 눈금
}

export const params: readonly ParamDef[] = [
  { key: 'boxDepth', label: '박스 표시 깊이 (0 끔 · 1 루트)', min: 0, max: 24, step: 1, value: values.boxDepth },
  { key: 'heat', label: '탐색 비용 히트맵', min: 0, max: 1, step: 0.05, value: values.heat },
  { key: 'heatMax', label: '히트맵 눈금 (테스트 횟수)', min: 50, max: 600, step: 10, value: values.heatMax },
  { key: 'split', label: '분할 방식 (0 중점 · 1 SAH)', min: 0, max: 1, step: 1, value: values.split },
  { key: 'leaf', label: '리프당 최대 삼각형', min: 1, max: 16, step: 1, value: values.leaf },
  { key: 'detail', label: '장면 디테일 (삼각형 수)', min: 1, max: 5, step: 1, value: values.detail },
]

// 트리를 다시 만들어야 하는 값들. setParam 에서는 표시만 하고 frame 에서 실제로 만든다.
const REBUILD_KEYS = new Set(['split', 'leaf', 'detail'])
let dirty = true

export function setParam(key: string, value: number): void {
  if (!(key in values)) return
  const k = key as keyof typeof values
  if (values[k] === value) return
  values[k] = value
  if (REBUILD_KEYS.has(key)) dirty = true
}

// 셰이더의 struct U 와 같은 순서 (80바이트).
const uniforms = new Float32Array(20)

let device: GPUDevice | null = null
let context: GPUCanvasContext | null = null
let canvas: HTMLCanvasElement | null = null
let pipeline: GPURenderPipeline | null = null
let uniformBuffer: GPUBuffer | null = null
let nodeBuffer: GPUBuffer | null = null
let triBuffer: GPUBuffer | null = null
let bindGroup: GPUBindGroup | null = null
let stats: HTMLDivElement | null = null

// 궤도 카메라. 끌기 전까지는 천천히 돈다.
const camera = { yaw: 0.6, pitch: 0.32, dist: 11, auto: true, lastTime: 0 }
const TARGET = [0, 1.5, 0] as const
let drag: { id: number; x: number; y: number } | null = null

function onPointerDown(e: PointerEvent) {
  drag = { id: e.pointerId, x: e.clientX, y: e.clientY }
  camera.auto = false
  canvas?.setPointerCapture(e.pointerId)
}
function onPointerMove(e: PointerEvent) {
  if (!drag || drag.id !== e.pointerId) return
  camera.yaw -= (e.clientX - drag.x) * 0.006
  camera.pitch = Math.max(-0.05, Math.min(1.5, camera.pitch + (e.clientY - drag.y) * 0.006))
  drag.x = e.clientX
  drag.y = e.clientY
}
function onPointerUp(e: PointerEvent) {
  if (drag?.id === e.pointerId) drag = null
}
function onWheel(e: WheelEvent) {
  e.preventDefault()
  camera.dist = Math.max(2, Math.min(30, camera.dist * Math.exp(e.deltaY * 0.001)))
}

/** 장면과 BVH 를 다시 만들어 GPU 로 올린다. */
function rebuild(): void {
  if (!device || !pipeline || !uniformBuffer) return
  const scene = buildScene(values.detail)
  const t0 = performance.now()
  const bvh = buildBvh(scene.positions, scene.triCount, values.split >= 0.5, values.leaf)
  const buildMs = performance.now() - t0

  // 삼각형을 BVH 순서로 다시 늘어놓는다. 리프는 (첫 번호, 개수) 만으로 자기 삼각형을 가리킬 수 있다.
  const triData = new Float32Array(scene.triCount * 12)
  for (let i = 0; i < scene.triCount; i++) {
    const src = bvh.order[i]!
    for (let v = 0; v < 3; v++) {
      triData[i * 12 + v * 4] = scene.positions[src * 9 + v * 3]!
      triData[i * 12 + v * 4 + 1] = scene.positions[src * 9 + v * 3 + 1]!
      triData[i * 12 + v * 4 + 2] = scene.positions[src * 9 + v * 3 + 2]!
    }
    triData[i * 12 + 3] = scene.materials[src]!
  }

  nodeBuffer?.destroy()
  triBuffer?.destroy()
  const usage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
  nodeBuffer = device.createBuffer({ size: bvh.nodeCount * 32, usage })
  triBuffer = device.createBuffer({ size: triData.byteLength, usage })
  device.queue.writeBuffer(nodeBuffer, 0, bvh.nodes, 0, bvh.nodeCount * 32)
  device.queue.writeBuffer(triBuffer, 0, triData)
  bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: uniformBuffer } },
      { binding: 1, resource: { buffer: nodeBuffer } },
      { binding: 2, resource: { buffer: triBuffer } },
    ],
  })

  if (stats) {
    const n = (x: number) => x.toLocaleString('en-US')
    stats.textContent =
      `삼각형 ${n(scene.triCount)} · 노드 ${n(bvh.nodeCount)} (리프 ${n(bvh.leafCount)}) · 최대 깊이 ${bvh.maxDepth}\n` +
      `SAH 비용 ${bvh.sahCost.toFixed(1)} · 빌드 ${buildMs.toFixed(0)} ms · ${values.split >= 0.5 ? 'SAH' : '중점'} 분할`
  }
}

export function init(c: HTMLCanvasElement, gpuDevice: GPUDevice, gpu: GpuContext): void {
  canvas = c
  device = gpuDevice
  context = gpu.context

  const module = device.createShaderModule({ code: shaderCode })
  pipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module, entryPoint: 'vs' },
    fragment: { module, entryPoint: 'fs', targets: [{ format: gpu.format }] },
  })
  uniformBuffer = device.createBuffer({
    size: uniforms.byteLength,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  })

  // 트리 통계를 보여 줄 작은 글자판. 캔버스 위에 얹고 dispose 에서 치운다.
  stats = document.createElement('div')
  stats.style.cssText =
    'position:absolute;left:12px;bottom:12px;z-index:1;padding:6px 10px;border-radius:8px;pointer-events:none;' +
    'white-space:pre-wrap;max-width:calc(100% - 24px);font-size:0.8rem;line-height:1.5;font-variant-numeric:tabular-nums;' +
    'color:#eee;background:rgba(20,20,20,0.82);border:1px solid #2c2c2c'
  c.parentElement?.appendChild(stats)

  c.style.touchAction = 'none'
  c.style.cursor = 'grab'
  c.addEventListener('pointerdown', onPointerDown)
  c.addEventListener('pointermove', onPointerMove)
  c.addEventListener('pointerup', onPointerUp)
  c.addEventListener('pointercancel', onPointerUp)
  c.addEventListener('wheel', onWheel, { passive: false })

  camera.yaw = 0.6
  camera.pitch = 0.32
  camera.dist = 11
  camera.auto = true
  camera.lastTime = 0
  dirty = true
}

export function frame(time: number): void {
  if (!device || !context || !canvas || !pipeline || !uniformBuffer) return
  if (dirty) {
    dirty = false
    rebuild()
  }
  if (!bindGroup) return

  if (camera.auto) camera.yaw += (time - camera.lastTime) * 0.12
  camera.lastTime = time

  // 궤도 카메라의 위치와 세 축
  const cp = Math.cos(camera.pitch)
  const fwd = [-Math.sin(camera.yaw) * cp, -Math.sin(camera.pitch), -Math.cos(camera.yaw) * cp] as const
  const pos = [TARGET[0] - fwd[0] * camera.dist, TARGET[1] - fwd[1] * camera.dist, TARGET[2] - fwd[2] * camera.dist]
  const rl = Math.hypot(fwd[2], fwd[0])
  const right = [-fwd[2] / rl, 0, fwd[0] / rl] as const // fwd × (0,1,0)
  const up = [
    right[1] * fwd[2] - right[2] * fwd[1],
    right[2] * fwd[0] - right[0] * fwd[2],
    right[0] * fwd[1] - right[1] * fwd[0],
  ]

  uniforms.set([...pos, values.boxDepth], 0)
  uniforms.set([...right, values.heat], 4)
  uniforms.set([...up, values.heatMax], 8)
  uniforms.set([...fwd, Math.tan((40 * Math.PI) / 360)], 12)
  uniforms.set([canvas.width, canvas.height], 16)
  device.queue.writeBuffer(uniformBuffer, 0, uniforms)

  const encoder = device.createCommandEncoder()
  const pass = encoder.beginRenderPass({
    colorAttachments: [
      {
        view: context.getCurrentTexture().createView(),
        clearValue: { r: 0, g: 0, b: 0, a: 1 },
        loadOp: 'clear',
        storeOp: 'store',
      },
    ],
  })
  pass.setPipeline(pipeline)
  pass.setBindGroup(0, bindGroup)
  pass.draw(3)
  pass.end()
  device.queue.submit([encoder.finish()])
}

export function dispose(): void {
  if (canvas) {
    canvas.removeEventListener('pointerdown', onPointerDown)
    canvas.removeEventListener('pointermove', onPointerMove)
    canvas.removeEventListener('pointerup', onPointerUp)
    canvas.removeEventListener('pointercancel', onPointerUp)
    canvas.removeEventListener('wheel', onWheel)
  }
  stats?.remove()
  stats = null
  drag = null
  device = null
  context = null
  canvas = null
  pipeline = null
  uniformBuffer = null
  nodeBuffer = null
  triBuffer = null
  bindGroup = null
}
