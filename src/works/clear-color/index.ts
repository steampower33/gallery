// 예시 작품: 캔버스를 단색으로 지우기만 한다. 갤러리 뼈대가 동작하는지 확인용.

import type { GpuContext, WorkMeta } from '../types'
import thumbnail from './thumbnail.svg'

export const meta: WorkMeta = {
  title: 'Clear Color',
  description: '캔버스를 단색으로 지우는 예시',
  thumbnail,
}

let device: GPUDevice | null = null
let context: GPUCanvasContext | null = null

export function init(_canvas: HTMLCanvasElement, gpuDevice: GPUDevice, gpu: GpuContext): void {
  device = gpuDevice
  context = gpu.context
}

export function frame(_time: number): void {
  if (!device || !context) return
  const encoder = device.createCommandEncoder()
  const pass = encoder.beginRenderPass({
    colorAttachments: [
      {
        view: context.getCurrentTexture().createView(),
        clearValue: { r: 0.15, g: 0.35, b: 0.6, a: 1 },
        loadOp: 'clear',
        storeOp: 'store',
      },
    ],
  })
  pass.end()
  device.queue.submit([encoder.finish()])
}

export function dispose(): void {
  device = null
  context = null
}
