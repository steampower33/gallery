import { Link, useParams } from 'react-router'
import GpuCanvas from '../components/GpuCanvas'
import Unsupported from '../components/Unsupported'
import { useEmbed } from '../useEmbed'
import { useWebGPUSupport } from '../useWebGPUSupport'
import { findWork } from '../works'

export default function WorkView() {
  const { id } = useParams()
  const embed = useEmbed()
  const support = useWebGPUSupport()
  const work = id ? findWork(id) : undefined

  let body
  if (!work) body = <div className="notice">작품을 찾을 수 없습니다: {id}</div>
  else if (support === 'checking') body = null
  else if (support !== 'supported') body = <Unsupported status={support} />
  // key={id}: 작품이 바뀌면 캔버스 요소도 새로 만든다 (이전 컨텍스트 설정이 남지 않게).
  else body = <GpuCanvas key={work.id} work={work.module} />

  if (embed) return <div className="embed">{body}</div>

  return (
    <div className="viewer">
      <header className="header">
        <Link to="/">← 목록</Link>
        {work && (
          <div>
            <h1>{work.module.meta.title}</h1>
            <p>{work.module.meta.description}</p>
          </div>
        )}
      </header>
      <main className="stage">{body}</main>
    </div>
  )
}
