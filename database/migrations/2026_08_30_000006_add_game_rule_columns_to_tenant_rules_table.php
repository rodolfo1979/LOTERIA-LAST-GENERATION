<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tenant_rules', function (Blueprint $table) {
            // Cuantos digitos tiene la jugada: 2 para Tiempos, 3 para 3 Monazos.
            $table->unsignedTinyInteger('digits_count')->default(2)->after('game_type');

            // Multiplicador del addon opcional (Reventado). Null = ese juego no tiene addon.
            $table->decimal('addon_multiplier', 8, 2)->nullable()->after('prize_multiplier');

            // Pagos por coincidencia parcial, ej: {"3":1000,"2":80,"1":8}. Null = todo o nada.
            $table->json('partial_match_rules')->nullable()->after('addon_multiplier');
        });
    }

    public function down(): void
    {
        Schema::table('tenant_rules', function (Blueprint $table) {
            $table->dropColumn(['digits_count', 'addon_multiplier', 'partial_match_rules']);
        });
    }
};
