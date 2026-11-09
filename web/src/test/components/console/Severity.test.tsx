// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SeverityLabel } from "../../../components/console/Severity";

describe("SeverityLabel", () => {
  it("anchors the icon-only label, so it can't overflow past a scrolling list", () => {
    render(<SeverityLabel severity="warning" isText={false} />);
    const label = screen.getByText("Warning");
    expect(label).toHaveClass("sr-only");
    expect(label.parentElement).toHaveClass("relative");
  });
});
