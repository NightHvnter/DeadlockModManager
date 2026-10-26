import { Outlet } from 'react-router'
import AppBar from './Appbar'
import DropZone from './DropZone'
import GameinfoBanner from './GameinfoBanner'
import GamePathBanner from './GamePathBanner'
import UpdateBanner from './UpdateBanner'

export default function Layout(): React.JSX.Element {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppBar />
      <UpdateBanner />
      <GamePathBanner />
      <GameinfoBanner />
      <main className="p-4">
        <Outlet />
      </main>
      <DropZone />
    </div>
  )
}
