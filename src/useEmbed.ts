import { useSearchParams } from 'react-router'

/**
 * iframe 임베드 모드 여부.
 * 해시 뒤(#/works/x?embed=1)와 해시 앞(/gallery/?embed=1#/works/x) 둘 다 인식한다.
 */
export function useEmbed(): boolean {
  const [params] = useSearchParams()
  if (params.get('embed') === '1') return true
  return new URLSearchParams(window.location.search).get('embed') === '1'
}
