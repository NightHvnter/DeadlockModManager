import { ThemeProvider } from './components/providers/ThemeProvider'
import { SettingsProvider } from './components/providers/SettingsProvider'
import { ModActionsProvider } from './components/providers/ModActionsProvider'
import { GameinfoProvider } from './components/providers/GameinfoProvider'
import { Toaster } from '@/components/ui/sonner'
import Router from './router'

function App(): React.JSX.Element {
  return (
    <>
      <ThemeProvider>
        <SettingsProvider>
          <ModActionsProvider>
            <GameinfoProvider>
              <Router />
            </GameinfoProvider>
          </ModActionsProvider>
        </SettingsProvider>
        <Toaster />
      </ThemeProvider>
    </>
  )
}

export default App
