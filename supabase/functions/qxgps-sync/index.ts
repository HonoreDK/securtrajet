// Synchronise les positions des traceurs physiques QXGPS (plateforme gps666.net)
// vers la table "positions" de SecurTrajet. Appelée périodiquement par pg_cron
// (voir supabase/add_qxgps_integration.sql), jamais directement par le frontend.
//
// Secrets requis (supabase secrets set ...) :
//   QXGPS_ACCOUNT   -> identifiant du compte QXGPS (celui utilisé dans l'app mobile)
//   QXGPS_PASSWORD  -> mot de passe en clair (le hash MD5 requis par l'API est calculé ici)
//   QXGPS_APP_TYPE  -> identifiant numérique de l'app, à obtenir auprès du support QXGPS
//   CRON_SECRET     -> secret partagé pour authentifier les appels planifiés (pg_net)
//
// Déploiement : supabase functions deploy qxgps-sync --no-verify-jwt
// (--no-verify-jwt car cette fonction est appelée par pg_cron, pas par un utilisateur connecté ;
//  la vérification se fait nous-mêmes via CRON_SECRET ci-dessous)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import md5 from "npm:md5@2.3.0";

const QXGPS_API = "http://api.gps666.net/test";

async function qxgpsCall(func: string, module: string, params: Record<string, unknown>, sid?: string) {
  const url = sid ? `${QXGPS_API}?sid=${encodeURIComponent(sid)}` : QXGPS_API;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ module, func, params })
  });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Réponse QXGPS non-JSON pour ${module}.${func}: ${text.slice(0, 300)}`);
  }
}

Deno.serve(async (req) => {
  if (req.headers.get("x-cron-secret") !== Deno.env.get("CRON_SECRET")) {
    return new Response("Unauthorized", { status: 401 });
  }

  const account = Deno.env.get("QXGPS_ACCOUNT");
  const password = Deno.env.get("QXGPS_PASSWORD");
  const appType = Deno.env.get("QXGPS_APP_TYPE");

  if (!account || !password || !appType) {
    return new Response(JSON.stringify({ error: "QXGPS_ACCOUNT / QXGPS_PASSWORD / QXGPS_APP_TYPE manquants" }), { status: 500 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    // 1. Connexion à la plateforme QXGPS
    const loginRes = await qxgpsCall("Login", "user", {
      account,
      pwd_md5: md5(password),
      flag: "e_account_login",
      platform: "web",
      type: Number(appType)
    });

    // Le nom exact du champ de session n'est pas garanti par la doc publique :
    // on essaie les variantes les plus probables et on loggue la réponse brute si aucune ne marche.
    const sid = loginRes.sid || loginRes.data?.sid || loginRes.session_id;
    if (!sid) {
      console.error("Réponse Login QXGPS inattendue:", JSON.stringify(loginRes));
      return new Response(JSON.stringify({ error: "Connexion QXGPS échouée", raw: loginRes }), { status: 502 });
    }

    // 2. Récupère le statut temps réel de tous les appareils du compte
    const runInfo = await qxgpsCall("GetRunInfo", "family", {
      call_all_dev: false,
      limit_size: 200
    }, sid);

    const items = runInfo.items || runInfo.data?.items || [];

    // 3. Récupère les enfants ayant un traceur QXGPS associé
    const { data: children, error: childrenError } = await supabase
      .from("children")
      .select("id, parent_id, qxgps_imei")
      .not("qxgps_imei", "is", null);
    if (childrenError) throw childrenError;

    const byImei = new Map(children.map((c: { qxgps_imei: string }) => [String(c.qxgps_imei), c]));

    let synced = 0;
    for (const item of items) {
      const child = byImei.get(String(item.imei));
      if (!child) continue; // aucun enfant n'utilise ce traceur

      let pos: { lat?: number; lon?: number; wgs?: string; time?: number } = {};
      try {
        pos = typeof item.last_pos === "string" ? JSON.parse(item.last_pos) : (item.last_pos || {});
      } catch {
        continue;
      }

      let latitude: number | null = null;
      let longitude: number | null = null;
      if (pos.wgs) {
        const [lat, lon] = pos.wgs.split(",").map(Number);
        latitude = lat;
        longitude = lon;
      } else if (pos.lat && pos.lon) {
        // Certains champs sont renvoyés multipliés par 1e6 par cette plateforme
        latitude = pos.lat > 1000 ? pos.lat / 1e6 : pos.lat;
        longitude = pos.lon > 1000 ? pos.lon / 1e6 : pos.lon;
      }
      if (latitude == null || longitude == null) continue;

      const recordedAt = pos.time
        ? new Date(pos.time * 1000).toISOString()
        : new Date().toISOString();

      await supabase.from("positions").insert({
        child_id: child.id,
        parent_id: child.parent_id,
        latitude,
        longitude,
        battery: item.power ?? null,
        recorded_at: recordedAt
      });

      await supabase.from("children").update({
        battery: item.power ?? null,
        status: item.expire ? "offline" : "online",
        last_seen_at: recordedAt
      }).eq("id", child.id);

      synced++;
    }

    return new Response(JSON.stringify({ ok: true, synced, devices_seen: items.length }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    console.error("qxgps-sync error:", err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
