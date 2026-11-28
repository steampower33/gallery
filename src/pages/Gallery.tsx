import { useEffect, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { NavLink, useParams } from 'react-router'
import GpuCanvas from '../components/GpuCanvas'
import Unsupported from '../components/Unsupported'
import { useEmbed } from '../useEmbed'
import { useWebGPUSupport } from '../useWebGPUSupport'
import { findWork, works } from '../works'
import type { Work } from '../works/types'

// 목차 폭 (CSS px). 구분선을 끌어서 바꾸고, 다음 방문 때도 유지한다.
const WIDTH_KEY = 'gallery.sidebarWidth'
const MIN_WIDTH = 180
const MAX_WIDTH = 520
const DEFAULT_WIDTH = 280

// 호버 미리보기 크기 (16:9). styles.css 의 .preview 와 맞춘다.
const PREVIEW_HEIGHT = 180
const PREVIEW_GAP = 12

const clampWidth = (w: number) => Math.round(Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, w)))

function loadWidth(): number {
  try {
    const saved = Number(localStorage.getItem(WIDTH_KEY))
    if (saved > 0) return clampWidth(saved)
  } catch {
    // localStorage 를 못 쓰는 환경(차단된 iframe 등)이면 기본값.
  }
  return DEFAULT_WIDTH
}

/**
 * 갤러리 전체 화면. 페이지는 이것 하나뿐이고 스크롤하지 않는다.
 * 왼쪽 목차에서 예제를 고르면 오른쪽 scene 이 바뀐다.
 */
export default function Gallery() {
  const { id } = useParams()
  const embed = useEmbed()
  const support = useWebGPUSupport()
  const work = id ? findWork(id) : undefined

  const [width, setWidth] = useState(loadWidth)
  const [dragging, setDragging] = useState(false)
  const [preview, setPreview] = useState<{ work: Work; top: number } | null>(null)

  useEffect(() => {
    try {
      localStorage.setItem(WIDTH_KEY, String(width))
    } catch {
      // 저장 실패는 무시.
    }
  }, [width])

  let scene
  if (!work) scene = <div className="notice">예제를 찾을 수 없습니다: {id}</div>
  else if (support === 'checking') scene = null
  else if (support !== 'supported') scene = <Unsupported status={support} />
  // key={id}: 예제가 바뀌면 캔버스 요소도 새로 만든다 (이전 컨텍스트 설정이 남지 않게).
  else scene = <GpuCanvas key={work.id} work={work.module} />

  // 블로그 iframe 임베드: 목차 없이 scene 만.
  if (embed) return <div className="embed">{scene}</div>

  const showPreview = (w: Work, el: HTMLElement) => {
    // 지금 보고 있는 예제는 미리보기가 필요 없다.
    if (w.id === work?.id) return setPreview(null)
    const top = Math.max(
      PREVIEW_GAP,
      Math.min(el.getBoundingClientRect().top, window.innerHeight - PREVIEW_HEIGHT - PREVIEW_GAP),
    )
    setPreview({ work: w, top })
  }

  // 구분선 드래그: 목차가 화면 왼쪽 끝에 붙어 있으므로 포인터 x 가 곧 목차 폭이다.
  const onDividerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    setDragging(true)
    setPreview(null)
  }
  const onDividerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (dragging) setWidth(clampWidth(e.clientX))
  }
  const onDividerKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowLeft') setWidth((w) => clampWidth(w - 16))
    else if (e.key === 'ArrowRight') setWidth((w) => clampWidth(w + 16))
  }

  return (
    <div className={dragging ? 'layout dragging' : 'layout'}>
      <aside className="sidebar" style={{ width }}>
        <header className="sidebar-header">
          <h1>Gallery</h1>
          <a href="https://steampower33.github.io/">← 블로그</a>
        </header>
        <nav className="toc" onMouseLeave={() => setPreview(null)}>
          {works.map((w) => (
            <NavLink
              key={w.id}
              to={`/works/${w.id}`}
              className={({ isActive }) => (isActive ? 'toc-item active' : 'toc-item')}
              onMouseEnter={(e) => showPreview(w, e.currentTarget)}
              onFocus={(e) => showPreview(w, e.currentTarget)}
              onBlur={() => setPreview(null)}
              onClick={() => setPreview(null)}
            >
              <span className="toc-title">{w.module.meta.title}</span>
              <span className="toc-desc">{w.module.meta.description}</span>
            </NavLink>
          ))}
        </nav>
      </aside>

      <div
        className="divider"
        role="separator"
        aria-orientation="vertical"
        aria-label="목차 폭 조절"
        aria-valuenow={width}
        aria-valuemin={MIN_WIDTH}
        aria-valuemax={MAX_WIDTH}
        tabIndex={0}
        onPointerDown={onDividerDown}
        onPointerMove={onDividerMove}
        onPointerUp={() => setDragging(false)}
        onPointerCancel={() => setDragging(false)}
        onDoubleClick={() => setWidth(DEFAULT_WIDTH)}
        onKeyDown={onDividerKey}
      />

      <main className="stage">{scene}</main>

      {preview && (
        <img
          className="preview"
          src={preview.work.module.meta.thumbnail}
          alt=""
          style={{ left: width + PREVIEW_GAP, top: preview.top }}
        />
      )}
    </div>
  )
}
