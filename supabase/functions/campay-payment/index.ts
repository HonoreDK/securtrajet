// Paiement de l'abonnement SecurTrajet via CamPay (Orange Money / MTN MoMo).
//
// Deux actions, appelées par le frontend (utilisateur connecté, JWT vérifié) :
//   { action: "collect", phone: "691234567" }  -> déclenche la demande de paiement sur le téléphone
//   { action: "status",  reference: "..." }    -> interroge CamPay ; si SUCCESSFUL, prolonge l'abonnement
//
// L'abonnement n'est jamais activé sur la parole du navigateur : seul le statut renvoyé par
// CamPay (appel serveur à serveur) fait foi, et chaque paiement n'est crédité qu'une fois.
//
// API CamPay (vérifiée sur le SDK officiel https://github.com/CamPay/campay-python-sdk) :
//   POST {host}/api/token/            {username, password}                 -> {token}
//   POST {host}/api/collect/          Authorization: Token <token>         -> {reference, ussd_code, operator}
//   GET  {host}/api/transaction/<ref>/                                     -> {status: PENDING|SUCCESSFUL|FAILED, amount, ...}
//   host : https://demo.campay.net (sandbox) | https://www.campay.net (production)
//
// Secrets requis (supabase secrets set ...) :
//   CAMPAY_ACCESS_TOKEN                       -> jeton permanent (section "APP KEYS" de l'application) [recommandé]
//   ou CAMPAY_APP_USERNAME + CAMPAY_APP_PASSWORD -> identifiants de l'application (jeton temporaire)
//   CAMPAY_ENV                                -> "PROD" pour le vrai argent ; sinon sandbox (défaut)
//
// Déploiement : supabase functions deploy campay-payment   (vérification JWT activée)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CAMPAY_HOST = Deno.env.get("CAMPAY_ENV") === "PROD" ? "https://www.campay.net" : "https://demo.campay.net";
const AMOUNT_XAF = 2500;
const PERIOD_DAYS = 30;
const MAX_INITIATIONS_PER_HOUR = 5;
const PENDING_COOLDOWN_MS = 90_000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

// deno-lint-ignore no-explicit-any
type AdminClient = any;

// Erreur dont le message est sûr à afficher à l'utilisateur (jamais de secret dedans).
class CampayError extends Error {}

const ENV_LABEL = Deno.env.get("CAMPAY_ENV") === "PROD" ? "production" : "sandbox (demo.campay.net)";

async function campayToken(): Promise<string> {
  // Méthode 1 (doc CamPay) : jeton d'accès permanent, section "APP KEYS" de l'application.
  const permanent = Deno.env.get("CAMPAY_ACCESS_TOKEN");
  if (permanent) return permanent;

  // Méthode 2 : jeton temporaire obtenu avec le username/password de l'application.
  let res: Response;
  try {
    res = await fetch(`${CAMPAY_HOST}/api/token/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: Deno.env.get("CAMPAY_APP_USERNAME"),
        password: Deno.env.get("CAMPAY_APP_PASSWORD")
      })
    });
  } catch (err) {
    console.error("CamPay injoignable:", String(err));
    throw new CampayError("CamPay est injoignable pour le moment, réessaie plus tard.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.token) {
    console.error("CamPay token refusé, HTTP", res.status, JSON.stringify(data));
    throw new CampayError(
      `CamPay refuse les identifiants de l'application en mode ${ENV_LABEL}. ` +
      "Vérifie CAMPAY_APP_USERNAME / CAMPAY_APP_PASSWORD (ceux de l'application, pas de ton compte) " +
      "et que l'environnement correspond à ton compte."
    );
  }
  return data.token;
}

