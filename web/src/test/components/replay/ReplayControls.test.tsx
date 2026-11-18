// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { ReplayControls } from "../../../components/replay/ReplayControls";
import { makePlayback } from "../../../lib/playback";

const setup = (gaps = [{ from: 20_000, to: 40_000 }]) => {
  const playback = makePlayback({
    now: () => 0,
    requestFrame: () => 1,
    cancelFrame: () => {},
  });
  playback.reset(100_000);
  render(<ReplayControls playback={playback} gaps={gaps} />);
  return {
    playback,
    slider: screen.getByRole("slider", { name: "Trip time" }),
  };
};

describe("ReplayControls", () => {
  it("plays and pauses from the button", async () => {
    const { playback } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(playback.get().isPlaying).toBe(true);
    await userEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(playback.get().isPlaying).toBe(false);
  });

  it("says where the slider is in words", () => {
    const { playback, slider } = setup();
    expect(slider).toHaveAttribute("aria-valuetext", "0 s of 1 min 40 s");
    expect(screen.getByText("0:00")).toBeInTheDocument();
    act(() => playback.seek(72_400));
    expect(slider).toHaveAttribute(
      "aria-valuetext",
      "1 min 12 s of 1 min 40 s",
    );
    expect(slider).toHaveValue("72.4");
  });

  it("says when there is no data at the cursor", () => {
    const { playback, slider } = setup();
    act(() => playback.seek(30_000));
    expect(slider).toHaveAttribute(
      "aria-valuetext",
      "30 s of 1 min 40 s, no data",
    );
    expect(screen.getByText("No data from 0:20 to 0:40")).toBeInTheDocument();
    act(() => playback.seek(50_000));
    expect(screen.queryByText(/No data from/)).not.toBeInTheDocument();
  });

  it("picks one speed at a time", async () => {
    const { playback } = setup();
    const group = screen.getByRole("group", { name: "Playback speed" });
    expect(group.querySelector("[aria-pressed=true]")).toHaveTextContent("4×");
    await userEvent.click(screen.getByRole("button", { name: "16×" }));
    expect(playback.get().speed).toBe(16);
    expect(screen.getByRole("button", { name: "16×" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "4×" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("works from the keyboard on the slider", async () => {
    const { playback, slider } = setup();
    slider.focus();
    await userEvent.keyboard(" ");
    expect(playback.get().isPlaying).toBe(true);
    await userEvent.keyboard(" ");
    await userEvent.keyboard("{ArrowRight}{ArrowRight}");
    expect(playback.get().elapsed).toBe(10_000);
    await userEvent.keyboard("{PageUp}");
    expect(playback.get().elapsed).toBe(20_000);
    await userEvent.keyboard("{ArrowLeft}");
    expect(playback.get().elapsed).toBe(15_000);
    await userEvent.keyboard("{End}");
    expect(playback.get().elapsed).toBe(100_000);
    await userEvent.keyboard("{Home}");
    expect(playback.get().elapsed).toBe(0);
  });
});
