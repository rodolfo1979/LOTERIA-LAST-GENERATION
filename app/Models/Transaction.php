<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Transaction extends Model
{
    protected $fillable = [
        'tenant_id', 'user_id', 'client_id', 'prepaid_applied', 'draw_id', 'type',
        'amount', 'number_played', 'with_addon', 'addon_amount', 'metadata',
    ];

    protected $casts = [
        'prepaid_applied' => 'boolean',
        'with_addon' => 'boolean',
        'addon_amount' => 'decimal:2',
        'metadata' => 'array',
    ];

    public function tenant()
    {
        return $this->belongsTo(Tenant::class);
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function client()
    {
        return $this->belongsTo(Client::class);
    }

    public function draw()
    {
        return $this->belongsTo(Draw::class);
    }
}
