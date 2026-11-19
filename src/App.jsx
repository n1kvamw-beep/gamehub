import { useEffect, useState } from 'react'
import { supabase } from './supabase.js'

export default function App() {
  const [games, setGames] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!supabase) {
      setError('Supabase não configurado (falta VITE_SUPABASE_URL / VITE_SUPABASE_KEY).')
      setLoading(false)
      return
    }
    supabase
      .from('games')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else setGames(data)
        setLoading(false)
      })
  }, [])

  return (
    <main>
      <h1>GameHub</h1>
      {loading && <p>A carregar...</p>}
      {error && <p className="error">{error}</p>}
      {!loading && !error && games.length === 0 && <p>Ainda não há jogos.</p>}
      <ul className="grid">
        {games.map((g) => (
          <li key={g.id} className="card">
            <h2>{g.title}</h2>
            {g.description && <p>{g.description}</p>}
            <a href={g.url} target="_blank" rel="noreferrer">Jogar</a>
          </li>
        ))}
      </ul>
    </main>
  )
}
