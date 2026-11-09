import { isDaclionSite } from './utils/siteNavigation'
import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { SocketProvider } from './context/SocketContext'
import { ThemeProvider } from './context/ThemeContext'
import ThemeToggle from './components/ThemeToggle'
import Notification from './components/Notification'
import Portal from './portal/Portal'
import Login from './portal/Login'
import Register from './portal/Register'
import PasswordReset from './portal/PasswordReset'
import GameGate from './games/daclion/GameGate'
const Home = lazy(() => import('./games/daclion/Home'))
const LocationEditor = lazy(() => import('./games/daclion/LocationEditor'))
const AdminPage = lazy(() => import('./games/daclion/AdminPage'))
const GameGuide = lazy(() => import('./games/daclion/GameGuide'))
const PatchNotes = lazy(() => import('./games/daclion/PatchNotes'))

export default function App() {
  return <ThemeProvider><SocketProvider><BrowserRouter>
    <ThemeToggle /><Notification />
    <Suspense fallback={<p role="status">화면을 불러오고 있습니다…</p>}><Routes>
      <Route path="/" element={isDaclionSite() ? <Navigate to="/games/daclion/" replace /> : <Portal />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/password-reset" element={<PasswordReset />} />
      <Route path="/games/daclion" element={<GameGate />}>
        <Route index element={<Home />} />
        <Route path="guide" element={<GameGuide />} />
        <Route path="patch-notes" element={<PatchNotes />} />
        <Route path="admin" element={<AdminPage />} />
        <Route path="admin/locations" element={<LocationEditor />} />
      </Route>
      <Route path="/home" element={<Navigate to="/games/daclion/" replace />} />
      <Route path="/guide" element={<Navigate to="/games/daclion/guide" replace />} />
      <Route path="/patch-notes" element={<Navigate to="/games/daclion/patch-notes" replace />} />
      <Route path="/admin" element={<Navigate to="/games/daclion/admin" replace />} />
      <Route path="/admin/locations" element={<Navigate to="/games/daclion/admin/locations" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes></Suspense>
  </BrowserRouter></SocketProvider></ThemeProvider>
}
