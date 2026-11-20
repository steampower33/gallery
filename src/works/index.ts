// 작품 목록. 새 작품을 만들면 여기에 import 하고 배열에 추가한다.
// id 는 URL(#/works/<id>)에 쓰이므로 폴더 이름과 같게 둔다.

import type { Work } from './types'
import * as clearColor from './clear-color'

export const works: readonly Work[] = [
  { id: 'clear-color', module: clearColor },
]

export function findWork(id: string): Work | undefined {
  return works.find((w) => w.id === id)
}
