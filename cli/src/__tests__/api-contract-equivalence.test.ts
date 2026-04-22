/**
 * Compile-time equivalence tests for the CMS SDK v1 contract adoption.
 *
 * These exist to prove that the CLI's `Cms*` / `Hosted*` type aliases are
 * byte-identical to their `@growthub/api-contract` counterparts. They run
 * as normal vitest cases but do all their work at the type level — the
 * runtime body is a trivial assertion just to keep the suite green.
 *
 * If any of these fail to compile, the CLI has drifted from the public
 * contract and Phase 2 adoption has regressed.
 */
import { describe, it, expect } from "vitest";
import type {
  CapabilityNode,
  CapabilityRecord,
  ExecuteWorkflowInput,
  ExecuteWorkflowResult,
  ProviderAssemblyResult,
  Profile,
} from "@growthub/api-contract";
import type {
  CmsCapabilityNode,
} from "../runtime/cms-capability-registry/index.js";
import type {
  HostedExecuteWorkflowInput,
  HostedExecuteWorkflowResult,
  HostedProviderAssemblyResult,
  HostedProfile,
  HostedCapabilityRecord,
} from "../runtime/hosted-execution-client/index.js";

type Extends<A, B> = A extends B ? (B extends A ? true : false) : false;
type AssertTrue<T extends true> = T;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _ContractEquivalence = [
  AssertTrue<Extends<CmsCapabilityNode, CapabilityNode>>,
  AssertTrue<Extends<HostedExecuteWorkflowInput, ExecuteWorkflowInput>>,
  AssertTrue<Extends<HostedExecuteWorkflowResult, ExecuteWorkflowResult>>,
  AssertTrue<Extends<HostedProviderAssemblyResult, ProviderAssemblyResult>>,
  AssertTrue<Extends<HostedProfile, Profile>>,
  AssertTrue<Extends<HostedCapabilityRecord, CapabilityRecord>>,
];

describe("CMS SDK v1 contract equivalence", () => {
  it("CLI Cms*/Hosted* aliases are structurally equal to @growthub/api-contract types", () => {
    // Compilation is the test. If the type-level assertions above fail,
    // tsc will error before vitest ever runs this block.
    expect(true).toBe(true);
  });
});
