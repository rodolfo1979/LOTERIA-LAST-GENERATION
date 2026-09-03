<?php

namespace App\Models;

use Illuminate\Foundation\Auth\User as Authenticatable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    use HasApiTokens;

    protected $fillable = ['tenant_id', 'name', 'phone', 'role', 'active', 'pin_hash'];

    protected $hidden = ['pin_hash'];

    protected $casts = [
        'active' => 'boolean',
    ];

    public function tenant()
    {
        return $this->belongsTo(Tenant::class);
    }

    public function transactions()
    {
        return $this->hasMany(Transaction::class);
    }

    // Loterias que este vendedor tiene autorizado vender.
    public function loterias()
    {
        return $this->belongsToMany(Loteria::class, 'loteria_vendedor');
    }

    // Saldo actual = suma de todo el libro para este vendedor.
    public function balance(): float
    {
        return (float) $this->transactions()->sum('amount');
    }
}
