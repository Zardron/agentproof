export function requireRole(role: string) {
  return (user: { role: string }) => user.role === role
}

export function gate(user: { role: string }) {
  requireRole('admin')(user)
  return true
}
