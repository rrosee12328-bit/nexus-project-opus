import { expect, it } from "vitest";
import { formatIntakeExport } from "./intakeExport";
it("exports questions, unanswered prompts and attachment purpose without record IDs",()=>{
  const text=formatIntakeExport("Example",{id:"private-id",response_payload:{sections:[{title:"Branding",questions:[{label:"Brand colors?",answer:"Blue"},{label:"Tagline?",answer:null}]}]}},[{file_name:"logo.png",category:"logo"}]);
  expect(text).toContain("Question: Brand colors?\nAnswer: Blue");
  expect(text).toContain("Question: Tagline?\nAnswer: No written answer provided.");
  expect(text).toContain("Purpose / question: Company logo");
  expect(text).not.toContain("private-id");
});
