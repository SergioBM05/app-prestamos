import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { MODO_DEMO, instalarApiDemo } from './services/demo'
import BannerDemo from './components/BannerDemo.jsx'

// Demo: las llamadas a /api se contestan en el propio navegador (no hay servidor ni login)
if (MODO_DEMO) instalarApiDemo()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
    {MODO_DEMO && <BannerDemo />}
  </StrictMode>,
)
