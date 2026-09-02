<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SettlementClosure extends Model
{
    protected $fillable = [
        'tenant_id', 'user_id', 'closed_by', 'draw_id', 'period_from', 'period_to',
        'sales_total', 'commission_total', 'prize_total', 'cash_delivered',
        'cash_given', 'settlement_amount', 'status', 'note', 'snapshot',
    ];

    protected $casts = [
        'period_from' => 'date',
        'period_to' => 'date',
        'sales_total' => 'decimal:2',
        'commission_total' => 'decimal:2',
        'prize_total' => 'decimal:2',
        'cash_delivered' => 'decimal:2',
        'cash_given' => 'decimal:2',
        'settlement_amount' => 'decimal:2',
        'snapshot' => 'array',
    ];

    public function seller()
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function closer()
    {
        return $this->belongsTo(User::class, 'closed_by');
    }

    public function draw()
    {
        return $this->belongsTo(Draw::class);
    }
}
