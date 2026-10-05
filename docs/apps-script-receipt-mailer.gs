/**
 * Envoi des reçus SecurTrajet depuis un compte Gmail (Google Apps Script).
 *
 * Installation : voir les étapes dans la conversation / le README. Ce fichier ne contient aucun
 * secret : le jeton partagé est stocké dans les "Propriétés du script" (MAIL_TOKEN), pas ici.
 *
 * Déployer en "Application Web" : exécuter en tant que "Moi", accès "Tout le monde".
 * L'URL du déploiement et MAIL_TOKEN doivent rester confidentiels (ils permettent d'envoyer
 * des e-mails depuis ce compte) ; ils sont enregistrés comme secrets Supabase par l'administrateur.
 */

var EMAIL_RE = /^[^\s,;<>]+@[^\s,;<>]+\.[^\s,;<>]+$/;

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var token = PropertiesService.getScriptProperties().getProperty('MAIL_TOKEN');

    if (!token || body.token !== token) return reply({ ok: false, error: 'unauthorized' });
    // Un seul destinataire valide : ce script n'est pas un outil d'envoi en masse.
    if (typeof body.to !== 'string' || !EMAIL_RE.test(body.to)) return reply({ ok: false, error: 'invalid recipient' });
    if (!body.subject || !body.html) return reply({ ok: false, error: 'missing subject or html' });

    var message = {
      to: body.to,
      subject: String(body.subject).slice(0, 200),
      htmlBody: String(body.html),
      body: body.text ? String(body.text) : '',
      name: body.fromName ? String(body.fromName).slice(0, 60) : 'SecurTrajet'
    };
    if (body.replyTo && EMAIL_RE.test(body.replyTo)) message.replyTo = body.replyTo;

    MailApp.sendEmail(message);
    return reply({ ok: true });
  } catch (err) {
    return reply({ ok: false, error: String(err) });
  }
}

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
