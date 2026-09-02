<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;

class Draw extends Model
{
    protected $fillable = [
        'tenant_id', 'loteria_id', 'game_type', 'name', 'draw_datetime',
        'cutoff_minutes', 'status', 'winning_number', 'winning_number_addon',
    ];

    protected $casts = [
        'draw_datetime' => 'datetime',
    ];

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

    // Hora exacta despues de la cual ya no se aceptan ventas.
    public function cutoffAt(): Carbon
    {
        return $this->draw_datetime->copy()->subMinutes($this->cutoff_minutes);
    }

    public function isOpenForSales(): bool
    {
        return $this->status === 'abierto' && now()->lt($this->cutoffAt());
    }
}
