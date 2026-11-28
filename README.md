# Gallery

브라우저에서 실행되는 그래픽스 작업물 갤러리. Vite + React + TypeScript, 렌더링은 raw WebGPU (WGSL).

배포 주소: https://steampower33.github.io/gallery/

## 로컬 실행

Node 20 이상 필요 (CI는 Node 24).

```bash
npm install
npm run dev        # http://localhost:5173/gallery/
npm run build      # 타입 체크(tsc --noEmit) + 프로덕션 빌드 → dist/
npm run typecheck  # 타입 체크만
npm run preview    # 빌드 결과 미리보기
```

WebGPU는 보안 컨텍스트에서만 동작한다. `localhost`는 괜찮지만, 같은 네트워크의 다른 기기에서 `http://192.168.x.x`로 열면 동작하지 않는다.

## 구조

```
src/
  gpu/device.ts        어댑터/디바이스 초기화, 캔버스 컨텍스트 설정
  gpu/runner.ts        리사이즈, rAF 루프, 예제 정리
  works/types.ts       예제 인터페이스 (WorkModule, WorkMeta, Work)
  works/index.ts       예제 목록 등록
  works/<id>/          예제 하나 = 폴더 하나
```

## 새 예제 추가

1. `src/works/<id>/index.ts`를 만든다. `<id>`는 URL에 쓰이므로 영문 소문자와 `-`로 짓는다.

   ```ts
   import type { GpuContext, WorkMeta } from '../types'
   import thumbnail from './thumbnail.png'

   export const meta: WorkMeta = { title: '제목', description: '설명', thumbnail }

   export async function init(canvas: HTMLCanvasElement, device: GPUDevice, gpu: GpuContext) {
     // 버퍼, 텍스처, 파이프라인 생성
   }
   export function frame(time: number) {
     // 매 프레임. time = init 이후 경과 초
   }
   export function dispose() {
     // 이벤트 리스너, 모듈 상태 정리
   }
   // 선택: 캔버스 픽셀 크기가 바뀔 때
   export function resize(width: number, height: number) {}
   ```

   선택으로 슬라이더와 설명 글을 붙일 수 있다.

   ```ts
   import type { ParamDef } from '../types'
   import notesHtml from './notes.html?raw'

   // scene 위에 슬라이더 패널이 생긴다. 값이 바뀌면 setParam 이 불린다.
   export const params: readonly ParamDef[] = [
     { key: 'speed', label: '속도', min: 0, max: 2, step: 0.1, value: 1 },
   ]
   export function setParam(key: string, value: number) {}

   // "설명 보기"를 누르면 scene 옆 패널에 나오는 HTML 조각.
   export const notes = notesHtml
   ```

   설명 글 안에서는 `href="#..."` 같은 페이지 안 링크를 쓰지 않는다 (해시 라우팅과 겹친다).

2. `src/works/index.ts`에 등록한다. 인터페이스가 맞지 않으면 타입 에러가 난다.

   ```ts
   import * as myWork from './my-work'
   export const works: readonly Work[] = [
     { id: 'tv-static', module: tvStatic },
     { id: 'my-work', module: myWork },
   ]
   ```

### 예제 실행 규칙

- 예제마다 새 `GPUDevice`가 만들어진다. 예제를 떠나면 `dispose()` 뒤에 `device.destroy()`가 호출되어 그 디바이스로 만든 GPU 리소스가 모두 해제된다.
- 한 번에 한 예제만 실행된다. 이전 예제의 정리가 끝나야 다음 `init`이 시작되므로 상태를 모듈 수준 변수에 둬도 된다.
- `init`이 호출될 때 캔버스는 이미 `navigator.gpu.getPreferredCanvasFormat()` 포맷, `alphaMode: 'opaque'`로 configure 되어 있다. 다른 설정이 필요하면 `init`에서 `gpu.context.configure()`를 다시 호출한다. 렌더 파이프라인의 color target format은 `gpu.format`을 쓴다.
- 캔버스가 화면 밖에 있거나 탭이 숨겨지면 루프가 멈추고, 그동안의 시간은 `time`에 더해지지 않는다.
- 검증 에러(셰이더 컴파일 에러 등)는 브라우저 콘솔에 `[WebGPU]`로 찍힌다.

### WGSL 파일 분리

Vite의 `?raw` import로 셰이더를 별도 파일에 둘 수 있다.

```ts
import shaderCode from './shader.wgsl?raw'
const module = device.createShaderModule({ code: shaderCode })
```

## 블로그에서 연결

```html
<!-- 링크 -->
<a href="https://steampower33.github.io/gallery/#/works/tv-static">TV Static</a>

<!-- 설명 패널을 연 채로 링크 -->
<a href="https://steampower33.github.io/gallery/#/works/tv-static?notes=1">TV Static 설명</a>

<!-- 임베드: ?embed=1 이면 목차 없이 캔버스만. &controls=1 을 붙이면 슬라이더도 보인다 -->
<iframe src="https://steampower33.github.io/gallery/#/works/tv-static?embed=1"
        width="800" height="450" style="border:0" loading="lazy"></iframe>
```

블로그(`steampower33.github.io`)와 같은 오리진이라 iframe 권한 설정은 필요 없다. Jekyll 저장소에 `gallery/` 폴더를 만들면 이 사이트와 경로가 겹치므로 피한다.

## 배포

`main`에 push하면 `.github/workflows/deploy.yml`이 빌드하고 GitHub Pages에 배포한다.
처음 한 번은 GitHub 저장소의 **Settings → Pages → Build and deployment → Source**를 **GitHub Actions**로 바꿔야 한다.
