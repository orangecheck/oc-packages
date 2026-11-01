// @vitest-environment jsdom
// OcPoll after a failed refresh: the question stays as the heading, and the
// error sits in the status pill and the body, never in the heading.

import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { OcPoll } from "./poll.js";
import type { TallyResponse } from "./types.js";

const PID = "cd".repeat(32);
const good: TallyResponse = {
  poll_id: PID,
  state: "tallied",
  question: "Ship the relay swap?",
  tallies: { yes: 3, no: 1 },
  turnout: { voters: 4, weight: 4 },
};
const answer = (status: number, body: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

afterEach(() => vi.unstubAllGlobals());

describe("OcPoll", () => {
  it("keeps the question as the heading when a refresh fails, and puts the error in the pill", async () => {
    const reason =
      "not counted: the ballot lookup was cut short on relay.ochk.io";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(answer(503, { poll_id: PID, error: reason })),
    );
    render(<OcPoll pollId={PID} initialData={good} refreshMs={0} hideCta />);
    await waitFor(() => expect(screen.getByText("error")).toBeTruthy());
    expect(screen.getByText("Ship the relay swap?")).toBeTruthy();
    const pill = screen.getByText("error");
    expect(pill.getAttribute("title")).toBe(reason);
    expect(pill.getAttribute("aria-label")).toBe(`error: ${reason}`);
    // The reason is never the heading.
    const heading = screen.getByText("Ship the relay swap?");
    expect(heading.textContent).not.toContain(reason);
  });
});
