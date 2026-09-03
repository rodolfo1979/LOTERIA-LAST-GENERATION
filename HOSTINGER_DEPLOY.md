# Despliegue en Hostinger

## Requisitos

- PHP 8.3 o superior.
- Base de datos MySQL creada en hPanel.
- Acceso SSH o Terminal de Hostinger.
- Repositorio GitHub: `https://github.com/rodolfo1979/LOTERIA-LAST-GENERATION.git`

## Opcion recomendada: Git + SSH

1. En Hostinger, crea una base de datos MySQL y anota:
   - nombre de base de datos
   - usuario
   - password
   - host

2. En hPanel, configura PHP 8.3 para el dominio.

3. Clona el repositorio dentro del sitio:

```bash
cd ~/public_html
git clone https://github.com/rodolfo1979/LOTERIA-LAST-GENERATION.git .
```

4. Crea el archivo `.env`:

```bash
cp .env.hostinger.example .env
nano .env
```

Edita estos valores:

```env
APP_URL=https://TU-DOMINIO.com
DB_DATABASE=TU_BASE_DE_DATOS
DB_USERNAME=TU_USUARIO_MYSQL
DB_PASSWORD=TU_PASSWORD_MYSQL
```

5. Instala dependencias y prepara Laravel:

```bash
composer install --no-dev --optimize-autoloader
php artisan key:generate --force
php artisan migrate --force
php artisan storage:link
php artisan config:cache
php artisan route:cache
```

6. Crea el primer superadmin:

```bash
php artisan app:create-superadmin 80000000 9999 "Super Admin"
```

7. Entra al sistema:

- Superadmin: `https://TU-DOMINIO.com/superadmin.html`
- Admin/Vendedor: `https://TU-DOMINIO.com/`

## Opcion alternativa: ZIP

1. Comprime el contenido del proyecto.
2. Sube el ZIP a `public_html`.
3. Extrae los archivos.
4. Crea `.env` copiando `.env.hostinger.example`.
5. Ejecuta los comandos de Composer, migraciones y cache desde Terminal/SSH.

## Importante

- No ejecutes `php artisan db:seed` en produccion, porque el seeder actual carga datos demo.
- Si el dominio muestra archivos en vez de abrir Laravel, confirma que el `.htaccess` de la raiz existe.
- Si los sorteos salen fuera de hora, revisa que `.env` tenga:

```env
APP_TIMEZONE=America/Costa_Rica
```
