import { describe, expect, it } from "vitest";

import HomePage from "@/app/page";
import { ReportEditor } from "@/features/report/report-editor";

describe("Next app entry", () => {
  it("renders the report editor at /", () => {
    const page = HomePage();
    expect(page.type).toBe(ReportEditor);
  });
});
