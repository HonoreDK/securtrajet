// Construction du reçu de paiement (sujet, HTML, texte brut). Fonction pure, sans dépendance
// à Deno, pour pouvoir la tester facilement.

export interface ReceiptData {
  receiptNo: number | string;
  parentName: string;
  provider: "orange" | "mtn";
  transactionRef: string;
  senderPhone: string;
  amount: number;
  paidAt: string | Date; // date de validation du paiement
  validUntil: string | Date | null; // fin de l'abonnement après ce paiement
  logoUrl?: string;
}

const PROVIDER_LABEL = { orange: "Orange Money", mtn: "MTN Mobile Money" };
const TZ = "Africa/Douala";

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function formatReceiptNumber(n: number | string): string {
  return `REC-${String(n).padStart(6, "0")}`;
}

function maskPhone(phone: string): string {
  return `•••••• ${String(phone).slice(-3)}`;
}

export function buildReceipt(d: ReceiptData): { subject: string; html: string; text: string } {
  const number = formatReceiptNumber(d.receiptNo);
  const provider = PROVIDER_LABEL[d.provider] ?? d.provider;
  const amount = `${new Intl.NumberFormat("fr-FR").format(d.amount).replace(/[  ]/g, " ")} FCFA`;
  const paidAt = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short", timeZone: TZ })
    .format(new Date(d.paidAt));
  const validUntil = d.validUntil
    ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: TZ }).format(new Date(d.validUntil))
    : null;
  const phone = maskPhone(d.senderPhone);
  const subject = `Votre reçu de paiement SecurTrajet n° ${number}`;

  const rows: Array<[string, string]> = [
    ["Reçu n°", number],
    ["Date de validation", paidAt],
    ["Montant", amount],
    ["Moyen de paiement", provider],
    ["Référence de la transaction", d.transactionRef],
    ["Numéro payeur", phone],
    ["Désignation", "Abonnement SecurTrajet — 1 mois"]
  ];
  if (validUntil) rows.push(["Abonnement valable jusqu'au", validUntil]);

  const rowsHtml = rows.map(([label, value]) => `
        <tr>
          <td style="padding:10px 0;border-top:1px solid #e2e8f0;color:#64748b;font-size:13px;">${escapeHtml(label)}</td>
          <td style="padding:10px 0;border-top:1px solid #e2e8f0;color:#0f172a;font-size:14px;font-weight:600;text-align:right;">${escapeHtml(value)}</td>
        </tr>`).join("");

  const logo = d.logoUrl
    ? `<img src="${escapeHtml(d.logoUrl)}" alt="SecurTrajet" width="44" height="44" style="border-radius:10px;vertical-align:middle;margin-right:10px;">`
    : "";

  const html = `<!doctype html>
<html lang="fr">
<body style="margin:0;padding:0;background:#eff6ff;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eff6ff;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;">
        <tr><td style="background:#1d4ed8;padding:20px 24px;color:#ffffff;">
          ${logo}<span style="font-size:20px;font-weight:700;vertical-align:middle;">SecurTrajet</span>
          <div style="font-size:13px;opacity:.85;margin-top:6px;">Reçu de paiement</div>
        </td></tr>
        <tr><td style="padding:24px;">
          <p style="margin:0 0 6px;font-size:15px;color:#0f172a;">Bonjour ${escapeHtml(d.parentName)},</p>
          <p style="margin:0 0 18px;font-size:14px;color:#334155;line-height:1.5;">
            Nous avons bien reçu votre paiement et votre abonnement est activé. Merci pour votre confiance !
          </p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rowsHtml}
          </table>
          <p style="margin:20px 0 0;font-size:12px;color:#94a3b8;line-height:1.5;">
            Ce document atteste du paiement indiqué ci-dessus. Conservez-le pour vos archives.
          </p>
        </td></tr>
        <tr><td style="background:#f8fafc;padding:14px 24px;font-size:12px;color:#94a3b8;text-align:center;">
          SecurTrajet — Nova Tech Solution
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = [
    "SecurTrajet — Reçu de paiement",
    "",
    `Bonjour ${d.parentName},`,
    "Nous avons bien reçu votre paiement et votre abonnement est activé. Merci pour votre confiance !",
    "",
    ...rows.map(([label, value]) => `${label} : ${value}`),
    "",
    "Ce document atteste du paiement indiqué ci-dessus. Conservez-le pour vos archives.",
    "SecurTrajet — Nova Tech Solution"
  ].join("\n");

  return { subject, html, text };
}
