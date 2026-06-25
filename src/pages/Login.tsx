import { useState, FormEvent } from 'react'
import { Box, LogIn, Eye, EyeOff, AlertCircle } from 'lucide-react'
import { signIn } from '@/lib/auth'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await signIn(email, password)
      // AuthContext detectará a sessão automaticamente via onAuthStateChange
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao fazer login.'
      if (msg.includes('Invalid login credentials')) {
        setError('E-mail ou senha inválidos.')
      } else if (msg.includes('Email not confirmed')) {
        setError('E-mail não confirmado. Verifique sua caixa de entrada.')
      } else {
        setError(msg)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-900 relative overflow-hidden">
      {/* Gradient orbs de fundo */}
      <div
        className="absolute inset-0 pointer-events-none"
        aria-hidden="true"
      >
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-primary-600/10 blur-[120px]" />
        <div className="absolute bottom-0 left-1/4 w-[400px] h-[400px] rounded-full bg-primary-800/10 blur-[100px]" />
      </div>

      <div className="relative w-full max-w-md px-6">
        {/* Card principal */}
        <div className="bg-surface-800/80 backdrop-blur-xl border border-surface-600/40 rounded-2xl shadow-2xl shadow-black/40 p-8">
          {/* Logo e título */}
          <div className="flex flex-col items-center mb-8">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center shadow-lg shadow-primary-500/30 mb-4">
              <Box size={28} className="text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">GERSUP</h1>
            <p className="text-sm text-surface-400 mt-1">Gestão de Suprimento</p>
          </div>

          {/* Formulário */}
          <form onSubmit={handleSubmit} className="space-y-5" id="login-form">
            {/* Campo de e-mail */}
            <div>
              <label
                htmlFor="login-email"
                className="block text-xs font-medium text-surface-300 mb-1.5"
              >
                E-mail
              </label>
              <input
                id="login-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="seu@email.com"
                className="w-full px-4 py-2.5 rounded-lg bg-surface-700/60 border border-surface-600/60 text-surface-50 placeholder:text-surface-500 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/60 focus:border-primary-500/60 transition-all"
              />
            </div>

            {/* Campo de senha */}
            <div>
              <label
                htmlFor="login-password"
                className="block text-xs font-medium text-surface-300 mb-1.5"
              >
                Senha
              </label>
              <div className="relative">
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-4 py-2.5 pr-11 rounded-lg bg-surface-700/60 border border-surface-600/60 text-surface-50 placeholder:text-surface-500 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/60 focus:border-primary-500/60 transition-all"
                />
                <button
                  type="button"
                  id="toggle-password-visibility"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-200 transition-colors"
                  tabIndex={-1}
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Mensagem de erro */}
            {error && (
              <div
                id="login-error"
                role="alert"
                className="flex items-start gap-2.5 px-3.5 py-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm"
              >
                <AlertCircle size={16} className="shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {/* Botão de login */}
            <button
              id="login-submit"
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary-600 hover:bg-primary-500 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium transition-all duration-200 shadow-lg shadow-primary-600/20 focus:outline-none focus:ring-2 focus:ring-primary-500/60"
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Entrando…
                </>
              ) : (
                <>
                  <LogIn size={16} />
                  Entrar
                </>
              )}
            </button>
          </form>

          {/* Rodapé */}
          <p className="mt-6 text-center text-[11px] text-surface-500">
            Acesso restrito a usuários autorizados.<br />
            Entre em contato com o administrador para obter acesso.
          </p>
        </div>

        {/* Versão */}
        <p className="text-center text-[10px] text-surface-600 mt-4">
          GERSUP v1.0 • Mercado Nacional
        </p>
      </div>
    </div>
  )
}
