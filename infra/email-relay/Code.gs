
const SENDER_NAME = 'IT OnSite';

function doPost(e) {
  const secret = PropertiesService.getScriptProperties().getProperty('RELAY_SECRET');
  let data;
  try {
    data = JSON.parse(e.postData.contents);
  } catch (err) {
    return reply('INVALID');
  }
  if (!secret || data.secret !== secret) return reply('FORBIDDEN');
  if (!data.to || !data.subject || !data.body) return reply('INVALID');
  if (MailApp.getRemainingDailyQuota() < 1) return reply('QUOTA');
  MailApp.sendEmail({ to: data.to, subject: data.subject, body: data.body, name: SENDER_NAME });
  return reply('OK');
}

function reply(text) {
  return ContentService.createTextOutput(text).setMimeType(ContentService.MimeType.TEXT);
}
