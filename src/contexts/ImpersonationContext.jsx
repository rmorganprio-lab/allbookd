import { createContext, useContext, useState } from 'react'

const ImpersonationContext = createContext(null)

export function ImpersonationProvider({ children }) {
  const [impersonated, setImpersonated] = useState(null) // { user, realUser } | null

  function startImpersonation(user, realUser) {
    setImpersonated({ user, realUser })
  }

  function stopImpersonation() {
    setImpersonated(null)
  }

  return (
    <ImpersonationContext.Provider value={{ impersonated, startImpersonation, stopImpersonation }}>
      {children}
    </ImpersonationContext.Provider>
  )
}

export function useImpersonation() {
  const ctx = useContext(ImpersonationContext)
  if (!ctx) throw new Error('useImpersonation must be used within ImpersonationProvider')
  return ctx
}
