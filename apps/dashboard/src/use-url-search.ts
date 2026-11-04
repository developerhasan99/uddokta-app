import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'

// Search box text that waits for a pause in typing, then goes in the URL as ?q=.
export function useUrlSearch() {
  const [params, setParams] = useSearchParams()
  const query = params.get('q') ?? ''
  const [text, setText] = useState(query)

  // Back/forward and links can change the query without typing in this input.
  useEffect(() => { setText(query) }, [query])

  useEffect(() => {
    const value = text.trim()
    if (value === query) return
    const timer = setTimeout(() => setParams((current) => {
      const next = new URLSearchParams(current)
      if (value) next.set('q', value)
      else next.delete('q')
      return next
    }, { replace: true }), 250)
    return () => clearTimeout(timer)
  }, [text, query, setParams])

  return { query, text, setText }
}
