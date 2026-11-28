import { useEffect, useState } from 'react'
import { NavLink, useParams, useSearchParams } from 'react-router'
import Divider from '../components/Divider'
import GpuCanvas from '../components/GpuCanvas'
import Unsupported from '../components/Unsupported'
import { useEmbed } from '../useEmbed'
import { useWebGPUSupport } from '../useWebGPUSupport'
import { findWork, works } from '../works'
import type { Work } from '../works/types'

// 양옆 패널의 폭 (CSS px). 구분선을 끌어서 바꾸고, 다음 방문 때도 유지한다.
const SIDEBAR = { key: 'gallery.sidebarWidth', min: 180, max: 520, initial: 280 }
const NOTES = { key: 'gallery.notesWidth', min: 320, max: 1000, initial: 520 }

// 호버 미리보기 크기 (16:9). styles.css 의 .preview 와 맞춘다.
const PREVIEW_HEIGHT = 180
const PREVIEW_GAP = 12

/** localStorage 에 저장되는 패널 폭. */
function useStoredWidth({ key, min, max, initial }: typeof SIDEBAR) {
  const [width, setWidth] = useState(() => {
    try {
      const saved = Number(localStorage.getItem(key))
      if (saved > 0) return Math.max(min, Math.min(max, saved))
    } catch {
      // localStorage 를 못 쓰는 환경(차단된 iframe 등)이면 기본값.
    }
    return initial
  })
  useEffect(() => {
    try {
      localStorage.setItem(key, String(width))
    } catch {
      // 저장 실패는 무시.
    }
  }, [key, width])
  return [width, setWidth] as const
}

/**
 * 갤러리 전체 화면. 페이지는 이것 하나뿐이고 스크롤하지 않는다.
 *   목차 | scene | (설명)
 * 왼쪽 목차에서 예제를 고르면 scene 이 바뀌고, 설명을 열면 scene 옆에 글이 나온다.
 * 설명이 열린 상태는 주소(?notes=1)에 남으므로 그대로 링크할 수 있다.
 */
export default function Gallery() {
  const { id } = useParams()
  const [search, setSearch] = useSearchParams()
  const embed = useEmbed()
  const support = useWebGPUSupport()
  const work = id ? findWork(id) : undefined

  const [sidebarWidth, setSidebarWidth] = useStoredWidth(SIDEBAR)
  const [notesWidth, setNotesWidth] = useStoredWidth(NOTES)
  const [dragging, setDragging] = useState(false)
  const [preview, setPreview] = useState<{ work: Work; top: number } | null>(null)

  const notes = work?.module.notes
  const wantNotes = search.get('notes') === '1'
  const notesOpen = wantNotes && !!notes
  const setNotesOpen = (open: boolean) => setSearch(open ? { notes: '1' } : {}, { replace: true })

  // 임베드에서는 ?controls=1 일 때만 슬라이더를 보여 준다.
  const showParams = !embed || search.get('controls') === '1'

  let scene
  if (!work) scene = <div className="notice">예제를 찾을 수 없습니다: {id}</div>
  else if (support === 'checking') scene = null
  else if (support !== 'supported') scene = <Unsupported status={support} />
  // key={id}: 예제가 바뀌면 캔버스 요소도 새로 만든다 (이전 컨텍스트 설정이 남지 않게).
  else scene = <GpuCanvas key={work.id} work={work.module} showParams={showParams} />

  // 블로그 iframe 임베드: 목차와 설명 없이 scene 만.
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

  return (
    <div className={dragging ? 'layout dragging' : 'layout'}>
      <aside className="sidebar" style={{ width: sidebarWidth }}>
        <header className="sidebar-header">
          <h1>Gallery</h1>
          <a href="https://steampower33.github.io/">← 블로그</a>
        </header>
        <nav className="toc" onMouseLeave={() => setPreview(null)}>
          {works.map((w) => (
            <NavLink
              key={w.id}
              // 설명을 보던 중이면 다른 예제로 가도 설명을 열어 둔다.
              to={{ pathname: `/works/${w.id}`, search: wantNotes ? '?notes=1' : '' }}
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

      {/* 목차가 화면 왼쪽 끝에 붙어 있으므로 포인터 x 가 곧 목차 폭이다. */}
      <Divider
        label="목차 폭 조절"
        width={sidebarWidth}
        min={SIDEBAR.min}
        max={SIDEBAR.max}
        toWidth={(x) => x}
        growKey="ArrowRight"
        onChange={setSidebarWidth}
        onReset={() => setSidebarWidth(SIDEBAR.initial)}
        onDragChange={(d) => {
          setDragging(d)
          setPreview(null)
        }}
      />

      <main className="stage">
        {scene}
        {notes && !notesOpen && (
          <button type="button" className="notes-toggle" onClick={() => setNotesOpen(true)}>
            설명 보기
          </button>
        )}
      </main>

      {work && notes && notesOpen && (
        <>
          {/* 설명은 화면 오른쪽 끝에 붙어 있으므로 오른쪽 끝에서 포인터까지가 폭이다. */}
          <Divider
            label="설명 폭 조절"
            width={notesWidth}
            min={NOTES.min}
            max={NOTES.max}
            toWidth={(x) => window.innerWidth - x}
            growKey="ArrowLeft"
            onChange={setNotesWidth}
            onReset={() => setNotesWidth(NOTES.initial)}
            onDragChange={setDragging}
          />
          <aside className="notes" style={{ width: notesWidth }}>
            <header className="notes-header">
              <h2>{work.module.meta.title}</h2>
              <button type="button" aria-label="설명 닫기" onClick={() => setNotesOpen(false)}>
                ✕
              </button>
            </header>
            {/* 설명 글은 저장소 안의 예제 폴더에서 온 HTML 조각이다 (외부 입력 아님). key 로 예제가 바뀌면 스크롤을 맨 위로. */}
            <article key={work.id} className="notes-body" dangerouslySetInnerHTML={{ __html: notes }} />
          </aside>
        </>
      )}

      {preview && (
        <img
          className="preview"
          src={preview.work.module.meta.thumbnail}
          alt=""
          style={{ left: sidebarWidth + PREVIEW_GAP, top: preview.top }}
        />
      )}
    </div>
  )
}
