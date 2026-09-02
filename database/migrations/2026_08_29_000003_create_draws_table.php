<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('draws', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('game_type'); // chance | tiempos | nacional
            $table->dateTime('draw_datetime');
            $table->unsignedInteger('cutoff_minutes')->default(15);
            $table->enum('status', ['abierto', 'cerrado', 'pagado'])->default('abierto');
            $table->string('winning_number')->nullable();
            $table->timestamps();

            $table->index(['tenant_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('draws');
    }
};
