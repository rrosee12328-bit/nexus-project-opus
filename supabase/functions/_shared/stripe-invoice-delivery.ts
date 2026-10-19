interface InvoiceDeliveryOptions {
  collection_method: "send_invoice" | "charge_automatically";
  days_until_due?: number;
}

export function getInvoiceDeliveryOptions(
  email: string | null,
  daysUntilDue = 14,
): InvoiceDeliveryOptions {
  if (!email) {
    return { collection_method: "charge_automatically" };
  }

  return {
    collection_method: "send_invoice",
    days_until_due: daysUntilDue,
  };
}
