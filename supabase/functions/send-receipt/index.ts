// Envoie au parent le reçu de son paiement manuel, une fois celui-ci validé par un administrateur.
// Appelée par la page Administration (administrateur connecté, JWT vérifié) :
//   { payment_id: "<uuid>", resend?: true }
//
// L'e-mail part du compte Gmail de l'administrateur via un script Google Apps Script déployé en
// application web (voir docs/apps-script-receipt-mailer.gs). Chaque reçu n'est envoyé qu'une fois,
// sauf demande explicite de renvoi.
//
// Secrets requis (supabase secrets set ...) :
//   GAS_MAIL_URL   -> URL de déploiement du script (se termine par /exec)
//   GAS_MAIL_TOKEN -> jeton partagé, identique à la propriété MAIL_TOKEN du script
//   APP_URL        -> (optionnel) adresse du site, pour afficher le logo dans l'e-mail
//
// Déploiement : supabase functions deploy send-receipt

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildReceipt } from "./receipt.ts";

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

// Erreur dont le message est sûr à afficher à l'administrateur.
class MailError extends Error {}

function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  return `${user.slice(0, 1)}***@${domain}`;
}

async function sendViaAppsScript(url: string, token: string, mail: { to: string; subject: string; html: string; text: string }) {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, fromName: "SecurTrajet", ...mail }),
      redirect: "follow"
    });
  } catch (err) {
    console.error("Script d'envoi injoignable:", String(err));
    throw new MailError("Le service d'envoi d'e-mails est injoignable pour le moment.");
  }
  const text = await res.text();
  let data: { ok?: boolean; error?: string };
  try {
    data = JSON.parse(text);
  } catch {
    console.error("Réponse non JSON du script d'envoi, HTTP", res.status, text.slice(0, 200));
    throw new MailError("Réponse inattendue du script d'envoi : vérifie qu'il est déployé avec l'accès « Tout le monde ».");
  }
  if (!data.ok) {
    console.error("Script d'envoi a refusé:", data.error);
    throw new MailError(`Le script d'envoi a refusé la demande (${data.error ?? "erreur inconnue"}).`);
  }
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

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: me } = await admin.from("profiles").select("role").eq("id", user.id).single();
    if (me?.role !== "admin") return json({ error: "Action réservée aux administrateurs." }, 403);

    const scriptUrl = Deno.env.get("GAS_MAIL_URL");
    const scriptToken = Deno.env.get("GAS_MAIL_TOKEN");
    if (!scriptUrl || !scriptToken) {
      return json({ error: "Envoi d'e-mails non configuré (GAS_MAIL_URL / GAS_MAIL_TOKEN manquants)." }, 500);
    }

    const { payment_id, resend } = await req.json();
    if (!/^[0-9a-fA-F-]{36}$/.test(String(payment_id ?? ""))) {
      return json({ error: "Identifiant de paiement invalide." }, 400);
    }

    const { data: payment } = await admin
      .from("manual_payments")
      .select("*, parent:profiles!parent_id(first_name, last_name, email, subscription_ends_at)")
      .eq("id", payment_id)
      .maybeSingle();
    if (!payment) return json({ error: "Paiement introuvable." }, 404);
    if (payment.status !== "approved") return json({ error: "Ce paiement n'a pas encore été validé." }, 409);

    const email: string | undefined = payment.parent?.email;
    if (!email) return json({ error: "Ce parent n'a pas d'adresse e-mail." }, 422);

    // Réservation atomique : un seul appel envoie le reçu, même si l'on clique deux fois.
    if (!resend) {
      const { data: claimed } = await admin
        .from("manual_payments")
        .update({ receipt_sent_at: new Date().toISOString() })
        .eq("id", payment.id)
        .is("receipt_sent_at", null)
        .select("id");
      if (!claimed || claimed.length === 0) return json({ ok: true, already: true, to: maskEmail(email) });
    }

    try {
      const parentName = `${payment.parent.first_name ?? ""} ${payment.parent.last_name ?? ""}`.trim() || "Parent";
      const mail = buildReceipt({
        receiptNo: payment.receipt_no,
        parentName,
        provider: payment.provider,
        transactionRef: payment.transaction_ref,
        senderPhone: payment.sender_phone,
        amount: payment.amount,
        paidAt: payment.reviewed_at ?? payment.created_at,
        validUntil: payment.parent.subscription_ends_at,
        logoUrl: `${Deno.env.get("APP_URL") ?? "https://securtrajet-iwwg.vercel.app"}/pwa-192x192.png`
      });
      await sendViaAppsScript(scriptUrl, scriptToken, { to: email, ...mail });
    } catch (err) {
      // L'envoi a échoué : on libère la réservation pour pouvoir réessayer.
      if (!resend) await admin.from("manual_payments").update({ receipt_sent_at: null }).eq("id", payment.id);
      throw err;
    }

    if (resend) {
      await admin.from("manual_payments").update({ receipt_sent_at: new Date().toISOString() }).eq("id", payment.id);
    }
    return json({ ok: true, to: maskEmail(email) });
  } catch (err) {
    console.error("send-receipt error:", err);
    if (err instanceof MailError) return json({ error: err.message }, 502);
    return json({ error: "Erreur interne lors de l'envoi du reçu." }, 500);
  }
});
