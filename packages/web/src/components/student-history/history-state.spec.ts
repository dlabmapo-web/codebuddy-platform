import { describe, it, expect } from "vitest";
import { readHistoryState, writeHistoryState } from "./history-state";
describe("saved work navigation", () => {
  it("round trips roster and material pagination independently without private data", () => {
    const state = {
      ...readHistoryState(""),
      student: "40000000-0000-4000-8000-000000000005",
      rosterPage: 3,
      page: 2,
      rosterQ: "Alice",
      q: "Loops",
    };
    const query = writeHistoryState("?unrelated=kept", state);
    expect(readHistoryState(query)).toEqual(state);
    expect(query).toContain("unrelated=kept");
    expect(query).not.toContain("files");
  });
  it("drops malformed object IDs and bounds pagination", () => {
    const state = readHistoryState(
      "?student=foreign&attempt=<script>&rosterPage=-5&historyPage=999999999",
    );
    expect(state.student).toBe("");
    expect(state.attempt).toBe("");
    expect(state.rosterPage).toBe(1);
    expect(state.page).toBe(100000);
  });
});
