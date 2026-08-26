import { t } from '../i18n'

/**
 * Shown while auth hydrates, before the router decides where to send the user.
 *
 * Deliberately the same composition as the mobile native splash (a haloed
 * mark, the two-tone wordmark, a quiet tagline) so the two products read as
 * one app rather than two that happen to share a logo. Everything sits in a
 * single centred stack with real space between the three elements — the
 * previous version had the wordmark as a gradient-clipped heading with a row
 * of pulsing dots hard under it, which crowded the mark and gave the eye no
 * clear order to read in.
 */
export function SplashScreen() {
  return (
    <div style={{
      height: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#070512',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Base gradient — same stops as the mobile splash. */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(180deg, #070512 0%, #100B30 32%, #0C0820 68%, #070512 100%)',
      }} />

      {/* Ambient light, kept off the edges so no glow ends on a hard arc. */}
      <div style={{
        position: 'absolute', width: 720, height: 720, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(124,58,237,0.16) 0%, transparent 70%)',
        top: '-260px', right: '-200px',
        animation: 'pulse 3.4s ease-in-out infinite',
      }} />
      <div style={{
        position: 'absolute', width: 620, height: 620, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(167,139,250,0.10) 0%, transparent 70%)',
        bottom: '-220px', left: '-180px',
        animation: 'pulse 3.4s ease-in-out infinite 1.7s',
      }} />

      <div style={{
        position: 'relative',
        zIndex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        // Optically centred: a stacked lockup reads as sunk when its geometric
        // middle sits exactly on the container's middle.
        transform: 'translateY(-4%)',
      }}>
        <div style={{
          position: 'relative',
          width: 104,
          height: 104,
          marginBottom: 26,
          animation: 'scaleIn 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
        }}>
          {/* Wide, soft halo — depth without a visible circle edge. */}
          <div style={{
            position: 'absolute', inset: '-70%', borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(124,58,237,0.38) 0%, transparent 68%)',
          }} />
          <img
            src="./Hisvex.png"
            alt=""
            style={{
              position: 'relative',
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              filter: 'drop-shadow(0 10px 34px rgba(124,58,237,0.45))',
            }}
          />
        </div>

        <div style={{
          display: 'flex',
          fontSize: 42,
          fontWeight: 800,
          letterSpacing: -1,
          lineHeight: 1,
          marginBottom: 14,
          animation: 'slideUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) 0.1s both',
        }}>
          <span style={{ color: '#A78BFA' }}>His</span>
          <span style={{ color: '#FFFFFF' }}>vex</span>
        </div>

        <div style={{
          fontSize: 13.5,
          letterSpacing: 0.6,
          color: 'rgba(196,181,253,0.62)',
          animation: 'slideUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) 0.2s both',
        }}>
          {t('splashTagline')}
        </div>

        {/* A single sweeping bar rather than three bouncing dots: it reads as
            "loading" without competing with the wordmark right above it. */}
        <div style={{
          position: 'relative',
          width: 132,
          height: 2,
          marginTop: 34,
          borderRadius: 2,
          overflow: 'hidden',
          background: 'rgba(167,139,250,0.12)',
          animation: 'slideUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) 0.3s both',
        }}>
          <div style={{
            position: 'absolute',
            insetBlock: 0,
            width: '40%',
            borderRadius: 2,
            background: 'linear-gradient(90deg, transparent, #7C3AED, #A78BFA, transparent)',
            animation: 'splashSweep 1.35s ease-in-out infinite',
          }} />
        </div>
      </div>

      <style>{`
        @keyframes splashSweep {
          0%   { transform: translateX(-120%); }
          100% { transform: translateX(360%); }
        }
      `}</style>
    </div>
  )
}
