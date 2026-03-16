import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import {
  createBrowserRouter,
  createRoutesFromElements,
  Route,
  RouterProvider,
} from 'react-router-dom'
import App from './App.jsx'
import { AuthProvider } from './state/auth.jsx'
import { ToastProvider } from './components/ToastProvider.jsx'
import './index.css'

const router = createBrowserRouter(
  createRoutesFromElements(<Route path="*" element={<App />} />),
)

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </AuthProvider>
  </StrictMode>,
)
