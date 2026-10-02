import { describe, expect, it } from "vitest";
import { NEXT_STATUSES, STATUSES } from "./api";

/**
 * Contract test. This literal is a copy of backend `VALID_TRANSITIONS`
 * (app/services/incident_service.py). If the backend workflow changes, this
 * test fails and reminds you to update the buttons the UI offers.
 */
const BACKEND_TRANSITIONS = {
  OPEN: ["INVESTIGATING"],
  INVESTIGATING: ["IDENTIFIED"],
  IDENTIFIED: ["MITIGATING"],
  MITIGATING: ["RESOLVED"],
  RESOLVED: ["CLOSED", "INVESTIGATING"],
  CLOSED: [],
};

describe("status workflow mirror", () => {
  it("matches the backend transition table exactly", () => {
    expect(NEXT_STATUSES).toEqual(BACKEND_TRANSITIONS);
  });
  it("covers every status", () => {
    expect(Object.keys(NEXT_STATUSES).sort()).toEqual([...STATUSES].sort());
  });
  it("CLOSED is terminal", () => {
    expect(NEXT_STATUSES.CLOSED).toHaveLength(0);
  });
});
