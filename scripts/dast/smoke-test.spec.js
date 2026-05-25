// scripts/dast/smoke-test.spec.js
// =============================================================================
// DAST smoke test — corre autenticado y verifica defensas comunes.
//
// Uso:
//   1. npm init -y && npm i -D @playwright/test && npx playwright install chromium
//   2. Define variables de entorno:
//        export DAST_URL="https://unam-fesi.github.io/arbol-unam-475/"
//        export DAST_EMAIL="admin@example.com"
//        export DAST_PASSWORD="********"
//   3. npx playwright test scripts/dast/smoke-test.spec.js
//
// Cubre:
//   - Login OK con credenciales reales
//   - Brute force: 6 intentos con password incorrecto → debe activar bloqueo
//   - XSS: payload reflejado en campo de búsqueda no debe ejecutar JS
//   - CSP headers presentes
//   - localStorage no contiene service_role keys
//   - Endpoint público no devuelve datos privados sin auth
// =============================================================================

const { test, expect } = require('@playwright/test');

const URL = process.env.DAST_URL || 'http://127.0.0.1:5500/';
const EMAIL = process.env.DAST_EMAIL;
const PASSWORD = process.env.DAST_PASSWORD;

if (!EMAIL || !PASSWORD) {
  console.warn('⚠ DAST_EMAIL y DAST_PASSWORD no configurados; algunos tests serán skip');
}

test.describe('DAST smoke tests', () => {

  test('Login exitoso con credenciales válidas', async ({ page }) => {
    test.skip(!EMAIL || !PASSWORD, 'creds requeridas');
    await page.goto(URL);
    await page.fill('#login-email', EMAIL);
    await page.fill('#login-password', PASSWORD);
    await page.click('button[type="submit"]');
    await expect(page.locator('#main-app')).toBeVisible({ timeout: 10000 });
  });

  test('Brute-force: 6 intentos fallidos disparan rate-limit', async ({ page }) => {
    await page.goto(URL);
    for (let i = 0; i < 6; i++) {
      await page.fill('#login-email', `fake${Date.now()}@test.com`);
      await page.fill('#login-password', 'wrong-' + i);
      await page.click('button[type="submit"]');
      await page.waitForTimeout(500);
    }
    // Después del 6to debe aparecer mensaje de bloqueo o "intentos fallidos"
    const errorText = await page.locator('#login-error').textContent();
    expect(errorText).toMatch(/blocked|bloqueada|intentos/i);
  });

  test('XSS reflejado: payload en URL no ejecuta script', async ({ page }) => {
    const evilUrl = URL + '?q=' + encodeURIComponent('<img src=x onerror=alert(1)>');
    let alertFired = false;
    page.on('dialog', d => { alertFired = true; d.dismiss(); });
    await page.goto(evilUrl);
    await page.waitForTimeout(2000);
    expect(alertFired).toBe(false);
  });

  test('CSP / security headers presentes', async ({ page }) => {
    const response = await page.goto(URL);
    const headers = response.headers();
    // GitHub Pages no permite CSP custom, pero validamos otros:
    const xframe = headers['x-frame-options'] || headers['content-security-policy'] || '';
    expect(xframe.length > 0 || headers['referrer-policy']).toBeTruthy();
  });

  test('localStorage no contiene service_role keys', async ({ page }) => {
    test.skip(!EMAIL || !PASSWORD, 'requiere login');
    await page.goto(URL);
    await page.fill('#login-email', EMAIL);
    await page.fill('#login-password', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3000);
    const dump = await page.evaluate(() => JSON.stringify(localStorage));
    expect(dump).not.toMatch(/service_role/i);
    // La anon key SÍ está bien que esté (es pública)
  });

  test('Endpoints REST de Supabase requieren auth para tablas privadas', async ({ request }) => {
    // Sin Authorization, debe regresar [] (RLS) o 401
    const resp = await request.get('https://hambscfdiaymowskislw.supabase.co/rest/v1/user_profiles?select=email', {
      headers: {
        'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhhbWJzY2ZkaWF5bW93c2tpc2x3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1MDY1ODEsImV4cCI6MjA4OTA4MjU4MX0.5teS1HJdlZUmIJonrNXsBXKYIk3wexI9FQJ553pplTg'
      },
    });
    const body = await resp.json();
    // RLS debe devolver arr vacío o error
    if (Array.isArray(body)) {
      expect(body.length).toBe(0);
    } else {
      expect(resp.status()).toBeGreaterThanOrEqual(400);
    }
  });

  test('Auth attempts table no es leíble como anon', async ({ request }) => {
    const resp = await request.get('https://hambscfdiaymowskislw.supabase.co/rest/v1/auth_attempts?select=email,ip', {
      headers: {
        'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhhbWJzY2ZkaWF5bW93c2tpc2x3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1MDY1ODEsImV4cCI6MjA4OTA4MjU4MX0.5teS1HJdlZUmIJonrNXsBXKYIk3wexI9FQJ553pplTg'
      },
    });
    const body = await resp.json();
    if (Array.isArray(body)) {
      expect(body.length).toBe(0);
    } else {
      expect(resp.status()).toBeGreaterThanOrEqual(400);
    }
  });
});
