import { BrowserRouter, Routes, Route, NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, FileText, GanttChartSquare, Package, Warehouse,
  History, ShoppingCart, Calendar, ClipboardList, Upload, X, ChevronRight, Box, Settings, Banknote, LogOut
} from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { AuthProvider, useAuth } from '@/context/AuthContext'
import Login from '@/pages/Login'

// Pages (lazy imports)
import Dashboard from '@/pages/Dashboard'
import Pregoes from '@/pages/Pregoes'
import PregaoDetalhes from '@/pages/PregaoDetalhes'
import Diagonal from '@/pages/Diagonal'
import Estoque from '@/pages/Estoque'
import Fornecimentos from '@/pages/Fornecimentos'
import Compras from '@/pages/Compras'
import Planejamento from '@/pages/Planejamento'
import Produtos from '@/pages/Produtos'
import Pedidos from '@/pages/Pedidos'
import NotasCredito from '@/pages/NotasCredito'
import ImportarDados from '@/pages/ImportarDados'
import Configuracoes from '@/pages/Configuracoes'

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { to: '/pregoes', label: 'Pregões', icon: FileText },
  { to: '/diagonal', label: 'Diagonal', icon: GanttChartSquare },
  { to: '/compras', label: 'Compras', icon: ShoppingCart },
  { to: '/planejamento', label: 'Planejamento', icon: Calendar },
  { to: '/produtos', label: 'Produtos', icon: Package },
  { to: '/estoque', label: 'Estoque', icon: Warehouse },
  { to: '/fornecimentos', label: 'Fornecimentos', icon: History },
  { to: '/notas-credito', label: 'Notas de Crédito', icon: Banknote },
  { to: '/pedidos', label: 'Pedidos de Empenho', icon: ClipboardList },
  { to: '/importar-dados', label: 'Importar Dados', icon: Upload },
  { to: '/configuracoes', label: 'Configurações', icon: Settings },
]

function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return (
    <aside className={cn(
      'fixed left-0 top-0 h-full z-30 flex flex-col transition-all duration-300',
      'bg-surface-800 border-r border-surface-600/40',
      collapsed ? 'w-16' : 'w-60'
    )}>
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-surface-600/40">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center shadow-lg shadow-primary-500/20 shrink-0">
          <Box size={18} className="text-white" />
        </div>
        {!collapsed && (
          <div className="overflow-hidden">
            <p className="text-sm font-bold text-white leading-tight">GERSUP</p>
            <p className="text-[10px] text-surface-400 leading-tight">Gestão de Suprimento</p>
          </div>
        )}
        <button
          onClick={onToggle}
          className="ml-auto text-surface-400 hover:text-surface-100 transition-colors"
        >
          {collapsed ? <ChevronRight size={16} /> : <X size={16} />}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-0.5">
        {NAV_ITEMS.map(({ to, label, icon: Icon, exact }) => (
          <NavLink
            key={to}
            to={to}
            end={exact}
            className={({ isActive }) => cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-150',
              isActive
                ? 'bg-primary-600/20 text-primary-300 font-medium'
                : 'text-surface-300 hover:text-surface-50 hover:bg-surface-700'
            )}
            title={collapsed ? label : undefined}
          >
            <Icon size={18} className="shrink-0" />
            {!collapsed && <span className="truncate">{label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      {!collapsed && (
        <div className="px-4 py-3 border-t border-surface-600/40">
          <p className="text-[10px] text-surface-300">Mercado Nacional • v1.0</p>
        </div>
      )}
    </aside>
  )
}

function Header() {
  const location = useLocation()
  const { user, signOut } = useAuth()
  const [signingOut, setSigningOut] = useState(false)
  const current = NAV_ITEMS.find(n =>
    n.exact ? location.pathname === n.to : location.pathname.startsWith(n.to)
  )

  const handleLogout = async () => {
    setSigningOut(true)
    try {
      await signOut()
    } finally {
      setSigningOut(false)
    }
  }

  // Extrai iniciais do e-mail para o avatar
  const initials = user?.email
    ? user.email.substring(0, 2).toUpperCase()
    : 'GS'

  return (
    <header className="h-14 flex items-center gap-4 px-6 bg-surface-800/80 border-b border-surface-600/40 backdrop-blur-sm sticky top-0 z-20">
      <h1 className="text-sm font-semibold text-surface-50">{current?.label ?? 'GERSUP'}</h1>
      <div className="ml-auto flex items-center gap-3">
        {/* Avatar com e-mail */}
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-primary-700 flex items-center justify-center">
            <span className="text-xs font-bold text-white">{initials}</span>
          </div>
          <span className="text-xs text-surface-300 hidden sm:block max-w-[160px] truncate">
            {user?.email ?? 'Gerente de Suprimento'}
          </span>
        </div>

        {/* Botão de logout */}
        <button
          id="header-logout-btn"
          onClick={handleLogout}
          disabled={signingOut}
          title="Sair"
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-surface-400 hover:text-red-400 hover:bg-red-500/10 transition-all duration-150 text-xs disabled:opacity-50"
        >
          {signingOut ? (
            <span className="w-3.5 h-3.5 border border-surface-400 border-t-transparent rounded-full animate-spin" />
          ) : (
            <LogOut size={14} />
          )}
          <span className="hidden sm:inline">Sair</span>
        </button>
      </div>
    </header>
  )
}

function AppShell() {
  const { user, loading } = useAuth()
  const [collapsed, setCollapsed] = useState(false)

  // Tela de loading inicial enquanto verifica sessão
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-900">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center">
            <Box size={20} className="text-white" />
          </div>
          <div className="w-5 h-5 border-2 border-primary-500/40 border-t-primary-500 rounded-full animate-spin" />
        </div>
      </div>
    )
  }

  // Redireciona para login se não autenticado
  if (!user) {
    return <Login />
  }

  return (
    <div className="min-h-screen flex">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(c => !c)} />
      <div className={cn('flex-1 flex flex-col transition-all duration-300', collapsed ? 'ml-16' : 'ml-60')}>
        <Header />
        <main className="flex-1 p-6">
          <ErrorBoundary>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/pregoes" element={<Pregoes />} />
              <Route path="/pregoes/:id" element={<PregaoDetalhes />} />
              <Route path="/diagonal" element={<Diagonal />} />
              <Route path="/estoque" element={<Estoque />} />
              <Route path="/fornecimentos" element={<Fornecimentos />} />
              <Route path="/compras" element={<Compras />} />
              <Route path="/planejamento" element={<Planejamento />} />
              <Route path="/produtos" element={<Produtos />} />
              <Route path="/pedidos" element={<Pedidos />} />
              <Route path="/notas-credito" element={<NotasCredito />} />
              <Route path="/importar-dados" element={<ImportarDados />} />
              <Route path="/configuracoes" element={<Configuracoes />} />
            </Routes>
          </ErrorBoundary>
        </main>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppShell />
      </BrowserRouter>
    </AuthProvider>
  )
}
