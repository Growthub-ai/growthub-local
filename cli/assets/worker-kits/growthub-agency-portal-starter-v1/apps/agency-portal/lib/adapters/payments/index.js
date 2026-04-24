import { readAdapterConfig } from "../env";
function describePaymentAdapter() {
  const { paymentAdapter } = readAdapterConfig();
  if (paymentAdapter === "none") return { id: "none", requiredEnv: [], enabled: false };
  return {
    id: paymentAdapter,
    requiredEnv: ["PAYMENT_SECRET_KEY", "PAYMENT_WEBHOOK_SECRET"],
    enabled: true
  };
}
export {
  describePaymentAdapter
};
