import { expect, test } from "@playwright/test";
import { authenticate, mockCoreApi } from "./api-mocks";

test.beforeEach(async ({ page }) => {
  await authenticate(page);
  await mockCoreApi(page);
});

test("shows dashboard stats and batch actions", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByTestId("stat-card-0")).toContainText("12");
  await expect(page.getByTestId("stat-card-1")).toContainText("4");
  await expect(page.getByTestId("batch-card-batch-1")).toContainText("Importacion junio");
  await expect(page.getByTestId("batch-preguntas-batch-1")).toContainText("1 preguntas confirmadas");
});

test("navigates through the core sections", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("link", { name: /Importar/i }).click();
  await expect(page).toHaveURL(/\/importar$/);
  await expect(page.getByRole("heading", { name: "IMPORTAR" })).toBeVisible();

  await page.getByRole("link", { name: /Editor/i }).click();
  await expect(page).toHaveURL(/\/editor$/);
  await expect(page.getByRole("heading", { name: "EDITOR" })).toBeVisible();

  await page.getByRole("link", { name: /Distribuir/i }).click();
  await expect(page).toHaveURL(/\/distribuir$/);
  await expect(page.getByRole("heading", { name: "DISTRIBUIR" })).toBeVisible();

  await page.getByRole("link", { name: /Exportar/i }).click();
  await expect(page).toHaveURL(/\/exportar$/);
  await expect(page.getByRole("heading", { name: "EXPORTAR" })).toBeVisible();
});

test("opens editor from a dashboard batch and preserves selected batch", async ({ page }) => {
  await page.goto("/");

  await page
    .getByTestId("batch-card-batch-1")
    .getByRole("button", { name: /Editar/i })
    .click();

  await expect(page).toHaveURL(/\/editor$/);
  await expect(page.getByTestId("question-card-q2")).toBeVisible();
});
