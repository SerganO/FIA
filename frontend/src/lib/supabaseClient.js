import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !key) {
  console.warn(
    '[CycloSafe] Supabase env vars missing — falling back to local sample data.\n' +
    'Copy frontend/.env.local.example to .env.local and fill in your credentials.'
  )
}

export const supabase = (url && key)
  ? createClient(url, key)
  : null
