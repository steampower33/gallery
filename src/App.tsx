import { HashRouter, Route, Routes } from 'react-router'
import WorkList from './pages/WorkList'
import WorkView from './pages/WorkView'

// HashRouter: GitHub Pages 는 SPA 폴백이 없으므로 경로를 # 뒤에 둔다.
//   https://steampower33.github.io/gallery/#/works/<id>
export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<WorkList />} />
        <Route path="/works/:id" element={<WorkView />} />
        <Route path="*" element={<WorkList />} />
      </Routes>
    </HashRouter>
  )
}
