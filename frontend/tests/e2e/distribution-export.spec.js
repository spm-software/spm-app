import { expect, test } from "@playwright/test";
import { authenticate, mockCoreApi } from "./api-mocks";

test.beforeEach(async ({ page }) => {
  await authenticate(page);
  await mockCoreApi(page);
});

test("shows distribution summary and program cards", async ({ page }) => {
  await page.goto("/distribuir");

  await expect(page.getByTestId("distribute-summary")).toContainText("1");
  await expect(page.getByTestId("program-card-1")).toContainText("Programa 1");
  await expect(page.getByTestId("program-card-99")).toContainText("Reserva");
});

test("exports a program", async ({ page }) => {
  await page.goto("/exportar");

  await page.getByTestId("export-program-1").click();

  await expect(page.getByText(/Ana Ruiz: Como se configura/)).toBeVisible();
});
