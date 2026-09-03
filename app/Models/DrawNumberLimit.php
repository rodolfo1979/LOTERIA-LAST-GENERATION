<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class DrawNumberLimit extends Model
{
    protected $fillable = [
        'tenant_id', 'draw_id', 'number_played', 'max_amount', 'blocked', 'note',
    ];

    protected $casts = [
        'blocked' => 'boolean',
        'max_amount' => 'decimal:2',
    ];

    public function draw()
    {
        return $this->belongsTo(Draw::class);
    }
}
