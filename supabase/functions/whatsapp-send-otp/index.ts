import { Webhook } from 'https://esm.sh/standardwebhooks@1.0.0';

type PhoneAuthHookEvent = {
  user?: { phone?: string };
  sms?: { otp?: string };
};

type WhatsAppResponse = {
  messages?: Array<{ id?: string }>;
  error?: { code?: number; type?: string };
};

const jsonResponse = (body: Record<string, string>, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

Deno.serve(async request => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const hookSecret = Deno.env.get('PHONE_AUTH_HOOK_SECRET');
  const accessToken = Deno.env.get('WHATSAPP_ACCESS_TOKEN');
  const phoneNumberId = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID');
  const graphApiVersion = Deno.env.get('WHATSAPP_GRAPH_API_VERSION');
  if (!hookSecret || !accessToken || !phoneNumberId || !graphApiVersion) {
    console.error('Required WhatsApp hook or Meta Cloud API configuration is missing.');
    return jsonResponse({ error: 'WhatsApp delivery is not configured.' }, 500);
  }
  if (!/^\d+$/.test(phoneNumberId) || !/^v\d+\.\d+$/.test(graphApiVersion)) {
    console.error('Meta Cloud API phone-number ID or version is invalid.');
    return jsonResponse({ error: 'WhatsApp delivery configuration is invalid.' }, 500);
  }

  let event: PhoneAuthHookEvent;
  try {
    const secret = hookSecret.replace(/^v1,whsec_/, '');
    event = new Webhook(secret).verify(await request.text(), Object.fromEntries(request.headers)) as PhoneAuthHookEvent;
  } catch {
    return jsonResponse({ error: 'Invalid phone-auth hook signature.' }, 401);
  }

  const phone = event.user?.phone;
  const otp = event.sms?.otp;
  if (!phone || !/^\+[1-9]\d{7,14}$/.test(phone) || !otp || !/^\d{6}$/.test(otp)) {
    return jsonResponse({ error: 'The phone-auth hook payload is incomplete or invalid.' }, 400);
  }

  let response: Response;
  try {
    response = await fetch(`https://graph.facebook.com/${graphApiVersion}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: phone.slice(1),
        type: 'template',
        template: {
          name: 'kayan_driver_otp',
          language: { code: 'en_US' },
          components: [
            {
              type: 'body',
              parameters: [{ type: 'text', text: otp }],
            },
            {
              type: 'button',
              sub_type: 'url',
              index: '0',
              parameters: [{ type: 'text', text: otp }],
            },
          ],
        },
      }),
    });
  } catch {
    console.error('Could not reach Meta WhatsApp Cloud API.');
    return jsonResponse({ error: 'The WhatsApp provider could not be reached.' }, 502);
  }

  let providerResult: WhatsAppResponse | null = null;
  try {
    providerResult = await response.json();
  } catch {
    console.error('Meta returned an unreadable WhatsApp response.', { status: response.status });
    return jsonResponse({ error: 'The WhatsApp provider returned an invalid response.' }, 502);
  }

  if (!response.ok || !providerResult?.messages?.[0]?.id) {
    console.error('Meta did not accept the WhatsApp request.', {
      status: response.status,
      errorCode: providerResult?.error?.code,
      errorType: providerResult?.error?.type,
    });
    return jsonResponse({ error: 'The WhatsApp provider rejected the message.' }, 502);
  }

  return new Response(null, { status: 200 });
});
