import assert from "node:assert/strict";
import test from "node:test";
import { serviceDomain } from "./index.js";

test("service domain metadata is stable", () => {
  assert.equal(serviceDomain.service, "dualcontext");
  assert.equal(serviceDomain.packageName, "dualcontext_domain");
});
