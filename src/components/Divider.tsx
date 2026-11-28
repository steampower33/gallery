import { useState, type KeyboardEvent, type PointerEvent } from 'react'

/**
 * 끌어서 옆 패널의 폭을 바꾸는 세로 구분선.
 * 패널이 화면 어느 쪽에 붙어 있는지에 따라 포인터 x 를 폭으로 바꾸는 방법이 달라서 toWidth 로 받는다.
 */
export default function Divider({
  label,
  width,
  min,
  max,
  toWidth,
  onChange,
  onReset,
  onDragChange,
  growKey,
}: {
  label: string
  width: number
  min: number
  max: number
  /** 포인터의 clientX → 패널 폭 (CSS px). */
  toWidth: (clientX: number) => number
  onChange: (width: number) => void
  /** 더블클릭했을 때. */
  onReset: () => void
  /** 끄는 동안 true. 레이아웃이 글자 선택을 막는 데 쓴다. */
  onDragChange: (dragging: boolean) => void
  /** 패널을 넓히는 화살표 키. */
  growKey: 'ArrowLeft' | 'ArrowRight'
}) {
  const [dragging, setDragging] = useState(false)
  const clamp = (w: number) => Math.round(Math.max(min, Math.min(max, w)))

  const setDrag = (d: boolean) => {
    setDragging(d)
    onDragChange(d)
  }
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    setDrag(true)
  }
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (dragging) onChange(clamp(toWidth(e.clientX)))
  }
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    onChange(clamp(width + (e.key === growKey ? 16 : -16)))
  }

  return (
    <div
      className={dragging ? 'divider active' : 'divider'}
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={width}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={() => setDrag(false)}
      onPointerCancel={() => setDrag(false)}
      onDoubleClick={onReset}
      onKeyDown={onKeyDown}
    />
  )
}
