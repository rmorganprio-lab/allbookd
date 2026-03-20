import { createContext, useContext, useState } from 'react'

const AdminOrgContext = createContext(null)

export function AdminOrgProvider({ children }) {
  const [adminViewOrg, setAdminViewOrg] = useState(null)

  function exitAdminView() {
    setAdminViewOrg(null)
  }

  return (
    <AdminOrgContext.Provider value={{
      adminViewOrg,
      setAdminViewOrg,
      exitAdminView,
      isAdminViewing: !!adminViewOrg,
    }}>
      {children}
    </AdminOrgContext.Provider>
  )
}

export function useAdminOrg() {
  const ctx = useContext(AdminOrgContext)
  if (!ctx) throw new Error('useAdminOrg must be used within AdminOrgProvider')
  return ctx
}
