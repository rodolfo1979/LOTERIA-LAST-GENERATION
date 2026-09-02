<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('draws', function (Blueprint $table) {
            // Ej: "Tica 1pm", "Nica 9pm", "Pana 6pm" -- el nombre que ve el vendedor.
            // game_type sigue siendo el que determina que reglas aplican (tiempos, 3monazos).
            $table->string('name')->nullable()->after('game_type');
        });
    }

    public function down(): void
    {
        Schema::table('draws', function (Blueprint $table) {
            $table->dropColumn('name');
        });
    }
};
