import { useEffect } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/authStore'
import { setUnauthorizedHandler, setTokensRefreshedHandler } from './api/client'
import { initBusinessDay } from './utils/businessDay'
import { LoginScreen } from './screens/LoginScreen'
import { ProductsScreen } from './screens/ProductsScreen'
import { InventoryScreen } from './screens/InventoryScreen'
import { SalesScreen } from './screens/SalesScreen'
import { DebtorsScreen } from './screens/DebtorsScreen'
import { StatisticsScreen } from './screens/StatisticsScreen'
import { SettingsScreen } from './screens/SettingsScreen'
import { UsersScreen } from './screens/UsersScreen'
import { AppLayout } from './components/AppLayout'
import { SplashScreen } from './components/SplashScreen'
import { UpdateAvailableModal } from './components/UpdateAvailableModal'
import { Titlebar } from './components/Titlebar'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuthStore()
  if (isLoading) return <SplashScreen />
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return <>{children}</>
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuthStore()
  if (isLoading) return <SplashScreen />
  if (isAuthenticated) return <Navigate to="/" replace />
  return <>{children}</>
}

export function App() {
  const logout = useAuthStore((s) => s.logout)
  const hydrate = useAuthStore((s) => s.hydrate)

  useEffect(() => { hydrate() }, [hydrate])

  useEffect(() => { initBusinessDay() }, [])

  useEffect(() => {
    setUnauthorizedHandler(() => logout())
    setTokensRefreshedHandler((token, refreshToken) => {
      useAuthStore.setState({ token, refreshToken })
    })
    return () => {
      setUnauthorizedHandler(null)
      setTokensRefreshedHandler(null)
    }
  }, [logout])

  return (
    // Titlebar (Windows only — it no-ops to `display: none` on other
    // platforms, see Titlebar.tsx) used to live inside AppLayout, so it only
    // mounted once a user was authenticated. Splash (auth still hydrating)
    // and the login/register screen render *outside* AppLayout, so on
    // Windows — where the OS chrome is stripped via `frame: false` — those
    // screens had literally no minimize/maximize/close buttons and no drag
    // region: the window couldn't be moved or closed by anything but
    // Alt+F4/Task Manager. Hoisting it here, above the router, makes it
    // mount for every screen exactly once.
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Titlebar />
      <div style={{ flex: 1, minHeight: 0 }}>
        <HashRouter>
          <UpdateAvailableModal />
          <Routes>
            <Route path="/login" element={<PublicRoute><LoginScreen /></PublicRoute>} />
            <Route path="/" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
              <Route index element={<StatisticsScreen />} />
              <Route path="products" element={<ProductsScreen />} />
              <Route path="inventory" element={<InventoryScreen />} />
              <Route path="sales" element={<SalesScreen />} />
              <Route path="debtors" element={<DebtorsScreen />} />
              <Route path="settings" element={<SettingsScreen />} />
              <Route path="users" element={<UsersScreen />} />
              <Route path="statistics" element={<Navigate to="/" replace />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </HashRouter>
      </div>
    </div>
  )
}
