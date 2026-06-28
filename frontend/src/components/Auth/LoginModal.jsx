import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../hooks/useAuth'
import toast from 'react-hot-toast'

export function LoginModal({ onClose }) {
  const { t } = useTranslation()
  const { signIn, signUp } = useAuth()
  const [mode, setMode]         = useState('login')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [busy, setBusy]         = useState(false)
  const [err, setErr]           = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setErr('')
    setBusy(true)
    try {
      if (mode === 'login') {
        await signIn(email, password)
        toast.success(t('auth.signedIn'))
      } else {
        await signUp(email, password, username)
        toast.success(t('auth.accountCreated'))
      }
      onClose()
    } catch (error) {
      setErr(error.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ position: 'relative' }}>
        <button className="modal-close" onClick={onClose} aria-label={t('auth.close')}>×</button>
        <h2>{mode === 'login' ? t('auth.signIn') : t('auth.createAccount')}</h2>

        <form onSubmit={handleSubmit}>
          {mode === 'register' && (
            <div className="form-group">
              <label>{t('auth.username')}</label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder={t('auth.usernamePlaceholder')}
                required
                minLength={3}
              />
            </div>
          )}
          <div className="form-group">
            <label>{t('auth.email')}</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder={t('auth.emailPlaceholder')}
              required
            />
          </div>
          <div className="form-group">
            <label>{t('auth.password')}</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              minLength={6}
            />
          </div>

          {err && <p className="form-error">{err}</p>}

          <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={busy}>
            {busy ? t('auth.wait') : (mode === 'login' ? t('auth.signIn') : t('auth.createAccount'))}
          </button>
        </form>

        <p style={{ marginTop: 14, fontSize: '.85rem', textAlign: 'center', color: 'var(--color-muted)' }}>
          {mode === 'login' ? t('auth.noAccount') : t('auth.hasAccount')}{' '}
          <button
            style={{ background: 'none', border: 'none', color: 'var(--color-primary)', cursor: 'pointer', fontWeight: 600 }}
            onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setErr('') }}
          >
            {mode === 'login' ? t('auth.register') : t('auth.signIn')}
          </button>
        </p>
      </div>
    </div>
  )
}
