import { useEffect, useState } from 'react'
import { checkWebGPUSupport, type SupportStatus } from './gpu/device'

export function useWebGPUSupport(): SupportStatus | 'checking' {
  const [status, setStatus] = useState<SupportStatus | 'checking'>('checking')
  useEffect(() => {
    let alive = true
    void checkWebGPUSupport().then((s) => {
      if (alive) setStatus(s)
    })
    return () => {
      alive = false
    }
  }, [])
  return status
}
