// 예제(work) 인터페이스 정의.
// src/works/<id>/index.ts 가 이 형태로 export 하고, src/works/index.ts 에서 등록한다.

/** 목록 카드와 예제 화면 헤더에 쓰이는 정보. */
export interface WorkMeta {
  title: string
  description: string
  /** 썸네일 이미지 URL. 예제 폴더의 이미지를 import 해서 넣는다 (Vite가 base 경로를 붙여 줌). */
  thumbnail: string
}

/** init 의 세 번째 인자: 공통 코드가 이미 configure 해 둔 캔버스 컨텍스트. */
export interface GpuContext {
  context: GPUCanvasContext
  format: GPUTextureFormat
}

/** 예제 모듈이 export 해야 하는 것들. */
export interface WorkModule {
  meta: WorkMeta
  /**
   * 리소스(버퍼, 텍스처, 파이프라인 등)를 만든다. async 여도 된다.
   * 호출 시점에 canvas.width/height 는 이미 실제 픽셀 크기로 맞춰져 있다.
   */
  init(canvas: HTMLCanvasElement, device: GPUDevice, gpu: GpuContext): void | Promise<void>
  /** 매 프레임 호출. time 은 init 이후 경과한 초 (화면 밖에서 일시정지한 시간은 제외). */
  frame(time: number): void
  /**
   * 예제를 떠날 때 호출. GPU 리소스는 이후 device.destroy() 로 함께 해제되므로,
   * 여기서는 주로 이벤트 리스너나 모듈 수준 상태를 정리한다.
   */
  dispose(): void
  /** (선택) 캔버스 픽셀 크기가 바뀌었을 때. 깊이 텍스처 등을 다시 만들 때 쓴다. */
  resize?(width: number, height: number): void
}

/** 목록에 등록된 예제. id 는 URL(/works/:id)과 폴더 이름에 쓰인다. */
export interface Work {
  id: string
  module: WorkModule
}
