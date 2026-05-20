import braintree from "npm:braintree@3.29.0";

const merchantId = Deno.env.get("BRAINTREE_MERCHANT_ID");
const publicKey = Deno.env.get("BRAINTREE_PUBLIC_KEY");
const privateKey = Deno.env.get("BRAINTREE_PRIVATE_KEY");
const environmentRaw = (Deno.env.get("BRAINTREE_ENVIRONMENT") ?? "sandbox").toLowerCase();
const defaultMerchantAccountId = Deno.env.get("BRAINTREE_MERCHANT_ACCOUNT_ID");

function resolveEnvironment(): braintree.Environment {
  if (environmentRaw === "production") return braintree.Environment.Production;
  return braintree.Environment.Sandbox;
}

export function isBraintreeConfigured(): boolean {
  return !!(merchantId && publicKey && privateKey);
}

export function getBraintreeGateway(): braintree.BraintreeGateway {
  if (!isBraintreeConfigured()) {
    throw new Error("Braintree is not configured");
  }
  return new braintree.BraintreeGateway({
    environment: resolveEnvironment(),
    merchantId: merchantId!,
    publicKey: publicKey!,
    privateKey: privateKey!,
  });
}

export function getBraintreeDebugContext(currencyIso?: string) {
  const currency = String(currencyIso ?? "").trim().toUpperCase();
  const env = environmentRaw === "production" ? "production" : "sandbox";
  const resolvedMerchantAccountId =
    (currency ? Deno.env.get(`BRAINTREE_MERCHANT_ACCOUNT_${currency}`) : null) ?? defaultMerchantAccountId ?? null;
  return {
    environment: env,
    currency: currency || null,
    merchantAccountId: resolvedMerchantAccountId,
    hasDefaultMerchantAccountId: Boolean(defaultMerchantAccountId),
  };
}

export async function generateClientToken(customerId?: string): Promise<string> {
  const gateway = getBraintreeGateway();
  const response = await gateway.clientToken.generate(customerId ? { customerId } : {});
  return response.clientToken;
}

/** Ensures a vaulted token belongs to the app user (Braintree customer id = Supabase user id). */
export async function assertPaymentMethodBelongsToUser(
  paymentMethodToken: string,
  appUserId: string,
): Promise<void> {
  const gateway = getBraintreeGateway();
  const paymentMethod = await gateway.paymentMethod.find(paymentMethodToken);
  const customerId = (paymentMethod as { customerId?: string }).customerId;
  if (!customerId || customerId !== appUserId) {
    throw new Error("Payment method does not belong to this account");
  }
}

export async function upsertVaultedPaymentMethod(args: {
  appUserId: string;
  paymentMethodNonce: string;
  email?: string | null;
}): Promise<{ customerId: string; paymentMethodToken: string }> {
  const gateway = getBraintreeGateway();
  const customerId = args.appUserId;

  const existingCustomer = await gateway.customer.find(customerId).catch(() => null);
  if (!existingCustomer) {
    const createCustomerResult = await gateway.customer.create({
      id: customerId,
      email: args.email ?? undefined,
    });
    if (!createCustomerResult.success) {
      const message =
        createCustomerResult.message ||
        createCustomerResult.errors.deepErrors()[0]?.message ||
        "Could not create Braintree customer";
      throw new Error(message);
    }
  } else if (args.email && existingCustomer.email !== args.email) {
    await gateway.customer.update(customerId, { email: args.email });
  }

  const paymentMethodResult = await gateway.paymentMethod.create({
    customerId,
    paymentMethodNonce: args.paymentMethodNonce,
    options: {
      makeDefault: true,
      // Avoid pre-verification declines in retry flow; we rely on the real charge attempt.
      verifyCard: false,
    },
  });

  if (!paymentMethodResult.success || !paymentMethodResult.paymentMethod?.token) {
    const message =
      paymentMethodResult.message ||
      paymentMethodResult.errors.deepErrors()[0]?.message ||
      "Could not vault payment method";
    throw new Error(message);
  }

  return {
    customerId,
    paymentMethodToken: paymentMethodResult.paymentMethod.token,
  };
}

export async function chargeFailedGoalWithVaultToken(args: {
  goalId: string;
  amountMajor: number;
  currencyIso: string;
  paymentMethodToken: string;
}): Promise<{ transactionId: string; status: string }> {
  const gateway = getBraintreeGateway();
  const amount = Number(args.amountMajor);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Invalid amount for Braintree sale");
  }

  const currency = String(args.currencyIso ?? "").trim().toUpperCase();
  const merchantAccountId =
    Deno.env.get(`BRAINTREE_MERCHANT_ACCOUNT_${currency}`) ?? defaultMerchantAccountId;
  const debugContext = getBraintreeDebugContext(currency);

  if (!merchantAccountId) {
    console.error("braintree.charge_failed_goal.missing_merchant_account", {
      goalId: args.goalId,
      ...debugContext,
    });
    throw new Error(
      `Currency ${currency} is selected, but no Braintree merchant account is configured for it. ` +
      `Set BRAINTREE_MERCHANT_ACCOUNT_${currency} (or BRAINTREE_MERCHANT_ACCOUNT_ID).`,
    );
  }

  const result = await gateway.transaction.sale({
    amount: amount.toFixed(2),
    merchantAccountId,
    paymentMethodToken: args.paymentMethodToken,
    options: {
      submitForSettlement: true,
    },
    // Keep transaction metadata in our database.
    // Braintree custom fields must be pre-defined in the merchant dashboard;
    // sending undefined field names causes a hard API error.
  });

  if (!result.success || !result.transaction?.id) {
    console.error("braintree.charge_failed_goal.declined", {
      goalId: args.goalId,
      ...debugContext,
      message: result.message ?? null,
      processorResponseCode: result.transaction?.processorResponseCode ?? null,
      processorResponseText: result.transaction?.processorResponseText ?? null,
      gatewayRejectionReason: result.transaction?.gatewayRejectionReason ?? null,
      transactionStatus: result.transaction?.status ?? null,
    });
    const errorMessage =
      result.message ??
      result.transaction?.processorResponseText ??
      "Braintree transaction failed";
    throw new Error(errorMessage);
  }

  return {
    transactionId: result.transaction.id,
    status: result.transaction.status,
  };
}
