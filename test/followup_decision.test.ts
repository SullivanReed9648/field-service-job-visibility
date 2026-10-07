import assert from "node:assert/strict";
import test from "node:test";
import { chooseFollowup } from "../src/dispatch_followup.js";

test("a dead-lettered photo asks for a technician call before a generic review", () => {
  assert.deepEqual(
    chooseFollowup({ deadLetters: 1, failedRuns: 4, errorGroups: 2 }),
    {
      dispatchStatus: "technician_call",
      reason: "A photo handoff is in the dead-letter list, so call the assigned technician.",
    },
  );
});
