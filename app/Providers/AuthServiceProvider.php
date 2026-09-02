<?php

namespace App\Providers;

use App\Models\Draw;
use App\Models\Transaction;
use App\Policies\DrawPolicy;
use App\Policies\TransactionPolicy;
use Illuminate\Foundation\Support\Providers\AuthServiceProvider as ServiceProvider;

class AuthServiceProvider extends ServiceProvider
{
    protected $policies = [
        Transaction::class => TransactionPolicy::class,
        Draw::class => DrawPolicy::class,
    ];
}
