<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('settlement_closures', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('closed_by')->constrained('users')->cascadeOnDelete();
            $table->foreignId('draw_id')->nullable()->constrained()->nullOnDelete();
            $table->date('period_from');
            $table->date('period_to');
            $table->decimal('sales_total', 12, 2)->default(0);
            $table->decimal('commission_total', 12, 2)->default(0);
            $table->decimal('prize_total', 12, 2)->default(0);
            $table->decimal('cash_delivered', 12, 2)->default(0);
            $table->decimal('cash_given', 12, 2)->default(0);
            $table->decimal('settlement_amount', 12, 2)->default(0);
            $table->string('status')->default('cerrado');
            $table->text('note')->nullable();
            $table->json('snapshot')->nullable();
            $table->timestamps();

            $table->index(['tenant_id', 'user_id', 'period_from', 'period_to']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('settlement_closures');
    }
};
