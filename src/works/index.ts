// 예제 목록. 새 예제를 만들면 여기에 import 하고 배열에 추가한다.
// id 는 URL(#/works/<id>)에 쓰이므로 폴더 이름과 같게 둔다.

import type { Work } from './types'
import * as clearColor from './clear-color'
import * as tvStatic from './tv-static'

export const works: readonly Work[] = [
  { id: 'clear-color', module: clearColor },
  { id: 'tv-static', module: tvStatic },
]

export function findWork(id: string): Work | undefined {
  return works.find((w) => w.id === id)
}
