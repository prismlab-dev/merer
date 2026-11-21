import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AuthGate } from './auth'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthGate>{userId => <App key={userId} userId={userId} />}</AuthGate>
  </StrictMode>,
)
