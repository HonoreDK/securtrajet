import { supabase } from './supabase'

// Appelle une Edge Function. Les erreurs "non-2xx" de supabase-js sont génériques :
// on lit le vrai message renvoyé par la fonction pour pouvoir l'afficher.
export async function invokeFunction(name, body) {
  const { data, error } = await supabase.functions.invoke(name, { body })
  if (error) {
    let message
    try { message = (await error.context.json()).error } catch { /* réponse non JSON */ }
    throw new Error(message || 'Le service est momentanément indisponible.')
  }
  return data
}
