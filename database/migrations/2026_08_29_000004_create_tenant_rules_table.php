<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('tenant_rules', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('game_type');
            $table->decimal('commission_pct', 5, 2)->default(10.00);
            $table->decimal('max_bet_per_number', 12, 2)->nullable();
            $table->decimal('prize_multiplier', 8, 2)->default(70.00);
            $table->timestamps();

            $table->unique(['tenant_id', 'game_type']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('tenant_rules');
    }
};
