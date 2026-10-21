import { ThemeProvider } from "./components/providers/ThemeProvider"
import { Toaster } from '@/components/ui/sonner'
import Router from "./router"

function App(): React.JSX.Element {
  return (
    <>
      <ThemeProvider>
        <Router />
        <Toaster />
      </ThemeProvider>
    </>
  )
}

export default App
