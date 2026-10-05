import { Webhook } from 'https://esm.sh/standardwebhooks@1.0.0';

type SmsHookEvent = {
  user?: { phone?: string };
  sms?: { otp?: string };
};

const jsonResponse = (body: Record<string, string>, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

Deno.serve(async request => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const hookSecret = Deno.env.get('SEND_SMS_HOOK_SECRET');
  const yoolaApiKey = Deno.env.get('YOOLA_API_KEY');
  if (!hookSecret || !yoolaApiKey) {
    console.error('Required WhatsApp hook or Yoola credentials are not configured.');
    return jsonResponse({ error: 'WhatsApp delivery is not configured.' }, 500);
  }

  let event: SmsHookEvent;
  try {
    const secret = hookSecret.replace(/^v1,whsec_/, '');
    event = new Webhook(secret).verify(await request.text(), Object.fromEntries(request.headers)) as SmsHookEvent;
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
    response = await fetch('https://yoolasms.com/api/v1/send-whatsapp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: yoolaApiKey,
        phone: phone.slice(1),
        template_name: 'yoola_otp_verification',
        template_params: [otp],
        consent: 'yes',
      }),
    });
  } catch {
    console.error('Could not reach the Yoola WhatsApp API.');
    return jsonResponse({ error: 'The WhatsApp provider could not be reached.' }, 502);
  }

  let providerResult: { status?: string } | null = null;
  try {
    providerResult = await response.json();
  } catch {
    console.error('Yoola returned an unreadable WhatsApp response.', { status: response.status });
    return jsonResponse({ error: 'The WhatsApp provider returned an invalid response.' }, 502);
  }

  if (!response.ok || !['queued', 'success'].includes(providerResult?.status ?? '')) {
    console.error('Yoola did not accept the WhatsApp request.', { status: response.status });
    return jsonResponse({ error: 'The WhatsApp provider rejected the message.' }, 502);
  }

  return new Response(null, { status: 200 });
});
