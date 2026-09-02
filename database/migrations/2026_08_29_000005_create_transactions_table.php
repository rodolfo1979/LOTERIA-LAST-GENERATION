<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('transactions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('draw_id')->nullable()->constrained()->nullOnDelete();
            $table->enum('type', ['venta', 'comision', 'premio', 'pago', 'ajuste']);
            $table->decimal('amount', 12, 2); // positivo o negativo segun el tipo
            $table->string('number_played')->nullable();
            $table->json('metadata')->nullable();
            $table->timestamps();

            $table->index(['tenant_id', 'user_id', 'created_at']);
            $table->index(['draw_id', 'type']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('transactions');
    }
};
