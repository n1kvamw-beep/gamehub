# GameHub

PWA (React + Vite) para uma biblioteca de jogos HTML5, com os dados no Supabase.

## Desenvolvimento

```bash
cp .env.example .env   # preenche VITE_SUPABASE_KEY
npm install
npm run dev
```

## Supabase

Tabela `games` (id, title, description, url, cover_url, created_at) com leitura pública (RLS).

## Deploy

Ligado ao Vercel: cada push para `main` faz deploy. Variáveis necessárias: `VITE_SUPABASE_URL` e `VITE_SUPABASE_KEY`.
