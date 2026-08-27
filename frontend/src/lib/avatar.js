import { supabase } from './supabase'

export async function uploadAvatar(file, path) {
  const { error } = await supabase.storage.from('avatars').upload(path, file, {
    upsert: true,
    contentType: file.type,
    cacheControl: '3600'
  })
  if (error) throw error
  const { data } = supabase.storage.from('avatars').getPublicUrl(path)
  return `${data.publicUrl}?t=${Date.now()}`
}

export function fileExt(file) {
  const parts = file.name.split('.')
  return parts.length > 1 ? parts.pop().toLowerCase() : 'jpg'
}
