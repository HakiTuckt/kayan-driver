export const GOOGLE_PLAY_PACKAGE_NAME = 'com.kayan.driver.demo';
export const GOOGLE_PLAY_BASE_PLAN_ID = 'monthly';

export const driverPlayProducts = {
  kayan_driver_plus: 'plus',
  kayan_driver_premium: 'premium',
} as const;

export type DriverSubscriptionPlan = 'plus' | 'premium';
export type DriverSubscriptionStatus = 'active' | 'cancelled' | 'grace_period' | 'on_hold' | 'paused' | 'expired' | 'revoked';

export type VerifiedPlaySubscription = {
  plan: DriverSubscriptionPlan;
  productId: keyof typeof driverPlayProducts;
  status: DriverSubscriptionStatus;
  startedAt: string;
  expiresAt: string;
  autoRenewEnabled: boolean;
  obfuscatedAccountId: string;
  acknowledgementPending: boolean;
};

type ServiceAccount = {
  client_email: string;
  private_key: string;
};

type SubscriptionPurchaseV2 = {
  startTime?: unknown;
  subscriptionState?: unknown;
  acknowledgementState?: unknown;
  externalAccountIdentifiers?: {
    obfuscatedExternalAccountId?: unknown;
  };
  lineItems?: Array<{
    productId?: unknown;
    expiryTime?: unknown;
    autoRenewingPlan?: {
      autoRenewEnabled?: unknown;
    };
    offerDetails?: {
      basePlanId?: unknown;
    };
  }>;
};

export class GooglePlayApiError extends Error {
  constructor(readonly status: number) {
    super(`Google Play Developer API returned HTTP ${status}.`);
    this.name = 'GooglePlayApiError';
  }
}

let cachedAccessToken: { token: string; expiresAt: number } | null = null;

function requiredSecret(name: string) {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

function encodeBase64Url(value: Uint8Array | string) {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function decodePrivateKey(value: string) {
  const base64 = value.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, '');
  const binary = atob(base64);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

function loadServiceAccount(): ServiceAccount {
  let parsed: unknown;
  try {
    parsed = JSON.parse(requiredSecret('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON'));
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON is not valid JSON.');
    throw error;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON must contain a service-account object.');
  }
  const account = parsed as Record<string, unknown>;
  if (typeof account.client_email !== 'string' || !account.client_email.endsWith('.iam.gserviceaccount.com')
    || typeof account.private_key !== 'string' || !account.private_key.includes('PRIVATE KEY')) {
    throw new Error('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON is missing its client email or private key.');
  }
  return { client_email: account.client_email, private_key: account.private_key };
}

async function getPublisherAccessToken() {
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 60_000) {
    return cachedAccessToken.token;
  }
  const serviceAccount = loadServiceAccount();
  const now = Math.floor(Date.now() / 1000);
  const unsignedAssertion = [
    encodeBase64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' })),
    encodeBase64Url(JSON.stringify({
      iss: serviceAccount.client_email,
      scope: 'https://www.googleapis.com/auth/androidpublisher',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    })),
  ].join('.');
  const privateKey = await crypto.subtle.importKey(
    'pkcs8',
    decodePrivateKey(serviceAccount.private_key.replace(/\\n/g, '\n')),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    privateKey,
    new TextEncoder().encode(unsignedAssertion),
  );
  const assertion = `${unsignedAssertion}.${encodeBase64Url(new Uint8Array(signature))}`;
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  const result: unknown = await response.json();
  if (!response.ok || !result || typeof result !== 'object' || !('access_token' in result)
    || typeof result.access_token !== 'string' || !('expires_in' in result) || typeof result.expires_in !== 'number') {
    throw new Error(`Google Play service-account authentication failed (HTTP ${response.status}).`);
  }
  cachedAccessToken = {
    token: result.access_token,
    expiresAt: Date.now() + result.expires_in * 1000,
  };
  return cachedAccessToken.token;
}

function mapSubscriptionStatus(value: unknown): DriverSubscriptionStatus {
  switch (value) {
    case 'SUBSCRIPTION_STATE_PENDING':
      throw new Error('Google Play payment is pending. The driver plan remains free until payment completes.');
    case 'SUBSCRIPTION_STATE_ACTIVE': return 'active';
    case 'SUBSCRIPTION_STATE_CANCELED': return 'cancelled';
    case 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD': return 'grace_period';
    case 'SUBSCRIPTION_STATE_ON_HOLD': return 'on_hold';
    case 'SUBSCRIPTION_STATE_PAUSED': return 'paused';
    case 'SUBSCRIPTION_STATE_EXPIRED': return 'expired';
    case 'SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED': return 'revoked';
    default: throw new Error('Google Play returned an unsupported subscription state.');
  }
}

export async function hashText(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function getVerifiedPlaySubscription(purchaseToken: string, expectedProductId?: string) {
  const accessToken = await getPublisherAccessToken();
  const response = await fetch(
    `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${GOOGLE_PLAY_PACKAGE_NAME}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!response.ok) throw new GooglePlayApiError(response.status);
  const purchase: unknown = await response.json();
  if (!purchase || typeof purchase !== 'object' || Array.isArray(purchase)) {
    throw new Error('Google Play returned an invalid subscription record.');
  }
  const record = purchase as SubscriptionPurchaseV2;
  if (typeof record.startTime !== 'string' || !Number.isFinite(Date.parse(record.startTime))
    || !Array.isArray(record.lineItems)) {
    throw new Error('Google Play returned incomplete subscription dates or line items.');
  }
  const lineItem = record.lineItems.find(item =>
    typeof item.productId === 'string'
    && Object.hasOwn(driverPlayProducts, item.productId)
    && (!expectedProductId || item.productId === expectedProductId)
    && item.offerDetails?.basePlanId === GOOGLE_PLAY_BASE_PLAN_ID,
  );
  if (!lineItem || typeof lineItem.productId !== 'string' || typeof lineItem.expiryTime !== 'string'
    || !Number.isFinite(Date.parse(lineItem.expiryTime))) {
    throw new Error('This purchase does not match a configured KAYAN monthly driver plan.');
  }
  const obfuscatedAccountId = record.externalAccountIdentifiers?.obfuscatedExternalAccountId;
  if (typeof obfuscatedAccountId !== 'string' || !/^[a-f0-9]{64}$/.test(obfuscatedAccountId)) {
    throw new Error('The Google Play purchase is not linked to a verified KAYAN driver account.');
  }
  return {
    plan: driverPlayProducts[lineItem.productId as keyof typeof driverPlayProducts],
    productId: lineItem.productId as keyof typeof driverPlayProducts,
    status: mapSubscriptionStatus(record.subscriptionState),
    startedAt: record.startTime,
    expiresAt: lineItem.expiryTime,
    autoRenewEnabled: lineItem.autoRenewingPlan?.autoRenewEnabled === true,
    obfuscatedAccountId,
    acknowledgementPending: record.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_PENDING',
  } satisfies VerifiedPlaySubscription;
}

export async function acknowledgePlaySubscription(purchaseToken: string, productId: string) {
  const accessToken = await getPublisherAccessToken();
  const response = await fetch(
    `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${GOOGLE_PLAY_PACKAGE_NAME}/purchases/subscriptions/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}:acknowledge`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    },
  );
  if (!response.ok) throw new GooglePlayApiError(response.status);
}
