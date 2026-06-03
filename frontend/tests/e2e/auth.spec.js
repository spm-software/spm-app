import { expect, test } from "@playwright/test";
import { authenticate, mockCoreApi } from "./api-mocks";

test("redirects anonymous users to login", async ({ page }) => {
  await mockCoreApi(page, { authenticated: false });

  await page.goto("/");

  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByText("Gestor de Preguntas")).toBeVisible();
  await expect(page.getByTestId("google-login-button")).toBeVisible();
});

test("exchanges a Google callback code and opens the dashboard", async ({ page }) => {
  await mockCoreApi(page, { authenticated: false });

  await page.goto("/login?code=test-code");

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId("current-user")).toContainText("Usuario Test");
  await expect(page.getByRole("heading", { name: "DASHBOARD" })).toBeVisible();
  await expect(page.evaluate(() => window.localStorage.getItem("spm_jwt"))).resolves.toBe(
    "jwt-from-google",
  );
});

test("keeps authenticated users inside protected routes", async ({ page }) => {
  await authenticate(page);
  await mockCoreApi(page);

  await page.goto("/");

  await expect(page.getByRole("heading", { name: "DASHBOARD" })).toBeVisible();
  await expect(page.getByTestId("current-user")).toContainText("Usuario Test");
});
