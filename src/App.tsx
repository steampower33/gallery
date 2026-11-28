import { HashRouter, Navigate, Route, Routes } from 'react-router'
import Gallery from './pages/Gallery'
import { works } from './works'

// HashRouter: GitHub Pages 는 SPA 폴백이 없으므로 경로를 # 뒤에 둔다.
//   https://steampower33.github.io/gallery/#/works/<id>
// 화면은 Gallery 하나뿐이다. 예제 id 가 없는 주소는 첫 예제로 보낸다.
export default function App() {
  const first = works[0]
  return (
    <HashRouter>
      <Routes>
        <Route path="/works/:id" element={<Gallery />} />
        {first && <Route path="*" element={<Navigate to={`/works/${first.id}`} replace />} />}
      </Routes>
    </HashRouter>
  )
}
