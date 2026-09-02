@echo off
set "PATH=C:\LotoX\php;%PATH%"
cd /d "%~dp0"
php artisan serve --host=127.0.0.1 --port=8000
