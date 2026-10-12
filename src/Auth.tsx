
import { useState } from 'react'
import { supabase } from './lib/supabase'

type AuthProps = {
  onSuccess: () => void
}

export default function Auth({ onSuccess }: AuthProps) {
  const [isLogin, setIsLogin] = useState(true)
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setMessage('')
    setLoading(true)

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        })
        if (error) throw error
        onSuccess()
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName },
          },
        })
        if (error) throw error

        setMessage(
          data.session
            ? 'Account created successfully!'
            : 'Account created. Check your email to confirm your address before signing in.'
        )
      }
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Something went wrong.'
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <main style={{
      maxWidth: 420,
      margin: '60px auto',
      padding: 24,
      fontFamily: 'Arial, sans-serif',
    }}>
      <h1>Online Banking</h1>
      <h2>{isLogin ? 'Welcome back' : 'Create your account'}</h2>
      <p>
        {isLogin
          ? 'Sign in to continue.'
          : 'Register to get started.'}
      </p>

      <form onSubmit={handleSubmit}>
        {!isLogin && (
          <label style={{ display: 'block', marginBottom: 12 }}>
            Full name
            <input
              required
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              style={{ display: 'block', width: '100%', padding: 10 }}
            />
          </label>
        )}

        <label style={{ display: 'block', marginBottom: 12 }}>
          Email address
          <input
            type="email"
            required
            value={email}
            onChange={e => setEmail(e.target.value)}
            style={{ display: 'block', width: '100%', padding: 10 }}
          />
        </label>

        <label style={{ display: 'block', marginBottom: 12 }}>
          Password
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={e => setPassword(e.target.value)}
            style={{ display: 'block', width: '100%', padding: 10 }}
          />
        </label>

        <button
          type="submit"
          disabled={loading}
          style={{ width: '100%', padding: 12, cursor: 'pointer' }}
        >
          {loading
            ? 'Please wait...'
            : isLogin ? 'Sign In' : 'Create Account'}
        </button>
      </form>

      {message && <p role="status">{message}</p>}

      <p>
        {isLogin ? 'New here?' : 'Already registered?'}{' '}
        <button
          type="button"
          onClick={() => {
            setIsLogin(!isLogin)
            setMessage('')
          }}
        >
          {isLogin ? 'Create an account' : 'Sign in'}
        </button>
      </p>
    </main>
  )
}
