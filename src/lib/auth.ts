import { supabase } from './supabase'

/**
 * Faz login com e-mail e senha via Supabase Auth.
 */
export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })
  if (error) throw error
  return data
}

/**
 * Faz logout do usuário atual.
 */
export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

/**
 * Retorna a sessão atual (pode ser null se não estiver logado).
 */
export async function getSession() {
  const { data } = await supabase.auth.getSession()
  return data.session
}

/**
 * Retorna o usuário atual (pode ser null).
 */
export async function getUser() {
  const { data } = await supabase.auth.getUser()
  return data.user
}
