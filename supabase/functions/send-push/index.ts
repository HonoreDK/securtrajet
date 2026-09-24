// Envoie une notification push à tous les appareils abonnés d'un parent, déclenchée
// par le trigger SQL "on_alert_created_push" (voir supabase/add_push_notifications.sql)
// à chaque nouvelle ligne insérée dans "alerts". Jamais appelée directement par le frontend.
//
// Secrets requis (supabase secrets set ...) :
//   VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY -> paire de clés Web Push (générées une fois, fixes)
//   CRON_SECRET                          -> même secret partagé que les autres tâches planifiées
//
// Déploiement : supabase functions deploy send-push --no-verify-jwt

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

Deno.serve(async (req) => {
  if (req.headers.get("x-cron-secret") !== Deno.env.get("CRON_SECRET")) {
    return new Response("Unauthorized", { status: 401 });
  }

  const vapidPublic = Deno.env.get("VAPID_PUBLIC_KEY");
  const vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY");
  if (!vapidPublic || !vapidPrivate) {
    return new Response(JSON.stringify({ error: "VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY manquants" }), { status: 500 });
  }
  webpush.setVapidDetails("mailto:contact@securtrajet.app", vapidPublic, vapidPrivate);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const { alert_id } = await req.json();
    const { data: alert, error: alertError } = await supabase
      .from("alerts")
      .select("*")
      .eq("id", alert_id)
      .single();
    if (alertError || !alert) {
      return new Response(JSON.stringify({ error: "Alerte introuvable" }), { status: 404 });
    }

    const { data: subs, error: subsError } = await supabase
      .from("push_subscriptions")
      .select("*")
      .eq("parent_id", alert.parent_id);
    if (subsError) throw subsError;

    const payload = JSON.stringify({
      title: alert.title || "SecurTrajet",
      body: alert.message,
      url: alert.child_id ? `/child/${alert.child_id}` : "/dashboard"
    });

    let sent = 0;
    for (const sub of subs || []) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        );
        sent++;
      } catch (err) {
        // Abonnement expiré/révoqué côté navigateur : on le retire pour ne plus le solliciter.
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await supabase.from("push_subscriptions").delete().eq("id", sub.id);
        } else {
          console.error("send-push: échec d'envoi", statusCode, String(err));
        }
      }
    }

    return new Response(JSON.stringify({ ok: true, sent, total: (subs || []).length }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    console.error("send-push error:", err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
