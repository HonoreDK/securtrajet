// Outil de diagnostic ponctuel : trouve la bonne valeur du paramètre "type"
// requis par l'API gps666.net (QXGPS), en testant une plage de valeurs
// candidates avec le compte réel (secrets QXGPS_ACCOUNT / QXGPS_PASSWORD).
//
// Usage : appeler cette fonction une fois, lire la réponse JSON, puis supprimer
// cette fonction (supabase functions delete qxgps-probe) une fois le bon type trouvé.
//
// Protégé par CRON_SECRET pour éviter tout appel non autorisé.

import md5 from "npm:md5@2.3.0";

const QXGPS_API = "http://api.gps666.net/test";
const FIXED_TYPE = 1; // le type n'est pas la cause de l'échec actuel (même erreur peu importe la valeur)
const DELAY_MS = 300;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

  // Variantes plausibles du hash attendu par le champ "pwd_md5"
  const lower = md5(password);
  const variants: Array<{ label: string; pwd_md5: string }> = [
    { label: "md5 minuscule", pwd_md5: lower },
    { label: "md5 majuscule", pwd_md5: lower.toUpperCase() },
    { label: "md5(md5()) minuscule", pwd_md5: md5(lower) },
    { label: "mot de passe en clair (sans hash)", pwd_md5: password }
  ];

  const results: Array<{ label: string; sid_found: boolean; raw: unknown }> = [];

  for (const variant of variants) {
    try {
      const res = await fetch(QXGPS_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          module: "user",
          func: "Login",
          params: { account, pwd_md5: variant.pwd_md5, flag: "e_account_login", platform: "web", type: FIXED_TYPE }
        })
      });
      const json = await res.json();
      const sid = json.sid || json.data?.sid || json.session_id;
      results.push({ label: variant.label, sid_found: Boolean(sid), raw: json });
    } catch (err) {
      results.push({ label: variant.label, sid_found: false, raw: String(err) });
    }
    await sleep(DELAY_MS);
  }

  return new Response(JSON.stringify({ results }, null, 2), { headers: { "Content-Type": "application/json" } });
});
