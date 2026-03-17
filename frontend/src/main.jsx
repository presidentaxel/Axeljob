import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, useLocation } from 'react-router-dom'
import './index.css'
import App from './App.jsx'

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}

function ChunkErrorReloadReset() {
  useEffect(() => {
    try {
      sessionStorage.removeItem('chunkErrorReload')
    } catch (_) {}
  }, [])
  return null
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <ScrollToTop />
      <ChunkErrorReloadReset />
      <App />
    </BrowserRouter>
  </StrictMode>,
)
