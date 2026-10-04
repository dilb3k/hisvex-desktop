// Presence is separate from the JWT lifetime. An idle but open app still
// proves its session is alive; a closed/offline app stops renewing the lease.
export function startSessionHeartbeat(send: () => Promise<unknown>, isActive: () => boolean) {
  let stopped = false
  let inFlight = false
  const ping = async () => {
    if (stopped || inFlight || !isActive()) return
    inFlight = true
    try { await send() } catch { /* Network outages do not sign a user out. */ }
    finally { inFlight = false }
  }
  const interval = setInterval(() => { void ping() }, 60_000)
  void ping()
  return { ping, stop: () => { stopped = true; clearInterval(interval) } }
}
