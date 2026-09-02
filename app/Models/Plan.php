<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Plan extends Model
{
    protected $fillable = ['name', 'price_monthly', 'max_vendedores', 'max_loterias', 'active'];

    public function tenants()
    {
        return $this->hasMany(Tenant::class);
    }
}
