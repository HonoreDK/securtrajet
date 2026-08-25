# SecurTrajet v2 — PWA + Supabase

Plateforme de **suivi familial GPS** avec :

- ✅ Authentification forte (Supabase Auth + confirmation email)
- ✅ Isolation stricte des données (RLS) : chaque parent ne voit que ses enfants
- ✅ Validation administrateur obligatoire à l'inscription
- ✅ Période d'essai gratuite de **30 jours**
- ✅ Abonnement **2 500 FCFA / mois** après l'essai
- ✅ Géofencing actif (déclenchement d'alertes à l'entrée/sortie de zone)
- ✅ Notifications push navigateur (Realtime + Notification API)
- ✅ Dashboard admin pour approuver et modifier les utilisateurs
- ✅ PWA installable

---

## 1. Créer le projet Supabase (gratuit)

1. Allez sur [https://supabase.com](https://supabase.com) et créez un compte / projet.
2. Dans le projet → **SQL Editor** → New query.
3. Copiez-collez **tout le contenu** de `supabase/schema.sql` et cliquez **Run**.
4. Allez dans **Authentication → Providers** et activez **Email**.
5. (Optionnel) Dans Authentication → Settings, activez "Confirm email".
6. Récupérez :
   - **Project URL**
   - **anon public** key  
   (Settings → API)

7. Créez le premier administrateur :
   - Inscrivez-vous normalement via l'app.
   - Puis dans Supabase → Table Editor → `profiles` → changez le `role` de votre utilisateur en `admin` et `is_approved = true`.

---

## 2. Configurer le frontend

```bash
cd frontend
cp .env.example .env
```

Éditez `.env` :

```
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

Puis :

```bash
npm install
npm run dev
```

---

## 3. Fonctionnalités principales

| Fonctionnalité              | Statut |
|----------------------------|--------|
| Auth email + mot de passe  | ✅     |
| Validation admin           | ✅     |
| Trial 30 jours             | ✅     |
| Abonnement 2500 FCFA       | ✅ (simulé – brancher Flutterwave/Paystack) |
| Isolation parent           | ✅ RLS |
| Géofencing actif           | ✅ trigger SQL |
| Alertes                    | ✅     |
| Temps réel (Realtime)      | prêt   |
| Push navigateur            | prêt   |
| Dashboard Admin            | ✅     |

---

## 4. Paiement (2 500 FCFA)

Actuellement le bouton « Payer » simule le succès.  
Pour la production, intégrez :

- **Flutterwave** ou **Paystack** (excellent pour le Cameroun / Afrique)
- Ou **Mobile Money** (MTN / Orange)

Après paiement réussi → appeler `activateSubscription()`.

---

## 5. Notifications Push

Le navigateur demande la permission.  
Les alertes (géofencing, batterie, etc.) sont reçues via **Supabase Realtime** et affichées avec l’API Notification.

---

## 6. Structure

```
securtrajet/
├── supabase/
│   └── schema.sql          ← à exécuter dans Supabase
├── frontend/
│   ├── .env.example
│   ├── src/
│   │   ├── lib/supabase.js
│   │   ├── context/AuthContext.jsx
│   │   ├── components/SubscriptionGate.jsx
│   │   ├── pages/ (Login, Register, Dashboard, Admin…)
│   │   └── ...
└── README.md
```

---

**SecurTrajet** — Gardez leurs trajets à portée de regard.  
1 mois gratuit → puis 2 500 FCFA/mois.
