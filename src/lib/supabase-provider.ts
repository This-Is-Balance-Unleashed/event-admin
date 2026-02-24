import { createClient } from '@supabase/supabase-js'
import { fetchUtils } from 'ra-core'
import { supabaseDataProvider } from 'ra-supabase-core'

const instanceUrl = import.meta.env.VITE_SUPABASE_URL as string
const apiKey = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY as string

export const supabaseClient = createClient(instanceUrl, apiKey)

// ra-supabase-core's default httpClient copies supabaseClient['headers'] which
// only contains X-Client-Info — it never sends Authorization: Bearer <key>.
// Supabase requires that header to identify the service role and bypass RLS.
const httpClient = async (url: string, options: fetchUtils.Options = {}) => {
  if (!options.headers) options.headers = new Headers()
  const headers = options.headers as Headers
  headers.set('apikey', apiKey)
  headers.set('Authorization', `Bearer ${apiKey}`)
  return fetchUtils.fetchJson(url, options)
}

export const dataProvider = supabaseDataProvider({
  instanceUrl,
  apiKey,
  supabaseClient,
  httpClient,
})
