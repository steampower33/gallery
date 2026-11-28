import { useEffect, useRef, useState } from 'react'
import { runWork } from '../gpu/runner'
import type { ParamDef, WorkModule } from '../works/types'

const defaultsOf = (params: readonly ParamDef[]) => Object.fromEntries(params.map((p) => [p.key, p.value]))

/**
 * 예제 하나를 캔버스에 실행한다. 언마운트되면 예제를 정리한다.
 * 예제가 params 를 선언했으면 캔버스 위에 슬라이더 패널을 얹는다 (showParams 가 false 면 숨김).
 */
export default function GpuCanvas({ work, showParams = true }: { work: WorkModule; showParams?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [error, setError] = useState<string | null>(null)
  const params = work.params ?? []
  const [values, setValues] = useState(() => defaultsOf(params))

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    setError(null)
    // 예제의 값은 모듈 수준에 남아 있으므로, 들어올 때마다 기본값으로 되돌린다.
    const defaults = defaultsOf(work.params ?? [])
    for (const [key, value] of Object.entries(defaults)) work.setParam?.(key, value)
    setValues(defaults)
    const handle = runWork(work, canvas, setError)
    return () => handle.stop()
  }, [work])

  const change = (key: string, value: number) => {
    work.setParam?.(key, value)
    setValues((v) => ({ ...v, [key]: value }))
  }
  const reset = () => {
    for (const p of params) work.setParam?.(p.key, p.value)
    setValues(defaultsOf(params))
  }

  return (
    <div className="canvas-wrap">
      <canvas ref={canvasRef} className="gpu-canvas" />
      {showParams && params.length > 0 && (
        <details className="params" open>
          <summary>파라미터</summary>
          {params.map((p) => (
            <label key={p.key}>
              <span>{p.label}</span>
              <output>{values[p.key] ?? p.value}</output>
              <input
                type="range"
                min={p.min}
                max={p.max}
                step={p.step}
                value={values[p.key] ?? p.value}
                onChange={(e) => change(p.key, e.currentTarget.valueAsNumber)}
              />
            </label>
          ))}
          <button type="button" onClick={reset}>
            기본값으로
          </button>
        </details>
      )}
      {error && <div className="notice canvas-error">{error}</div>}
    </div>
  )
}
