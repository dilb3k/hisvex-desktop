import { Fragment, useEffect, useSyncExternalStore } from 'react'
import { HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from './store/authStore'
import { getLanguage, subscribeLanguage } from './i18n'
import { authApi, setUnauthorizedHandler, setTokensRefreshedHandler } from './api/client'
import { startSessionHeartbeat } from './utils/sessionHeartbeat'
import { initBusinessDay } from './utils/businessDay'
import { LoginScreen } from './screens/LoginScreen'
import { ProcurementScreen } from './screens/ProcurementScreen'
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
import { Titlebar, isWin, BAR_HEIGHT } from './components/Titlebar'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, user } = useAuthStore()
  const location = useLocation()
  if (isLoading) return <SplashScreen />
  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (user?.scope === 'procurement' && !['/products', '/procurements'].includes(location.pathname)) return <Navigate to="/procurements" replace />
  return <>{children}</>
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, user } = useAuthStore()
  const location = useLocation()
  if (isLoading) return <SplashScreen />
  if (isAuthenticated) return <Navigate to={user?.scope === 'procurement' ? '/procurements' : '/'} replace />
  if (user?.scope === 'procurement' && !['/products', '/procurements'].includes(location.pathname)) return <Navigate to="/procurements" replace />
  return <>{children}</>
}

function CatalogRoute() {
  const scoped = useAuthStore(s => s.user?.scope === 'procurement')
  return scoped ? <ProcurementScreen catalogOnly /> : <ProductsScreen />
}

export function App() {
  const logout = useAuthStore((s) => s.logout)
  const hydrate = useAuthStore((s) => s.hydrate)
  const persistenceError = useAuthStore((s) => s.persistenceError)
  const userId = useAuthStore(s => s.user?._id)
  const scoped = useAuthStore(s => s.user?.scope === 'procurement')

  useEffect(() => {
    if (!userId || scoped) return
    const heartbeat = startSessionHeartbeat(authApi.heartbeat, () => navigator.onLine && document.visibilityState === 'visible')
    const ping = () => { void heartbeat.ping() }
    window.addEventListener('online', ping)
    document.addEventListener('visibilitychange', ping)
    return () => {
      heartbeat.stop()
      window.removeEventListener('online', ping)
      document.removeEventListener('visibilitychange', ping)
    }
  }, [userId, scoped])

  useEffect(() => { hydrate() }, [hydrate])

  // `t()` is a plain function, so nothing outside the Settings screen
  // re-rendered when the language changed — the sidebar and every other screen
  // kept the old language until the app was restarted. Keying the tree on the
  // language remounts it on a switch, which is the only reliable way to
  // invalidate `t()` results that are read during render (including inside
  // useMemo bodies and style objects).
  const language = useSyncExternalStore(subscribeLanguage, getLanguage, getLanguage)

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
      {persistenceError && <div role="alert" style={{ padding: 12, color: '#fff', background: '#9f1239', marginTop: isWin ? BAR_HEIGHT : 0 }}>{persistenceError}</div>}
      {/* Titlebar is `position: fixed`, so it takes up no space of its own
          here — this padding is what stops it (now permanently visible,
          not just a hover sliver) from sitting on top of the first ~36px
          of every screen's own content. Windows only: on other platforms
          Titlebar renders nothing and the OS supplies its own chrome, so
          there's nothing here to make room for. */}
      <div style={{ flex: 1, minHeight: 0, paddingTop: isWin ? BAR_HEIGHT : 0 }}>
        <Fragment key={language}>
          <HashRouter>
            <UpdateAvailableModal />
            <Routes>
              <Route path="/login" element={<PublicRoute><LoginScreen /></PublicRoute>} />
              <Route path="/" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
                <Route index element={<StatisticsScreen />} />
                <Route path="products" element={<CatalogRoute />} />
                <Route path="procurements" element={<ProcurementScreen />} />
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
        </Fragment>
      </div>
    </div>
  )
}
