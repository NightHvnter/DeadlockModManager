import { ThemeProvider } from "./components/providers/ThemeProvider"
import Router from "./router"

function App(): React.JSX.Element {
  return (
    <>
      <ThemeProvider>
        <Router />
      </ThemeProvider>
    </>
  )
}

export default App
