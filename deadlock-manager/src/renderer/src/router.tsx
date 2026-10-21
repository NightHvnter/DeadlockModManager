import { HashRouter, Routes, Route } from 'react-router'
import Layout from './components/Layout'
import Home from './pages/Home'
import Installed from './pages/Installed'
import NotFound from './pages/NotFound'

export default function Router(): React.JSX.Element {
  return (
    <HashRouter>
        <Routes>
            <Route path="/" element={<Layout />}>
                <Route index element={<Home />} />
                <Route path="installed" element={<Installed />} />
                <Route path="*" element={<NotFound />} />
            </Route>
        </Routes>
    </HashRouter>
  )
}
