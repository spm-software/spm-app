import { expect, test } from "@playwright/test";
import { authenticate, mockCoreApi } from "./api-mocks";

test.beforeEach(async ({ page }) => {
  await authenticate(page);
  await mockCoreApi(page);
});

test("shows the connected YouTube account", async ({ page }) => {
  await page.goto("/importar");

  await expect(page.getByTestId("importer-youtube-email")).toContainText("youtube@example.com");
  await expect(page.getByTestId("last-import-info")).toContainText("Ultimo comentario importado");
});

test("imports pasted comments manually", async ({ page }) => {
  await page.goto("/importar");

  await page.getByRole("tab", { name: /Manual/i }).click();
  await page.getByTestId("use-example-button").click();
  await expect(page.getByTestId("import-textarea")).toContainText("@usuario123");

  await page.getByTestId("import-button").click();

  await expect(page.getByText("IMPORTADO")).toBeVisible();
  await expect(page.getByText("4", { exact: true })).toBeVisible();
});
