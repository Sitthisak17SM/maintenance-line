// Web App entry points. One /exec URL serves both the LINE webhook and the LIFF API (PLAN §6–7).

function doGet(e) {
  return ContentService.createTextOutput('Maintenance LINE is running');
}

function doPost(e) {
  const isWebhook = !!(e && e.parameter && e.parameter.key !== undefined);
  return isWebhook ? Webhook_handle(e) : Api_handle(e);
}
