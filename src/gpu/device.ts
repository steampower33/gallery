// WebGPU 어댑터/디바이스 초기화와 캔버스 컨텍스트 설정.
// 작품 코드가 아니라 갤러리 공통 코드다. 모든 작품이 이 경로로 GPUDevice를 받는다.

export type SupportStatus = 'supported' | 'no-api' | 'no-adapter'

// 지원 여부 확인용 어댑터 요청은 한 번만 한다 (목록/작품 화면이 같이 씀).
let supportPromise: Promise<SupportStatus> | null = null

/**
 * 브라우저가 WebGPU를 쓸 수 있는지 확인한다.
 * - 'no-api'     : navigator.gpu 자체가 없음 (미지원 브라우저, 또는 http 같은 비보안 컨텍스트)
 * - 'no-adapter' : API는 있지만 쓸 수 있는 GPU 어댑터가 없음 (블랙리스트된 드라이버, 꺼진 플래그 등)
 */
export function checkWebGPUSupport(): Promise<SupportStatus> {
  supportPromise ??= (async () => {
    if (!('gpu' in navigator)) return 'no-api'
    const adapter = await navigator.gpu.requestAdapter().catch(() => null)
    return adapter ? 'supported' : 'no-adapter'
  })()
  return supportPromise
}

/** 작품 하나를 실행하는 동안 쓰는 GPU 객체 묶음. */
export interface GpuSession {
  adapter: GPUAdapter
  device: GPUDevice
  context: GPUCanvasContext
  format: GPUTextureFormat
}

/**
 * 작품 하나를 위한 GPUDevice를 새로 만들고 캔버스에 연결한다.
 * 작품이 끝나면 호출 측(runner)에서 device.destroy()로 통째로 정리한다.
 */
export async function createGpuSession(canvas: HTMLCanvasElement): Promise<GpuSession> {
  // 1) WebGPU 진입점 확인.
  //    navigator.gpu는 WebGPU를 지원하고, 보안 컨텍스트(https 또는 localhost)일 때만 존재한다.
  if (!('gpu' in navigator)) {
    throw new Error('이 브라우저는 WebGPU를 지원하지 않습니다.')
  }

  // 2) 어댑터 요청.
  //    어댑터는 실제 GPU(또는 소프트웨어 구현) 하나를 나타낸다.
  //    지원하는 기능(features)과 한도(limits)를 여기서 조회할 수 있다.
  //    쓸 수 있는 GPU가 없으면 예외가 아니라 null이 온다.
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' })
  if (!adapter) {
    throw new Error('사용 가능한 GPU 어댑터를 찾지 못했습니다.')
  }

  // 3) 디바이스 요청.
  //    디바이스는 어댑터에 대한 논리적 연결이다. 버퍼, 텍스처, 파이프라인 같은
  //    모든 GPU 리소스는 디바이스에서 만들어지고, 디바이스가 파괴되면 같이 사라진다.
  //    requiredFeatures/requiredLimits를 주지 않으면 모든 환경에서 보장되는 기본 한도로 만들어진다.
  //    작품에 특정 기능(예: 'timestamp-query', 'float32-filterable')이 필요해지면 여기서 요청하도록 확장한다.
  const device = await adapter.requestDevice()

  // 4) 검증 에러 출력.
  //    WebGPU 호출은 대부분 예외를 던지지 않고, 잘못된 사용은 비동기 "uncaptured error"로 보고된다.
  //    셰이더 컴파일 에러나 바인딩 불일치를 놓치지 않도록 콘솔에 남긴다.
  device.addEventListener('uncapturederror', (event) => {
    console.error('[WebGPU]', event.error.message)
  })

  // 5) 캔버스 컨텍스트 얻기.
  //    'webgpu' 컨텍스트는 캔버스에 그릴 텍스처를 매 프레임 제공하는 스왑체인 역할을 한다.
  const context = canvas.getContext('webgpu')
  if (!context) {
    throw new Error('캔버스에서 WebGPU 컨텍스트를 만들 수 없습니다.')
  }

  // 6) 캔버스 포맷 선택.
  //    플랫폼마다 화면 출력에 가장 효율적인 포맷이 다르다 (보통 'bgra8unorm' 또는 'rgba8unorm').
  //    렌더 파이프라인의 color target format도 이 값과 맞춰야 한다.
  const format = navigator.gpu.getPreferredCanvasFormat()

  // 7) 컨텍스트 설정.
  //    이 디바이스로 캔버스에 그리겠다고 연결한다. 이후 context.getCurrentTexture()로
  //    이번 프레임에 그릴 텍스처를 얻는다. alphaMode 'opaque'는 캔버스 뒤 페이지와 섞지 않는다는 뜻.
  //    작품이 다른 설정(예: usage 추가)이 필요하면 init 안에서 context.configure()를 다시 호출해도 된다.
  context.configure({ device, format, alphaMode: 'opaque' })

  return { adapter, device, context, format }
}
