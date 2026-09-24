import { supabase } from './supabase'

// Clé publique VAPID — publique par conception, sans risque à exposer côté client.
const VAPID_PUBLIC_KEY = 'BL_t3OtVzkkO07BbxkHjXoSmGRuDcLp1NR-ihNhpnRswdLxwlwiZW4EhPs001FivRhZ0ee68ye3f0hm-I5cqJ1g'

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)))
}

export function isPushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window
}

export async function getPushPermissionState() {
  if (!isPushSupported()) return 'unsupported'
  return Notification.permission // 'default' | 'granted' | 'denied'
}

export async function subscribeToPush(parentId) {
  const registration = await navigator.serviceWorker.ready
  let subscription = await registration.pushManager.getSubscription()

  if (!subscription) {
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') {
      throw new Error('Permission de notification refusée.')
    }
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
    })
  }

  const json = subscription.toJSON()
  const { error } = await supabase.from('push_subscriptions').upsert({
    parent_id: parentId,
    endpoint: json.endpoint,
    p256dh: json.keys.p256dh,
    auth: json.keys.auth
  }, { onConflict: 'endpoint' })
  if (error) throw error

  return subscription
}

export async function unsubscribeFromPush() {
  if (!isPushSupported()) return
  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.getSubscription()
  if (!subscription) return

  await supabase.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint)
  await subscription.unsubscribe()
}

export async function isSubscribedToPush() {
  if (!isPushSupported()) return false
  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.getSubscription()
  return Boolean(subscription)
}
