<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('loteria_vendedor', function (Blueprint $table) {
            $table->id();
            $table->foreignId('loteria_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->timestamps();

            $table->unique(['loteria_id', 'user_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('loteria_vendedor');
    }
};
