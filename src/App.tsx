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
  )
}
