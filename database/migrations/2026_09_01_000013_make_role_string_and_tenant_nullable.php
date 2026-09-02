<?php

use Illuminate\Database\Migrations\Migration;

return new class extends Migration
{
    public function up(): void
    {
        // Compatibilidad local: la migracion inicial ya crea role como string
        // y tenant_id nullable para permitir usuarios superadmin.
    }

    public function down(): void
    {
        //
    }
};
