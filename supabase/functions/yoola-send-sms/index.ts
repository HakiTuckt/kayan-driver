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
  const sender = Deno.env.get('YOOLA_SENDER_ID');
  if (!hookSecret || !yoolaApiKey) {
    console.error('Required SMS hook or Yoola credentials are not configured.');
    return jsonResponse({ error: 'SMS delivery is not configured.' }, 500);
  }

  let event: SmsHookEvent;
  try {
    const secret = hookSecret.replace(/^v1,whsec_/, '');
    event = new Webhook(secret).verify(await request.text(), Object.fromEntries(request.headers)) as SmsHookEvent;
  } catch {
    return jsonResponse({ error: 'Invalid SMS hook signature.' }, 401);
  }

  const phone = event.user?.phone;
  const otp = event.sms?.otp;
  if (!phone || !/^\+[1-9]\d{7,14}$/.test(phone) || !otp || !/^\d{6}$/.test(otp)) {
    return jsonResponse({ error: 'The SMS hook payload is incomplete or invalid.' }, 400);
  }

  const message = `KAYAN verification code: ${otp}. Do not share this code.`;
  let response: Response;
  try {
    response = await fetch('https://yoolasms.com/api/v1/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: yoolaApiKey,
        phone: phone.slice(1),
        message,
        ...(sender ? { sender } : {}),
      }),
    });
  } catch {
    console.error('Could not reach the Yoola SMS API.');
    return jsonResponse({ error: 'The SMS provider could not be reached.' }, 502);
  }

  let providerResult: { status?: string } | null = null;
  try {
    providerResult = await response.json();
  } catch {
    console.error('Yoola returned an unreadable SMS response.', { status: response.status });
    return jsonResponse({ error: 'The SMS provider returned an invalid response.' }, 502);
  }

  if (!response.ok || providerResult?.status !== 'success') {
    console.error('Yoola did not accept the SMS request.', { status: response.status });
    return jsonResponse({ error: 'The SMS provider rejected the message.' }, 502);
  }

  return new Response(null, { status: 200 });
});
