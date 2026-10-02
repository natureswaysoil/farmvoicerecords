import test from "node:test";
import assert from "node:assert/strict";
import {
  completedHours,
  crewEntryHours,
  normalizedField,
  scheduledHours,
} from "../src/lib/ask-farmvoice-math.ts";

test("Ask FarmVoice calculates individual and one-phone crew hours", () => {
  assert.equal(
    completedHours([
      { clock_in: "2026-10-01T08:00:00Z", clock_out: "2026-10-01T16:00:00Z" },
      { clock_in: "2026-10-01T08:00:00Z", clock_out: null },
    ]),
    8,
  );
  assert.equal(
    crewEntryHours([
      {
        clock_in: "2026-10-01T08:00:00Z",
        clock_out: "2026-10-01T16:00:00Z",
        break_minutes: 30,
      },
    ]),
    7.5,
  );
  assert.equal(
    scheduledHours([
      { starts_at: "2026-10-01T08:00:00Z", ends_at: "2026-10-01T17:00:00Z" },
    ]),
    9,
  );
});

test("Ask FarmVoice field matching ignores case and repeated whitespace", () => {
  assert.equal(normalizedField("  North   Field "), "north field");
});
