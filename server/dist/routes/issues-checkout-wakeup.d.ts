type CheckoutWakeInput = {
    actorType: "board" | "agent" | "none";
    actorAgentId: string | null;
    checkoutAgentId: string;
    checkoutRunId: string | null;
};
export declare function shouldWakeAssigneeOnCheckout(input: CheckoutWakeInput): boolean;
export {};
//# sourceMappingURL=issues-checkout-wakeup.d.ts.map