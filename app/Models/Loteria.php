<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Loteria extends Model
{
    protected $fillable = ['tenant_id', 'name', 'game_type', 'active'];

    public function tenant()
    {
        return $this->belongsTo(Tenant::class);
    }

    public function draws()
    {
        return $this->hasMany(Draw::class);
    }

    // Vendedores autorizados a vender esta loteria.
    public function vendedores()
    {
        return $this->belongsToMany(User::class, 'loteria_vendedor');
    }
}
