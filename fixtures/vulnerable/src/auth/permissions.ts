export function gate(_user: { role: string }) {
  // requireRole("admin") removed — intentional vulnerable fixture
  return true
}
