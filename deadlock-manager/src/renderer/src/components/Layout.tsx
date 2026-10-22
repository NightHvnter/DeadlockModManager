import { Outlet } from 'react-router'
import AppBar from './Appbar'
import GamePathBanner from './GamePathBanner'

export default function Layout(): React.JSX.Element {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppBar />
      <GamePathBanner />
      <main className="p-4">
        <Outlet />
      </main>
    </div>
  )
}
