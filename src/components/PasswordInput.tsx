import { useState, forwardRef } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { t } from '../i18n'

/**
 * A password `<input>` with a show/hide toggle, so a mistyped password isn't
 * discovered only after the submit fails — every password field in the app
 * (login, register, admin creation) used to mask unconditionally with no way
 * to check what was actually typed.
 *
 * Takes the same props a plain `<input type="password">` would; `style` is
 * applied to the input itself (a right-side gap is added automatically so
 * the toggle button never overlaps typed text).
 */
export const PasswordInput = forwardRef<HTMLInputElement, Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'>>(
  function PasswordInput({ style, ...props }, ref) {
    const [visible, setVisible] = useState(false)

    return (
      <div style={{ position: 'relative' }}>
        <input
          {...props}
          ref={ref}
          type={visible ? 'text' : 'password'}
          style={{ ...style, paddingRight: 40, boxSizing: 'border-box' }}
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setVisible((v) => !v)}
          title={visible ? t('hidePassword') : t('showPassword')}
          aria-label={visible ? t('hidePassword') : t('showPassword')}
          style={{
            position: 'absolute',
            right: 4,
            top: '50%',
            transform: 'translateY(-50%)',
            width: 30,
            height: 30,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: 'none',
            background: 'transparent',
            color: 'var(--color-text-secondary)',
            cursor: 'pointer',
            borderRadius: 6,
            padding: 0,
          }}
        >
          {visible ? <EyeOff size={17} /> : <Eye size={17} />}
        </button>
      </div>
    )
  },
)
