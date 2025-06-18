import { generateLicense } from './generate-license';
import { validateLicense } from './validate-license';
import { webhookTest } from './webhook-test';

addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);

  if (url.pathname === '/generate-license') {
    event.respondWith(generateLicense(request));
  } else if (url.pathname === '/validate-license') {
    event.respondWith(validateLicense(request));
  } else if (url.pathname === '/webhook-test') {
    event.respondWith(webhookTest(request));
  } else {
    event.respondWith(new Response('Not Found', { status: 404 }));
  }
});
