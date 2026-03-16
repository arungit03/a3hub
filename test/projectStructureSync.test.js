import assert from "node:assert/strict";
import test from "node:test";
import { checkProjectStructureText } from "../scripts/project-structure.mjs";

test("project_structure.txt stays in sync with repository files", () => {
  const result = checkProjectStructureText();
  assert.equal(
    result.inSync,
    true,
    "project_structure.txt is out of sync. Run `npm run docs:structure`."
  );
});
