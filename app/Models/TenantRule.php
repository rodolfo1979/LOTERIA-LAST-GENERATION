<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TenantRule extends Model
{
    protected $fillable = [
        'tenant_id', 'game_type', 'digits_count', 'commission_pct',
        'max_bet_per_number', 'prize_multiplier', 'addon_multiplier',
        'partial_match_rules',
    ];

    protected $casts = [
        'partial_match_rules' => 'array',
    ];

    public function tenant()
    {
        return $this->belongsTo(Tenant::class);
    }
}
