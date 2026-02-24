import { createClient } from '@supabase/supabase-js'
import { supabaseDataProvider } from 'ra-supabase'

const instanceUrl = import.meta.env.VITE_SUPABASE_URL as string
const apiKey = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY as string

export const supabaseClient = createClient(instanceUrl, apiKey)

export const dataProvider = supabaseDataProvider({
  instanceUrl,
  apiKey,
  supabaseClient,
})
