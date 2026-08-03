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
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(180deg, #070512 0%, #0F0A2E 30%, #0C0820 65%, #070512 100%)',
      }} />
      <div style={{
        position: 'absolute', width: 500, height: 500, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(124,58,237,0.12) 0%, transparent 70%)',
        top: '-150px', right: '-150px',
        animation: 'pulse 3s ease-in-out infinite',
      }} />
      <div style={{
        position: 'absolute', width: 400, height: 400, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(124,58,237,0.08) 0%, transparent 70%)',
        bottom: '-100px', left: '-100px',
        animation: 'pulse 3s ease-in-out infinite 1.5s',
      }} />
      <div style={{ position: 'relative', textAlign: 'center', zIndex: 1 }}>
        <div style={{
          width: 92, height: 92, borderRadius: 24,
          overflow: 'hidden',
          margin: '0 auto 24px',
          boxShadow: '0 12px 48px rgba(124,58,237,0.45)',
          animation: 'scaleIn 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
        }}>
          <img
            src="./Hisvex.png" alt="Hisvex"
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        </div>
        <h1 style={{
          fontSize: 32, fontWeight: 800, marginBottom: 12,
          background: 'linear-gradient(135deg, #7c3aed 0%, #a78bfa 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          animation: 'slideUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) 0.1s both',
        }}>
          Hisvex
        </h1>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
          animation: 'slideUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) 0.2s both',
        }}>
          <div style={{
            width: 6, height: 6, borderRadius: '50%', background: '#7c3aed',
            animation: 'pulse 1.4s ease-in-out infinite',
          }} />
          <div style={{
            width: 6, height: 6, borderRadius: '50%', background: '#7c3aed',
            animation: 'pulse 1.4s ease-in-out infinite 0.2s',
          }} />
          <div style={{
            width: 6, height: 6, borderRadius: '50%', background: '#7c3aed',
            animation: 'pulse 1.4s ease-in-out infinite 0.4s',
          }} />
        </div>
      </div>
    </div>
  )
}
