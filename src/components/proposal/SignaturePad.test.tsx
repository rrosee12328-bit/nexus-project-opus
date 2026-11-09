import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import SignaturePad from "./SignaturePad";

afterEach(cleanup);

describe("representative signatures", () => {
  it("requires a person to type their name rather than signing the company automatically", () => {
    const changed = vi.fn();
    render(<SignaturePad companyName="Example Company" onSignatureChange={changed} />);
    expect(screen.getByRole("textbox")).toHaveValue("");
    expect(screen.getByRole("checkbox")).toBeDisabled();
    expect(changed).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "  Alex Rose  " } });
    fireEvent.click(screen.getByRole("checkbox"));
    expect(changed).toHaveBeenLastCalledWith({ type: "typed", value: "Alex Rose" });
  });

  it("requires fresh consent after editing the representative name", () => {
    const changed = vi.fn();
    render(<SignaturePad companyName="Example Company" onSignatureChange={changed} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Alex Rose" } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Sam Rose" } });
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    expect(changed).toHaveBeenLastCalledWith(null);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "   " } });
    expect(screen.getByRole("checkbox")).toBeDisabled();
  });
});
