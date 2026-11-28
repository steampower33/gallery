import type { SupportStatus } from '../gpu/device'

const reasons: Record<Exclude<SupportStatus, 'supported'>, string> = {
  'no-api': '이 브라우저는 WebGPU를 지원하지 않습니다.',
  'no-adapter': 'WebGPU는 있지만 사용할 수 있는 GPU를 찾지 못했습니다.',
}

export default function Unsupported({ status }: { status: Exclude<SupportStatus, 'supported'> }) {
  return (
    <div className="notice">
      <strong>{reasons[status]}</strong>
      <p>최신 버전의 Chrome, Edge, Safari 또는 Firefox에서 열어 주세요. 하드웨어 가속이 꺼져 있으면 켜야 합니다.</p>
    </div>
  )
}
