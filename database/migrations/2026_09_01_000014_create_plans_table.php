<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('plans', function (Blueprint $table) {
            $table->id();
            $table->string('name');                     // "Basico", "Pro", "Ilimitado"
            $table->decimal('price_monthly', 10, 2);
            $table->unsignedInteger('max_vendedores')->nullable();  // null = ilimitado
            $table->unsignedInteger('max_loterias')->nullable();    // null = ilimitado
            $table->boolean('active')->default(true);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('plans');
    }
};
