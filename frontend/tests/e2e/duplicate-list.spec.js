import { test, expect } from "@playwright/test";
import { authenticate, mockCoreApi } from "./api-mocks";

async function prepare(page) {
  await authenticate(page);
  await mockCoreApi(page);
  let pairs = Array.from({ length: 17 }, (_, index) => ({
    original_question: { id: `old-${index}`, text: `Pregunta original ${index + 1}`, real_name: "Ana", batch_name: "Mayo" },
    new_question: { id: `new-${index}`, text: `Pregunta nueva ${index + 1}`, real_name: "Pedro", batch_name: "Agosto" },
  }));
  await page.route("**/api/questions/duplicate-pairs/*", (route) => route.fulfill({ json: { duplicates: pairs } }));
  await page.route("**/api/questions/*/clear-duplicate", async (route) => {
    const id = new URL(route.request().url()).pathname.split("/").at(-2);
    pairs = pairs.filter((pair) => pair.new_question.id !== id);
    await route.fulfill({ json: { ok: true } });
  });
  await page.route("**/api/questions/new-*", async (route) => {
    if (route.request().method() !== "DELETE") return route.fallback();
    const id = new URL(route.request().url()).pathname.split("/").at(-1);
    pairs = pairs.filter((pair) => pair.new_question.id !== id);
    await route.fulfill({ json: { ok: true } });
  });
  await page.goto("/flujo/revisar-duplicados");
  await expect(page.getByTestId("duplicate-pair-new-16")).toBeAttached();
}

test("17 pairs remain in a scroll list, with successful decisions marked green", async ({ page }) => {
  await prepare(page);
  const rows = page.locator('article[data-testid^="duplicate-pair-"]');
  await expect(rows).toHaveCount(17);
  const first = page.getByTestId("duplicate-pair-new-0");
  await first.getByRole("button", { name: "Conservar las dos", exact: true }).click();
  await expect(first.getByRole("status")).toHaveText("Procesada: ambas preguntas conservadas");
  await expect(first).toHaveClass(/bg-green-50/);
  await expect(first.getByRole("button", { name: "Conservar las dos", exact: true })).toBeDisabled();
  const last = page.getByTestId("duplicate-pair-new-16");
  await last.scrollIntoViewIfNeeded();
  const topBefore = await last.evaluate((element) => element.getBoundingClientRect().top);
  await last.getByRole("button", { name: "Eliminar duplicada", exact: true }).click();
  await expect(last.getByRole("status")).toContainText("duplicada eliminada, original conservada");
  await expect(rows).toHaveCount(17);
  expect(Math.abs(await last.evaluate((element) => element.getBoundingClientRect().top) - topBefore)).toBeLessThan(100);
  await page.getByTestId("duplicate-review").getByRole("button", { name: "Actualizar", exact: true }).click();
  await expect(first).toHaveClass(/bg-green-50/);
  await expect(page.getByTestId("duplicate-review")).toContainText("2 procesadas");
  await first.scrollIntoViewIfNeeded();
  await page.screenshot({ path: "/tmp/spm-duplicates-desktop.png" });
});

test("failed save stays pending and can be retried", async ({ page }) => {
  await prepare(page);
  await page.route("**/api/questions/new-0/clear-duplicate", (route) => route.fulfill({ status: 500, json: { detail: "Error de prueba" } }));
  const first = page.getByTestId("duplicate-pair-new-0");
  await first.getByRole("button", { name: "Conservar las dos", exact: true }).click();
  await expect(page.getByText("No se pudo guardar la decisión")).toBeVisible();
  await expect(first.getByRole("status")).toHaveCount(0);
  await expect(first.getByRole("button", { name: "Conservar las dos", exact: true })).toBeEnabled();
});

test("mobile list stacks texts and actions within the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await prepare(page);
  const first = page.getByTestId("duplicate-pair-new-0");
  await first.scrollIntoViewIfNeeded();
  const bounds = await first.boundingBox();
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
  await first.getByRole("button", { name: "Conservar las dos", exact: true }).click();
  await expect(first.getByRole("status")).toContainText("ambas preguntas conservadas");
  await page.screenshot({ path: "/tmp/spm-duplicates-mobile.png" });
});
