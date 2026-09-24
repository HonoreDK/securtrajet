// Synchronise les positions des traceurs physiques QXGPS (plateforme gps666.net)
// vers la table "positions" de SecurTrajet. Appelée périodiquement par pg_cron
// (voir supabase/add_qxgps_integration.sql), jamais directement par le frontend.
//
// Requête/en-têtes/flux vérifiés via une intégration tierce publique et fonctionnelle :
// https://github.com/sjoerdlier/11stedenlivetrack/blob/main/bridge/bridge.py
// (endpoint réel https://www.gps666.net/mapi, distinct de l'endpoint "test" documenté
// publiquement ; sans les en-têtes façon navigateur ci-dessous, le serveur rejette la
// requête avant même de vérifier les identifiants).
//
// Secrets requis (supabase secrets set ...) :
//   QXGPS_ACCOUNT   -> identifiant du compte QXGPS (celui utilisé dans l'app mobile)
//   QXGPS_PASSWORD  -> mot de passe en clair (le hash MD5 requis par l'API est calculé ici)
//   CRON_SECRET     -> secret partagé pour authentifier les appels planifiés (pg_net)
//
// Déploiement : supabase functions deploy qxgps-sync --no-verify-jwt
// (--no-verify-jwt car cette fonction est appelée par pg_cron, pas par un utilisateur connecté ;
//  la vérification se fait nous-mêmes via CRON_SECRET ci-dessous)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import md5 from "npm:md5@2.3.0";

const QXGPS_API = "https://www.gps666.net/mapi";
const QXGPS_APP_TYPE = 58; // confirmé pour QXGPS par une intégration tierce fonctionnelle

const BROWSER_HEADERS = {
  "Content-Type": "application/x-www-form-urlencoded",
  "Origin": "https://gps666.net",
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "en-GB,en;q=0.9,en-US;q=0.8",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0",
  "sec-ch-ua": '"Not=A?Brand";v="99", "Microsoft Edge";v="151", "Chromium";v="151"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"Windows"',
  "Sec-Fetch-Dest": "empty",
  "Sec-Fetch-Mode": "cors",
  "Sec-Fetch-Site": "same-site"
};

async function qxgpsCall(module: string, func: string, params: Record<string, unknown>, sid?: string | null) {
  const url = sid ? `${QXGPS_API}?sid=${encodeURIComponent(sid)}` : QXGPS_API;
  const res = await fetch(url, {
    method: "POST",
    headers: BROWSER_HEADERS,
    body: JSON.stringify({ params, module, func })
  });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Réponse QXGPS non-JSON pour ${module}.${func} (HTTP ${res.status}): ${text.slice(0, 300)}`);
  }
}

async function qxgpsLogin(account: string, password: string) {
  const data = await qxgpsCall("user", "Login", {
    account,
    pwd_md5: md5(password),
    lang: "ch",
    platform: "web",
    type: QXGPS_APP_TYPE,
    info: "securtrajet-sync"
  });
  if (data.errcode !== 0) {
    throw new Error(`Connexion QXGPS échouée: ${JSON.stringify(data)}`);
  }
  const sid = data.sid;

  // Le flux du site officiel rappelle GetFamilyList juste après Login et utilise
  // le sid de *cette* réponse plutôt que celui de Login directement.
  const familyData = await qxgpsCall(
    "family",
    "GetFamilyList",
    { f_limit_size: 100, g_limit_size: 100, familyid: "" },
    sid
  );
  if (familyData.errcode !== 0) {
    throw new Error(`GetFamilyList échoué: ${JSON.stringify(familyData)}`);
  }
  const sfamily = familyData.familys?.[0]?.sid;
  if (!sfamily) throw new Error(`Aucune famille trouvée: ${JSON.stringify(familyData)}`);

  return { sid, sfamily };
}

Deno.serve(async (req) => {
  if (req.headers.get("x-cron-secret") !== Deno.env.get("CRON_SECRET")) {
    return new Response("Unauthorized", { status: 401 });
  }

  const account = Deno.env.get("QXGPS_ACCOUNT");
  const password = Deno.env.get("QXGPS_PASSWORD");
  if (!account || !password) {
    return new Response(JSON.stringify({ error: "QXGPS_ACCOUNT / QXGPS_PASSWORD manquants" }), { status: 500 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const { sid, sfamily } = await qxgpsLogin(account, password);

    const runInfo = await qxgpsCall("family", "GetRunInfo", { limit_size: 500, sfamily }, sid);
    if (runInfo.errcode !== 0) {
      throw new Error(`GetRunInfo échoué: ${JSON.stringify(runInfo)}`);
    }
    const items = runInfo.items || [];

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

      let pos: { wgs?: string; time?: number } = {};
      try {
        pos = typeof item.last_pos === "string" ? JSON.parse(item.last_pos) : (item.last_pos || {});
      } catch {
        continue;
      }
      if (!pos.wgs) continue;

      const [latitude, longitude] = pos.wgs.split(",").map(Number);
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
