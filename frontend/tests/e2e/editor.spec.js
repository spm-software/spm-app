import { expect, test } from "@playwright/test";
import { authenticate, mockCoreApi } from "./api-mocks";

test.beforeEach(async ({ page }) => {
  await authenticate(page);
  await mockCoreApi(page);
});

test("loads questions and classification controls", async ({ page }) => {
  await page.goto("/editor");

  await expect(page.getByTestId("question-card-q2")).toContainText("@pedro");
  await expect(page.getByTestId("ready-counter")).toContainText("1");
  await expect(page.getByTestId("filter-pill-pregunta")).toBeVisible();

  await page.getByTestId("filter-pill-all").click();
  await expect(page.getByTestId("question-card-q1")).toContainText("Ana Ruiz");
});

test("filters by confirmed questions", async ({ page }) => {
  await page.goto("/editor");

  await page.getByTestId("filter-pill-pregunta").click();

  await expect(page.getByTestId("question-card-q1")).toBeVisible();
  await expect(page.getByTestId("question-card-q2")).toHaveCount(0);
});

test("edits a display name inline", async ({ page }) => {
  await page.goto("/editor");

  await page.getByTestId("filter-pill-all").click();
  await page.getByTestId("name-edit-button-q1").click();
  await page.getByTestId("name-input-q1").fill("Ana Confirmada");
  await page.getByTestId("name-input-q1").press("Enter");

  await expect(page.getByTestId("question-card-q1")).toContainText("Ana Confirmada");
});
