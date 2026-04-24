import { readAdapterConfig } from "../env";

export type PaymentAdapterDescriptor = {
  id: string;
  requiredEnv: string[];
  enabled: boolean;
};

export function describePaymentAdapter(): PaymentAdapterDescriptor {
  const { paymentAdapter } = readAdapterConfig();
  if (paymentAdapter === "none") return { id: "none", requiredEnv: [], enabled: false };
  return {
    id: paymentAdapter,
    requiredEnv: ["PAYMENT_SECRET_KEY", "PAYMENT_WEBHOOK_SECRET"],
    enabled: true,
  };
}
