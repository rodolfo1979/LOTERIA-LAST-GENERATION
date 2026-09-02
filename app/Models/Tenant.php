<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Tenant extends Model
{
    protected $fillable = ['name', 'plan_id', 'status', 'subscription_ends_at'];

    public function plan()
    {
        return $this->belongsTo(Plan::class);
    }

    // Cuantos vendedores tiene ahora vs el limite de su plan.
    public function puedeAgregarVendedor(): bool
    {
        if (! $this->plan || $this->plan->max_vendedores === null) {
            return true; // sin plan asignado o plan ilimitado
        }

        $actuales = $this->users()->where('role', 'vendedor')->count();

        return $actuales < $this->plan->max_vendedores;
    }

    public function users()
    {
        return $this->hasMany(User::class);
    }

    public function draws()
    {
        return $this->hasMany(Draw::class);
    }

    public function rules()
    {
        return $this->hasMany(TenantRule::class);
    }

    public function transactions()
    {
        return $this->hasMany(Transaction::class);
    }
}
