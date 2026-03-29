export function shouldWakeAssigneeOnCheckout(input) {
    if (input.actorType !== "agent")
        return true;
    if (!input.actorAgentId)
        return true;
    if (input.actorAgentId !== input.checkoutAgentId)
        return true;
    if (!input.checkoutRunId)
        return true;
    return false;
}
//# sourceMappingURL=issues-checkout-wakeup.js.map