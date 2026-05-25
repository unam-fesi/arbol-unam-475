# DAST — Dynamic Application Security Testing

Smoke test autenticado que valida defensas comunes contra OWASP Top 10.

## Setup

```bash
# Desde la raíz del repo
npm init -y
npm i -D @playwright/test
npx playwright install chromium
```

## Correr

```bash
export DAST_URL="https://unam-fesi.github.io/arbol-unam-475/"
export DAST_EMAIL="admin@ejemplo.com"
export DAST_PASSWORD="********"
npx playwright test scripts/dast/smoke-test.spec.js
```

Para correr contra una instancia local:
```bash
export DAST_URL="http://127.0.0.1:5500/"
npx playwright test scripts/dast/smoke-test.spec.js --headed
```

## Qué cubre

- ✅ Login OK con credenciales reales
- ✅ Brute force: 6 intentos fallidos disparan rate-limit
- ✅ XSS reflejado en URL no ejecuta JS
- ✅ Headers de seguridad básicos
- ✅ localStorage no contiene service_role
- ✅ RLS bloquea lectura anónima de tablas privadas
- ✅ Tabla `auth_attempts` no es leíble sin admin

## Recomendaciones adicionales

Para auditoría más completa, usa **OWASP ZAP**:

```bash
docker run -t owasp/zap2docker-stable zap-baseline.py \
  -t https://unam-fesi.github.io/arbol-unam-475/
```

O **Nikto** para vulnerabilidades del servidor (GitHub Pages tiene poco que escanear pero útil para benchmarks):

```bash
nikto -h https://unam-fesi.github.io
```
