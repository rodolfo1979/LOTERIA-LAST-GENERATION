<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;

class Draw extends Model
{
    protected $fillable = [
        'tenant_id', 'loteria_id', 'game_type', 'name', 'draw_datetime',
        'cutoff_minutes', 'status', 'is_active', 'winning_number', 'winning_number_addon',
    ];

    protected $casts = [
        'draw_datetime' => 'datetime',
        'is_active' => 'boolean',
    ];

    protected $appends = ['draw_datetime_local'];

    public function getDrawDatetimeLocalAttribute(): ?string
    {
        $rawValue = $this->getRawOriginal('draw_datetime');

        return $rawValue ? Carbon::parse($rawValue)->format('Y-m-d H:i:s') : null;
    }

    public function loteria()
    {
        return $this->belongsTo(Loteria::class);
    }

    public function tenant()
    {
        return $this->belongsTo(Tenant::class);
    }

    public function transactions()
    {
        return $this->hasMany(Transaction::class);
    }

    public function numberLimits()
    {
        return $this->hasMany(DrawNumberLimit::class);
    }

    // Hora exacta despues de la cual ya no se aceptan ventas.
    public function cutoffAt(): Carbon
    {
        return $this->draw_datetime->copy()->subMinutes($this->cutoff_minutes);
    }

    public function isOpenForSales(): bool
    {
        return $this->is_active && $this->status === 'abierto' && now()->lt($this->cutoffAt());
    }
}
