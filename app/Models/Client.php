<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Client extends Model
{
    protected $fillable = ['tenant_id', 'name', 'phone', 'active'];

    protected $casts = [
        'active' => 'boolean',
    ];

    public function tenant()
    {
        return $this->belongsTo(Tenant::class);
    }

    public function movements()
    {
        return $this->hasMany(ClientMovement::class);
    }

    public function transactions()
    {
        return $this->hasMany(Transaction::class);
    }

    public function balance(): float
    {
        return (float) $this->movements()->sum('amount');
    }
}
