import { useEffect, useState } from 'react'
import { Download, X } from 'lucide-react'
import { t } from '../i18n'

// Source of truth for releases is the same GitHub repo the landing page's
// download buttons already point at (see hisvex-landing/src/App.tsx) — no
// backend change needed, and every future release is picked up automatically
// the moment its tag is published, with zero extra maintenance step.
const RELEASES_API = 'https://api.github.com/repos/dilb3k/hisvex-landing/releases/latest'
const DOWNLOAD_URL = 'https://hisvex-landing.vercel.app/#download-section'

// Re-checking on literally every launch would hit GitHub's unauthenticated
// rate limit fast on a shared office IP with several kiosks; once every 6h
// is frequent enough for a desktop POS app that's usually left open all day.
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000
const LS_LAST_CHECK = 'hisvex_update_last_check'
const LS_SKIPPED_VERSION = 'hisvex_update_skipped_version'

function parseVersion(v: string): number[] {
  return v.replace(/^v/i, '').trim().split('.').map((n) => parseInt(n, 10) || 0)
}

function isNewer(latest: string, current: string): boolean {
  const a = parseVersion(latest)
  const b = parseVersion(current)
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0
    const y = b[i] ?? 0
    if (x !== y) return x > y
  }
  return false
}

export function UpdateAvailableModal() {
  const [state, setState] = useState<{ current: string; latest: string } | null>(null)

  useEffect(() => {
    let cancelled = false

    async function check() {
      try {
        const lastCheck = Number(localStorage.getItem(LS_LAST_CHECK) || 0)
        if (Date.now() - lastCheck < CHECK_INTERVAL_MS) return

        const current = await window.electronAPI?.getAppVersion?.()
        if (!current) return

        const res = await fetch(RELEASES_API, {
          headers: { Accept: 'application/vnd.github+json' },
        })
        localStorage.setItem(LS_LAST_CHECK, String(Date.now()))
        if (!res.ok || cancelled) return

        const json = await res.json()
        const tag = String(json?.tag_name || '')
        if (!tag) return

        const skipped = localStorage.getItem(LS_SKIPPED_VERSION)
        if (isNewer(tag, current) && skipped !== tag) {
          setState({ current, latest: tag.replace(/^v/i, '') })
        }
      } catch {
        // Offline, GitHub unreachable, rate-limited, whatever — a failed
        // check just tries again on the next launch. Never blocks the app.
      }
    }

    check()
    return () => { cancelled = true }
  }, [])

  if (!state) return null

  const handleDownload = () => {
    window.electronAPI?.openExternal?.(DOWNLOAD_URL)
  }
  const handleLater = () => setState(null)
  const handleSkip = () => {
    localStorage.setItem(LS_SKIPPED_VERSION, `v${state.latest}`)
    setState(null)
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 5000,
        background: 'rgba(0,0,0,0.65)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backdropFilter: 'blur(4px)',
      }}
    >
      <div
        style={{
          position: 'relative',
          width: 380,
          borderRadius: 'var(--radius-xl)',
          background: 'var(--color-bg-alt, #16161a)',
          border: '1px solid var(--color-border, rgba(124,58,237,0.25))',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          padding: 24,
          textAlign: 'center',
        }}
      >
        <button
          onClick={handleLater}
          style={{
            position: 'absolute', top: 12, right: 12,
            width: 28, height: 28, borderRadius: '50%', border: 'none',
            background: 'rgba(255,255,255,0.06)', color: 'var(--color-text-secondary, #999)',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'background 0.15s',
          }}
          title={t('updateLaterBtn')}
          aria-label={t('updateLaterBtn')}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.12)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)' }}
        >
          <X size={14} />
        </button>

        <div
          style={{
            width: 56, height: 56, borderRadius: '50%', margin: '0 auto 16px',
            background: 'rgba(124,58,237,0.12)', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Download size={26} color="#7c3aed" />
        </div>

        <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--color-text, #fff)', marginBottom: 8 }}>
          {t('updateAvailableTitle')}
        </div>
        <div style={{ fontSize: 13, color: 'var(--color-text-secondary, #999)', lineHeight: 1.6, marginBottom: 22 }}>
          {t('updateAvailableBody', { latest: state.latest, current: state.current })}
        </div>

        <button
          onClick={handleDownload}
          style={{
            width: '100%', padding: '12px 0', borderRadius: 'var(--radius-md)', border: 'none',
            background: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)',
            color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', marginBottom: 10,
            transition: 'filter 0.15s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.filter = 'brightness(1.08)' }}
          onMouseLeave={(e) => { e.currentTarget.style.filter = 'none' }}
        >
          {t('updateDownloadBtn')}
        </button>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={handleLater}
            style={{
              flex: 1, padding: '10px 0', borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--color-border, rgba(255,255,255,0.12))',
              background: 'transparent', color: 'var(--color-text-secondary, #999)',
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
              transition: 'background 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
          >
            {t('updateLaterBtn')}
          </button>
          <button
            onClick={handleSkip}
            style={{
              flex: 1, padding: '10px 0', borderRadius: 'var(--radius-sm)', border: 'none',
              background: 'transparent', color: 'var(--color-text-secondary, #999)',
              fontSize: 12, cursor: 'pointer', textDecoration: 'underline',
              transition: 'color 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-text, #fff)' }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-secondary, #999)' }}
          >
            {t('updateSkipBtn')}
          </button>
        </div>
      </div>
    </div>
  )
}
