import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AuthGate } from './auth'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthGate>{user => <App key={user.id} userId={user.id} email={user.email} />}</AuthGate>
  </StrictMode>,
)
