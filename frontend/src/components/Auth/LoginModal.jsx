import { useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import toast from 'react-hot-toast'

export function LoginModal({ onClose }) {
  const { signIn, signUp } = useAuth()
  const [mode, setMode]       = useState('login') // 'login' | 'register'
  const [email, setEmail]     = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [busy, setBusy]       = useState(false)
  const [err, setErr]         = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setErr('')
    setBusy(true)
    try {
      if (mode === 'login') {
        await signIn(email, password)
        toast.success('Signed in!')
      } else {
        await signUp(email, password, username)
        toast.success('Account created — check your email to confirm.')
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
        <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        <h2>{mode === 'login' ? 'Sign In' : 'Create Account'}</h2>

        <form onSubmit={handleSubmit}>
          {mode === 'register' && (
            <div className="form-group">
              <label>Username</label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="your_username"
                required
                minLength={3}
              />
            </div>
          )}
          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </div>
          <div className="form-group">
            <label>Password</label>
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
            {busy ? 'Please wait…' : (mode === 'login' ? 'Sign In' : 'Create Account')}
          </button>
        </form>

        <p style={{ marginTop: 14, fontSize: '.85rem', textAlign: 'center', color: 'var(--color-muted)' }}>
          {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
          <button
            style={{ background: 'none', border: 'none', color: 'var(--color-primary)', cursor: 'pointer', fontWeight: 600 }}
            onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setErr('') }}
          >
            {mode === 'login' ? 'Register' : 'Sign In'}
          </button>
        </p>
      </div>
    </div>
  )
}
