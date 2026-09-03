<?php

use App\Models\User;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Artisan;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Artisan::command('app:create-superadmin {phone} {pin} {name=Super Admin}', function (string $phone, string $pin, string $name) {
    if (! preg_match('/^\d{4}$/', $pin)) {
        $this->error('El PIN debe tener exactamente 4 digitos.');

        return self::FAILURE;
    }

    $user = User::updateOrCreate(
        ['phone' => $phone],
        [
            'tenant_id' => null,
            'name' => $name,
            'role' => 'superadmin',
            'pin_hash' => Hash::make($pin),
            'active' => true,
        ],
    );

    $this->info("Superadmin listo: {$user->name} ({$user->phone})");

    return self::SUCCESS;
})->purpose('Create or update the first production superadmin user');
