/**
 * Hook genérico de busca de dados com loading, error e refetch.
 */
import { useState, useEffect, useCallback, useRef } from 'react'

interface UseQueryState<T> {
  data: T | null
  loading: boolean
  error: string | null
  refetch: () => void
}

export function useQuery<T>(
  fetcher: () => Promise<{ data: T | null; error: string | null }>,
  deps: unknown[] = []
): UseQueryState<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const mounted = useRef(true)

  const fetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    const result = await fetcher()
    if (!mounted.current) return
    if (result.error) {
      setError(result.error)
    } else {
      setData(result.data)
    }
    setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(() => {
    mounted.current = true
    fetch()
    return () => { mounted.current = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetch])

  return { data, loading, error, refetch: fetch }
}
