// Connexion par numéro de téléphone + mot de passe.
//   POST { phone: "691234567" | "+237 6 91 23 45 67", password: "..." }
//   → 200 { access_token, refresh_token }   (le navigateur ouvre ensuite la session avec setSession)
//   → 401 { error: "Numéro ou mot de passe incorrect." }  (même message que le numéro existe ou non)
//   → 429 { error: "Trop de tentatives..." }
//
// Le numéro est converti en e-mail côté serveur : l'adresse e-mail n'est jamais renvoyée au navigateur.
// La double authentification (code Google Authenticator) reste exigée ensuite par l'application.
//
// Déploiement (appelée avant connexion, donc sans vérification de JWT) :
//   supabase functions deploy phone-login --no-verify-jwt

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};

const MAX_FAILURES = 8;         // échecs tolérés par numéro...
const WINDOW_MINUTES = 10;      // ...sur cette durée

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

// « +237 6 91 23 45 67 » → « 691234567 » ; null si le numéro n'est pas un numéro camerounais mobile
function normalizePhone(raw: unknown): string | null {
  let d = String(raw ?? "").replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("237")) d = d.slice(3);
  return /^6\d{8}$/.test(d) ? d : null;
}

const BAD_CREDENTIALS = "Numéro ou mot de passe incorrect.";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée." }, 405);

  let body: { phone?: unknown; password?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Requête invalide." }, 400);
  }

  const phone = normalizePhone(body.phone);
  const password = typeof body.password === "string" ? body.password : "";
  if (!phone || !password || password.length > 200) return json({ error: BAD_CREDENTIALS }, 401);

  const url = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  // Anti-devinette : trop d'échecs récents sur ce numéro
  const since = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000).toISOString();
  const { count } = await admin
    .from("phone_login_attempts")
    .select("id", { count: "exact", head: true })
    .eq("phone", phone)
    .gte("attempted_at", since);
  if ((count ?? 0) >= MAX_FAILURES) {
    return json({ error: `Trop de tentatives. Réessaie dans ${WINDOW_MINUTES} minutes.` }, 429);
  }

  const fail = async () => {
    await admin.from("phone_login_attempts").insert({ phone });
    // Ménage : on ne garde pas l'historique des échecs au-delà d'un jour
    await admin
      .from("phone_login_attempts")
      .delete()
      .lt("attempted_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
    return json({ error: BAD_CREDENTIALS }, 401);
  };

  const { data: profile } = await admin.from("profiles").select("email").eq("phone", phone).maybeSingle();
  if (!profile?.email) return await fail();

  const anon = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data, error } = await anon.auth.signInWithPassword({ email: profile.email, password });
  if (error || !data.session) {
    console.error("phone-login: échec d'authentification:", error?.message);
    return await fail();
  }

  return json({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token
  });
});
