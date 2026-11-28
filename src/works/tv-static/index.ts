// 신호 없는 아날로그 TV 화면. 전체 화면 삼각형 하나를 프래그먼트 셰이더로 칠한다.
// 설명 글: notes.html

import type { GpuContext, ParamDef, WorkMeta } from '../types'
import thumbnail from './thumbnail.svg'
import shaderCode from './static.wgsl?raw'
import notesHtml from './notes.html?raw'

export const meta: WorkMeta = {
  title: 'TV Static',
  description: '신호 없는 채널의 아날로그 TV 지지직 화면',
  thumbnail,
}

// 설명 글 안의 자리표시자를 실제 셰이더 코드로 바꾼다 (글과 코드가 어긋나지 않게).
const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
export const notes = notesHtml.replace('{{shader}}', () => escapeHtml(shaderCode.trim()))

// 현재 값. 셰이더의 struct U 로 올라간다.
const values = {
  grain: 1.5, // 알갱이 크기 (CSS px)
  scan: 0.35, // 주사선 강도
  roll: 0.5, // 굴러가는 띠 강도
  chroma: 0.1, // 색 얼룩
  fps: 30, // 노이즈 갱신 속도. 실제 TV 느낌은 30 근처
  jitter: 0.2, // 줄 단위 가로 흔들림
}

// 슬라이더로 조절할 수 있는 값들. 기본값은 위 values 의 처음 값이다.
export const params: readonly ParamDef[] = [
  { key: 'grain', label: '알갱이 크기 (CSS px)', min: 1, max: 6, step: 0.5, value: values.grain },
  { key: 'scan', label: '주사선 강도', min: 0, max: 1, step: 0.05, value: values.scan },
  { key: 'roll', label: '롤링 띠', min: 0, max: 1, step: 0.05, value: values.roll },
  { key: 'chroma', label: '색 얼룩', min: 0, max: 1, step: 0.05, value: values.chroma },
  { key: 'fps', label: '노이즈 FPS', min: 5, max: 60, step: 1, value: values.fps },
  { key: 'jitter', label: '가로 흔들림', min: 0, max: 1, step: 0.05, value: values.jitter },
]

export function setParam(key: string, value: number): void {
  if (key in values) values[key as keyof typeof values] = value
}

// 셰이더의 struct U 와 같은 순서. 48바이트 (vec2f 정렬 때문에 마지막에 패딩).
const uniforms = new Float32Array(12)

let device: GPUDevice | null = null
let context: GPUCanvasContext | null = null
let canvas: HTMLCanvasElement | null = null
let pipeline: GPURenderPipeline | null = null
let uniformBuffer: GPUBuffer | null = null
let bindGroup: GPUBindGroup | null = null

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
  bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
  })
}

export function frame(time: number): void {
  if (!device || !context || !canvas || !pipeline || !uniformBuffer || !bindGroup) return

  uniforms.set([
    canvas.width,
    canvas.height,
    time,
    values.grain,
    values.scan,
    values.roll,
    values.chroma,
    values.fps,
    devicePixelRatio,
    values.jitter,
  ])
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
  device = null
  context = null
  canvas = null
  pipeline = null
  uniformBuffer = null
  bindGroup = null
}
