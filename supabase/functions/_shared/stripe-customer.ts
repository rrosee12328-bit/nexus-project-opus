interface StripeCustomerClient {
  customers: {
    retrieve: (id: string) => Promise<{ deleted?: boolean }>;
    list: (params: { email: string; limit: number }) => Promise<{ data: Array<{ id: string }> }>;
    create: (params: {
      email: string;
      name: string;
      metadata: { client_id: string };
    }) => Promise<{ id: string }>;
  };
}

interface SupabaseAdminClient {
  from: (table: string) => {
    update: (values: Record<string, unknown>) => {
      eq: (column: string, value: string) => Promise<{ error: { message: string } | null }>;
    };
  };
}

interface BillingClient {
  id: string;
  name: string;
  email: string;
  stripe_customer_id: string | null;
}

const isMissingStripeResource = (error: unknown) =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  error.code === "resource_missing";

export async function ensureStripeCustomer(
  stripe: StripeCustomerClient,
  admin: SupabaseAdminClient,
  client: BillingClient,
): Promise<string> {
  let customerId = client.stripe_customer_id;

  if (customerId) {
    try {
      const savedCustomer = await stripe.customers.retrieve(customerId);
      if (!savedCustomer.deleted) return customerId;
    } catch (error) {
      if (!isMissingStripeResource(error)) throw error;
    }
  }

  const existing = await stripe.customers.list({ email: client.email, limit: 1 });
  customerId = existing.data[0]?.id ?? (await stripe.customers.create({
    email: client.email,
    name: client.name,
    metadata: { client_id: client.id },
  })).id;

  const { error: updateError } = await admin
    .from("clients")
    .update({ stripe_customer_id: customerId })
    .eq("id", client.id);
  if (updateError) {
    throw new Error(`Failed to save Stripe customer: ${updateError.message}`);
  }

  return customerId;
}