async function handleCollect(userId: string, body: { phone?: unknown }, admin: AdminClient) {
  const phone = String(body.phone ?? "").replace(/\s/g, "");
  if (!/^6\d{8}$/.test(phone)) {
    return json({ error: "Numéro invalide : 9 chiffres commençant par 6 (ex : 691234567)." }, 400);
  }

  const { data: profile } = await admin
    .from("profiles").select("is_approved, role").eq("id", userId).single();
  if (!profile || (!profile.is_approved && profile.role !== "admin")) {
    return json({ error: "Ton compte n'est pas encore validé par un administrateur." }, 403);
  }

  // Garde-fous : chaque demande envoie une notification sur un téléphone, il ne faut pas
  // pouvoir utiliser cette fonction pour harceler un numéro.
  const since = new Date(Date.now() - 3_600_000).toISOString();
  const { data: recent } = await admin
    .from("payments").select("status, created_at").eq("parent_id", userId).gte("created_at", since);
  if ((recent?.length ?? 0) >= MAX_INITIATIONS_PER_HOUR) {
    return json({ error: "Trop de tentatives, réessaie dans un moment." }, 429);
  }
  const hasFreshPending = (recent ?? []).some(
    (p: { status: string; created_at: string }) =>
      p.status === "PENDING" && Date.now() - new Date(p.created_at).getTime() < PENDING_COOLDOWN_MS
  );
  if (hasFreshPending) {
    return json({ error: "Une demande de paiement est déjà en cours, patiente un instant." }, 429);
  }

  const token = await campayToken();
  const paymentId = crypto.randomUUID();
  const res = await fetch(`${CAMPAY_HOST}/api/collect/`, {
    method: "POST",
    headers: { Authorization: `Token ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      amount: String(AMOUNT_XAF),
      currency: "XAF",
      from: `237${phone}`,
      description: "Abonnement SecurTrajet (1 mois)",
      external_reference: paymentId
    })
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 || res.status === 403) {
    throw new CampayError(`CamPay refuse le jeton d'accès en mode ${ENV_LABEL} : vérifie CAMPAY_ACCESS_TOKEN.`);
  }
  if (!res.ok || !data.reference) {
    console.error("CamPay collect refusé, HTTP", res.status, data?.message);
    return json({ error: data?.message || "Le paiement n'a pas pu être initié." }, 502);
  }

  const { error: insertError } = await admin.from("payments").insert({
    id: paymentId,
    parent_id: userId,
    campay_reference: data.reference,
    amount: AMOUNT_XAF,
    currency: "XAF",
    phone: `237${phone}`,
    operator: data.operator ?? null
  });
  if (insertError) {
    console.error("Enregistrement du paiement échoué:", insertError.message);
    return json({ error: "Paiement initié mais non enregistré, contacte le support." }, 500);
  }

  return json({ reference: data.reference, operator: data.operator ?? null, ussd_code: data.ussd_code ?? null });
}

async function extendSubscription(userId: string, admin: AdminClient) {
  const { data: p, error } = await admin
    .from("profiles")
    .select("subscription_status, subscription_ends_at, trial_ends_at")
    .eq("id", userId).single();
  if (error || !p) throw new Error("Profil introuvable pour la prolongation");

  const now = new Date();
  // On prolonge à partir de la fin de l'abonnement/essai en cours (payer en avance ne fait rien perdre).
  let base = now;
  if (p.subscription_status === "active" && p.subscription_ends_at && new Date(p.subscription_ends_at) > base) {
    base = new Date(p.subscription_ends_at);
  } else if (p.subscription_status === "trial" && p.trial_ends_at && new Date(p.trial_ends_at) > base) {
    base = new Date(p.trial_ends_at);
  }
  const newEnd = new Date(base.getTime() + PERIOD_DAYS * 86_400_000);

  const update: Record<string, string> = {
    subscription_status: "active",
    subscription_ends_at: newEnd.toISOString(),
    last_payment_at: now.toISOString(),
    updated_at: now.toISOString()
  };
  if (p.subscription_status !== "active") update.subscription_started_at = now.toISOString();

  const { error: updateError } = await admin.from("profiles").update(update).eq("id", userId);
  if (updateError) throw updateError;
}

async function handleStatus(userId: string, body: { reference?: unknown }, admin: AdminClient) {
  const reference = String(body.reference ?? "");
  if (!/^[0-9a-fA-F-]{20,64}$/.test(reference)) {
    return json({ error: "Référence invalide." }, 400);
  }

  const { data: payment } = await admin
    .from("payments").select("*").eq("campay_reference", reference).eq("parent_id", userId).maybeSingle();
  if (!payment) return json({ error: "Paiement introuvable." }, 404);
  if (payment.applied) return json({ status: "SUCCESSFUL" });
  if (payment.status === "FAILED") return json({ status: "FAILED" });

  const token = await campayToken();
  const res = await fetch(`${CAMPAY_HOST}/api/transaction/${reference}/`, {
    headers: { Authorization: `Token ${token}`, "Content-Type": "application/json" }
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 || res.status === 403) {
    throw new CampayError(`CamPay refuse le jeton d'accès en mode ${ENV_LABEL} : vérifie CAMPAY_ACCESS_TOKEN.`);
  }
  if (!res.ok) {
    console.error("CamPay statut indisponible, HTTP", res.status);
    return json({ status: "PENDING" }); // erreur ponctuelle : le frontend réessaiera
  }

  if (data.status === "FAILED") {
    await admin.from("payments").update({ status: "FAILED" }).eq("id", payment.id);
    return json({ status: "FAILED" });
  }
  if (data.status !== "SUCCESSFUL") return json({ status: "PENDING" });

  if (Number(data.amount) !== AMOUNT_XAF || data.currency !== "XAF") {
    console.error("Montant/devise inattendus pour", payment.id, data.amount, data.currency);
    await admin.from("payments").update({ status: "FAILED" }).eq("id", payment.id);
    return json({ status: "FAILED" });
  }

  // Réclamation atomique : un seul appel concurrent obtient la ligne, donc un seul crédit.
  const { data: claimed, error: claimError } = await admin
    .from("payments")
    .update({ status: "SUCCESSFUL", applied: true, operator: data.operator ?? payment.operator })
    .eq("id", payment.id).eq("applied", false).select("id");
  if (claimError) throw claimError;
  if (!claimed || claimed.length === 0) return json({ status: "SUCCESSFUL" });

  try {
    await extendSubscription(userId, admin);
  } catch (err) {
    await admin.from("payments").update({ applied: false }).eq("id", payment.id); // le prochain appel réessaiera
    throw err;
  }
  return json({ status: "SUCCESSFUL" });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Non authentifié" }, 401);

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return json({ error: "Session invalide" }, 401);

    const hasToken = Boolean(Deno.env.get("CAMPAY_ACCESS_TOKEN"));
    const hasLogin = Boolean(Deno.env.get("CAMPAY_APP_USERNAME") && Deno.env.get("CAMPAY_APP_PASSWORD"));
    if (!hasToken && !hasLogin) {
      return json({ error: "Paiement non configuré (jeton ou identifiants CamPay manquants)." }, 500);
    }

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json();

    if (body.action === "collect") return await handleCollect(user.id, body, admin);
    if (body.action === "status") return await handleStatus(user.id, body, admin);
    return json({ error: "Action inconnue" }, 400);
  } catch (err) {
    console.error("campay-payment error:", err);
    if (err instanceof CampayError) return json({ error: err.message }, 502);
    return json({ error: "Erreur interne du paiement." }, 500);
  }
});
