import { generateLicense } from './generate-license';
import { validateLicense } from './validate-license';
import { webhookTest } from './webhook-test';

export default {
  // Este método recibe (request, env, ctx)
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/generate-license') {
      return generateLicense(request, env);
    }
    if (url.pathname === '/validate-license') {
      return validateLicense(request, env);
    }
    if (url.pathname === '/webhook-test') {
      return webhookTest(request, env);
    }
    return new Response('Not Found', { status: 404 });
  }
};

