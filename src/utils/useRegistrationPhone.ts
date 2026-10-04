import { useCallback, useEffect, useRef, useState } from 'react'
import { authApi } from '../api/client'
const begin = async () => (await authApi.beginRegistrationPhone()).data
const status = async (token: string) => (await authApi.registrationPhoneStatus(token)).data

export type VerifiedRegistrationPhone = { phone: string; token: string }
type Challenge = { token: string; botUrl: string; expiresAt: string }

export function useRegistrationPhone(onVerified: (value: VerifiedRegistrationPhone | null) => void) {
  const [challenge, setChallenge] = useState<Challenge | null>(null)
  const [loading, setLoading] = useState(false)
  const [waiting, setWaiting] = useState(false)
  const [phone, setPhone] = useState('')
  const [error, setError] = useState('')
  const generation = useRef({ id: 0 })
  const prepare = useCallback(async () => {
    const id = ++generation.current.id
    setLoading(true)
    setError('')
    setChallenge(null)
    setWaiting(false)
    setPhone('')
    onVerified(null)
    try {
      const data = await begin()
      if (generation.current.id === id) setChallenge(data)
    } catch (err) {
      if (generation.current.id === id) setError(err instanceof Error ? err.message : 'Telegram botini ochib bo‘lmadi')
    } finally {
      if (generation.current.id === id) setLoading(false)
    }
  }, [onVerified])

  useEffect(() => {
    const requests = generation.current
    void prepare()
    return () => { requests.id++ }
  }, [prepare])

  useEffect(() => {
    if (!challenge) return
    const id = generation.current.id
    let cancelled = false
    let checking = false
    const expired = () => {
      if (cancelled || generation.current.id !== id) return
      setChallenge(null)
      setWaiting(false)
      setPhone('')
      onVerified(null)
      setError('Tasdiqlash muddati tugadi. Botni qayta oching.')
    }
    const expiresIn = new Date(challenge.expiresAt).getTime() - Date.now()
    if (expiresIn <= 0) { expired(); return }
    const timeout = setTimeout(expired, expiresIn)
    const check = async () => {
      if (cancelled || checking || !waiting) return
      checking = true
      try {
        const data = await status(challenge.token)
        if (cancelled || generation.current.id !== id) return
        if (Date.now() >= new Date(challenge.expiresAt).getTime()) { expired(); return }
        setError('')
        if (data.verified && data.phone) {
          setPhone(data.phone)
          setWaiting(false)
          onVerified({ phone: data.phone, token: challenge.token })
        }
      } catch (err) {
        if (cancelled || generation.current.id !== id) return
        if ((err as { status?: number }).status === 410) expired()
        else setError(err instanceof Error ? err.message : 'Tekshirib bo‘lmadi')
      } finally { checking = false }
    }
    void check()
    const interval = waiting ? setInterval(() => void check(), 2500) : undefined
    return () => { cancelled = true; clearTimeout(timeout); clearInterval(interval) }
  }, [challenge, waiting, onVerified])

  return { challenge, loading, waiting, phone, error, prepare, wait: () => setWaiting(true) }
}
