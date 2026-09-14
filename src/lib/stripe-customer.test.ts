import { describe, expect, it, vi } from "vitest";

import { ensureStripeCustomer } from "../../supabase/functions/_shared/stripe-customer";

const client = {
  id: "client-1",
  name: "Goodland Church",
  email: "billing@example.com",
  stripe_customer_id: "cus_stale",
};

const createAdmin = () => {
  const eq = vi.fn().mockResolvedValue({ error: null });
  const update = vi.fn(() => ({ eq }));
  return { admin: { from: vi.fn(() => ({ update })) }, update, eq };
};

describe("ensureStripeCustomer", () => {
  it("keeps a saved Stripe customer that still exists", async () => {
    const stripe = {
      customers: {
        retrieve: vi.fn().mockResolvedValue({ id: "cus_stale" }),
        list: vi.fn(),
        create: vi.fn(),
      },
    };
    const { admin, update } = createAdmin();

    await expect(ensureStripeCustomer(stripe, admin, client)).resolves.toBe("cus_stale");
    expect(stripe.customers.list).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("replaces a missing saved customer with the email match", async () => {
    const stripe = {
      customers: {
        retrieve: vi.fn().mockRejectedValue({ code: "resource_missing" }),
        list: vi.fn().mockResolvedValue({ data: [{ id: "cus_current" }] }),
        create: vi.fn(),
      },
    };
    const { admin, update, eq } = createAdmin();

    await expect(ensureStripeCustomer(stripe, admin, client)).resolves.toBe("cus_current");
    expect(update).toHaveBeenCalledWith({ stripe_customer_id: "cus_current" });
    expect(eq).toHaveBeenCalledWith("id", "client-1");
  });

  it("does not hide Stripe errors unrelated to a missing customer", async () => {
    const stripeError = { code: "api_connection_error" };
    const stripe = {
      customers: {
        retrieve: vi.fn().mockRejectedValue(stripeError),
        list: vi.fn(),
        create: vi.fn(),
      },
    };
    const { admin } = createAdmin();

    await expect(ensureStripeCustomer(stripe, admin, client)).rejects.toBe(stripeError);
  });
});
