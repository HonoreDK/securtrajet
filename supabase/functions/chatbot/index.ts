// Edge Function : proxy sécurisé vers l'API Gemini (Google AI Studio) pour le chatbot d'aide.
// La clé GEMINI_API_KEY reste côté serveur (secret Supabase), jamais exposée au frontend.
// Déploiement : supabase functions deploy chatbot
// Secret requis : supabase secrets set GEMINI_API_KEY=xxxxx

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GEMINI_MODEL = "gemini-2.0-flash";
const MAX_HISTORY = 12; // derniers messages envoyés au modèle (limite le coût/latence)

const SYSTEM_PROMPT = `Tu es l'assistant intégré de SecurTrajet, une application de suivi familial GPS pour parents au Cameroun.

Fonctionnement de l'application :
- Un parent crée un compte, doit être validé par un administrateur, puis bénéficie de 30 jours d'essai gratuit, ensuite l'abonnement coûte 2 500 FCFA/mois (payable via Orange Money ou MTN Mobile Money, depuis l'onglet "Abonnement").
- Le parent ajoute ses enfants depuis l'onglet "Mes enfants" (bouton "Ajouter"), avec prénom, nom, date de naissance et une photo optionnelle qui sert à l'identifier sur la carte.
- L'onglet "Carte" affiche la position en temps réel de chaque enfant équipé d'un traceur GPS (vue standard ou satellite, sélectionnable en haut à droite de la carte). Tant qu'aucun traceur n'a encore envoyé de position, la carte reste vide pour cet enfant.
- L'onglet "Alertes" regroupe les notifications (batterie faible, appareil hors-ligne, etc.).
- Les paramètres du compte (nom, email, déconnexion) sont dans l'onglet "Paramètres".

Ton rôle : répondre aux questions sur l'utilisation de l'application, et donner des conseils brefs et pratiques de sécurité routière/familiale pour les parents (trajets scolaires, vigilance, bonnes pratiques). Réponds en français, de façon concise et chaleureuse. Si une question sort du cadre de l'application ou de la sécurité familiale, réponds brièvement puis recentre poliment la conversation. Tu n'as pas accès aux données réelles du compte de l'utilisateur (positions, enfants) : si on te le demande, invite la personne à consulter les onglets correspondants dans l'application.`;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Non authentifié" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Vérifie que le token correspond bien à un utilisateur Supabase réel
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Session invalide" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const { messages } = await req.json();
    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: "Aucun message fourni" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Chatbot non configuré (clé API manquante)" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const recent = messages.slice(-MAX_HISTORY);
    const contents = recent.map((m: { role: string; text: string }) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: String(m.text || "").slice(0, 4000) }]
    }));

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents,
          generationConfig: { maxOutputTokens: 512, temperature: 0.6 }
        })
      }
    );

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error("Gemini API error:", geminiRes.status, errText);
      return new Response(JSON.stringify({ error: "Le service de chat est momentanément indisponible." }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const data = await geminiRes.json();
    const reply = data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || "").join("") || "";

    if (!reply) {
      return new Response(JSON.stringify({ error: "Réponse vide du chatbot, réessaie." }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    return new Response(JSON.stringify({ reply }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (err) {
    console.error("chatbot function error:", err);
    return new Response(JSON.stringify({ error: "Erreur interne du chatbot." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
