<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('draw_number_limits', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('draw_id')->constrained()->cascadeOnDelete();
            $table->string('number_played', 3);
            $table->decimal('max_amount', 12, 2)->nullable();
            $table->boolean('blocked')->default(false);
            $table->string('note')->nullable();
            $table->timestamps();

            $table->unique(['draw_id', 'number_played']);
            $table->index(['tenant_id', 'draw_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('draw_number_limits');
    }
};
