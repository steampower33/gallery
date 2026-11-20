import { useEffect, useRef, useState } from 'react'
import { runWork } from '../gpu/runner'
import type { WorkModule } from '../works/types'

/** 작품 하나를 캔버스에 실행한다. 언마운트되면 작품을 정리한다. */
export default function GpuCanvas({ work }: { work: WorkModule }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    setError(null)
    const handle = runWork(work, canvas, setError)
    return () => handle.stop()
  }, [work])

  return (
    <div className="canvas-wrap">
      <canvas ref={canvasRef} className="gpu-canvas" />
      {error && <div className="notice canvas-error">{error}</div>}
    </div>
  )
}
