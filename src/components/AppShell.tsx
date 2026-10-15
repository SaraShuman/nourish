import { Outlet } from 'react-router-dom'
import './AppShell.css'

/**
 * AppShell wraps every page. It constrains the layout to mobile width,
 * centers it on wider screens, and renders the current route via <Outlet />.
 */
export function AppShell() {
  return (
    <div className="app-shell">
      <div className="app-shell__inner">
        <Outlet />
      </div>
    </div>
  )
}
