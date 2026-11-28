// 예제 하나의 실행 수명주기: 디바이스 생성 → 리사이즈 → rAF 루프 → 정리.

import type { WorkModule } from '../works/types'
import { createGpuSession } from './device'

export interface RunHandle {
  stop(): void
}

// 한 번에 하나의 예제만 실행되도록 직렬화한다.
// 이전 예제의 dispose/destroy 가 끝나야 다음 예제의 init 이 시작되므로,
// 예제 코드는 상태를 모듈 수준 변수에 둬도 겹치지 않는다
// (React StrictMode 가 개발 모드에서 effect 를 두 번 실행해도 안전).
let queue: Promise<void> = Promise.resolve()

export function runWork(
  work: WorkModule,
  canvas: HTMLCanvasElement,
  onError: (message: string) => void,
): RunHandle {
  let stopped = false
  let teardown: (() => void) | null = null

  let releaseSlot!: () => void
  const prev = queue
  queue = new Promise<void>((resolve) => {
    releaseSlot = resolve
  })

  const start = async () => {
    if (stopped) return releaseSlot()

    let device: GPUDevice | null = null
    let initialized = false
    let rafId = 0
    let resizeObserver: ResizeObserver | null = null
    let intersectionObserver: IntersectionObserver | null = null
    const onVisibilityChange = () => {
      lastTimestamp = null
    }

    // 정리는 정확히 한 번만.
    let cleaned = false
    const cleanup = () => {
      if (cleaned) return
      cleaned = true
      cancelAnimationFrame(rafId)
      resizeObserver?.disconnect()
      intersectionObserver?.disconnect()
      document.removeEventListener('visibilitychange', onVisibilityChange)
      if (initialized) {
        try {
          work.dispose()
        } catch (e) {
          console.error(e)
        }
      }
      // 디바이스 파괴: 이 디바이스로 만든 모든 GPU 리소스가 함께 해제된다.
      device?.destroy()
      releaseSlot()
    }

    // 시간: rAF 사이 간격을 누적한다. 루프가 멈춘 동안(화면 밖, 탭 숨김)은 더하지 않는다.
    let elapsed = 0
    let lastTimestamp: number | null = null
    let visible = true

    try {
      const session = await createGpuSession(canvas)
      device = session.device
      if (stopped) return cleanup()

      // 예상치 못한 디바이스 손실(드라이버 리셋 등)은 화면에 알린다. 우리가 destroy 한 경우는 무시.
      device.lost.then((info) => {
        if (info.reason !== 'destroyed' && !stopped) {
          onError(`GPU 디바이스를 잃었습니다: ${info.message}`)
          cleanup()
        }
      })

      // 캔버스 리사이즈: CSS 크기 × devicePixelRatio 를 실제 픽셀 크기로 맞춘다.
      const maxDim = device.limits.maxTextureDimension2D
      const applySize = (width: number, height: number) => {
        const w = Math.max(1, Math.min(maxDim, Math.round(width)))
        const h = Math.max(1, Math.min(maxDim, Math.round(height)))
        if (canvas.width === w && canvas.height === h) return
        canvas.width = w
        canvas.height = h
        if (initialized) work.resize?.(w, h)
      }
      const rect = canvas.getBoundingClientRect()
      applySize(rect.width * devicePixelRatio, rect.height * devicePixelRatio)

      resizeObserver = new ResizeObserver(([entry]) => {
        if (!entry) return
        // devicePixelContentBoxSize 가 있으면 반올림 오차 없는 정확한 픽셀 크기를 준다.
        const box = entry.devicePixelContentBoxSize?.[0]
        if (box) applySize(box.inlineSize, box.blockSize)
        else {
          const css = entry.contentBoxSize[0]
          if (css) applySize(css.inlineSize * devicePixelRatio, css.blockSize * devicePixelRatio)
        }
      })
      try {
        resizeObserver.observe(canvas, { box: 'device-pixel-content-box' })
      } catch {
        resizeObserver.observe(canvas)
      }

      await work.init(canvas, device, { context: session.context, format: session.format })
      initialized = true
      if (stopped) return cleanup()
      // init 이 끝난 뒤부터는 stop() 이 바로 정리한다.
      // (그 전에는 init 도중에 디바이스를 파괴하지 않도록, 위의 체크포인트에서 정리한다.)
      teardown = cleanup

      // 화면 밖으로 나가면 루프를 멈춘다 (블로그에 iframe 이 여러 개일 때 보이는 것만 실행).
      intersectionObserver = new IntersectionObserver(([entry]) => {
        const nowVisible = entry?.isIntersecting ?? true
        if (nowVisible && !visible) {
          lastTimestamp = null
          rafId = requestAnimationFrame(loop)
        } else if (!nowVisible) {
          cancelAnimationFrame(rafId)
        }
        visible = nowVisible
      })
      intersectionObserver.observe(canvas)
      // 탭이 숨겨지면 rAF 가 멈추므로, 돌아왔을 때 그 간격을 시간에 더하지 않게 한다.
      document.addEventListener('visibilitychange', onVisibilityChange)

      const loop = (timestamp: number) => {
        if (stopped || !visible) return
        if (lastTimestamp !== null) elapsed += (timestamp - lastTimestamp) / 1000
        lastTimestamp = timestamp
        try {
          work.frame(elapsed)
        } catch (e) {
          onError(e instanceof Error ? e.message : String(e))
          cleanup()
          return
        }
        rafId = requestAnimationFrame(loop)
      }
      rafId = requestAnimationFrame(loop)
    } catch (e) {
      if (!stopped) onError(e instanceof Error ? e.message : String(e))
      cleanup()
    }
  }

  void prev.then(start)

  return {
    stop() {
      if (stopped) return
      stopped = true
      // 아직 init 중이면 start() 가 끝나는 지점에서 stopped 를 보고 정리한다.
      teardown?.()
    },
  }
}
