<?php

namespace Database\Seeders;

use App\Models\Draw;
use App\Models\Loteria;
use App\Models\Plan;
use App\Models\Tenant;
use App\Models\TenantRule;
use App\Models\Transaction;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class LoteriaDemoSeeder extends Seeder
{
    public function run(): void
    {
        // Superadmin: no pertenece a ningun tenant, gestiona toda la plataforma.
        User::create([
            'tenant_id' => null,
            'name' => 'Super Admin',
            'phone' => '80000000',
            'role' => 'superadmin',
            'pin_hash' => Hash::make('9999'),
        ]);

        $planPro = Plan::create([
            'name' => 'Pro',
            'price_monthly' => 25000,
            'max_vendedores' => 10,
            'max_loterias' => 5,
        ]);

        Plan::create([
            'name' => 'Basico',
            'price_monthly' => 12000,
            'max_vendedores' => 3,
            'max_loterias' => 2,
        ]);

        Plan::create([
            'name' => 'Ilimitado',
            'price_monthly' => 45000,
            'max_vendedores' => null,
            'max_loterias' => null,
        ]);

        $tenant = Tenant::create([
            'name' => 'Loteria Demo CR',
            'plan_id' => $planPro->id,
            'status' => 'activo',
        ]);

        TenantRule::create([
            'tenant_id' => $tenant->id,
            'game_type' => 'tiempos',
            'digits_count' => 2,
            'commission_pct' => 10,
            'max_bet_per_number' => 5000,
            'prize_multiplier' => 90,
            'addon_multiplier' => 200,
        ]);

        TenantRule::create([
            'tenant_id' => $tenant->id,
            'game_type' => '3monazos',
            'digits_count' => 3,
            'commission_pct' => 10,
            'max_bet_per_number' => 5000,
            'prize_multiplier' => 1000,
            'partial_match_rules' => ['3' => 1000, '2' => 80, '1' => 8],
        ]);

        // Loterias: el producto recurrente que se le asigna a cada vendedor.
        $tica = Loteria::create(['tenant_id' => $tenant->id, 'name' => 'Tica', 'game_type' => 'tiempos']);
        $nica = Loteria::create(['tenant_id' => $tenant->id, 'name' => 'Nica', 'game_type' => 'tiempos']);
        $pana = Loteria::create(['tenant_id' => $tenant->id, 'name' => 'Pana', 'game_type' => '3monazos']);

        $admin = User::create([
            'tenant_id' => $tenant->id,
            'name' => 'Admin Demo',
            'phone' => '88880000',
            'role' => 'admin',
            'pin_hash' => Hash::make('1234'),
        ]);

        $vendedores = collect([
            ['Marco Solis', '88881111'],
            ['Ana Vega', '88882222'],
            ['Luis Jimenez', '88883333'],
        ])->map(fn ($seller) => User::create([
                'tenant_id' => $tenant->id,
                'name' => $seller[0],
                'phone' => $seller[1],
                'role' => 'vendedor',
                'pin_hash' => Hash::make('1234'),
            ]));

        // Asignacion de ejemplo: Marco y Ana venden Tica y Nica; Luis solo Pana.
        $vendedores[0]->loterias()->sync([$tica->id, $nica->id]);
        $vendedores[1]->loterias()->sync([$tica->id, $nica->id]);
        $vendedores[2]->loterias()->sync([$pana->id]);

        $draw = Draw::create([
            'tenant_id' => $tenant->id,
            'loteria_id' => $tica->id,
            'name' => $tica->name,
            'game_type' => $tica->game_type,
            'draw_datetime' => now()->addHours(2),
            'cutoff_minutes' => 15,
            'status' => 'abierto',
        ]);

        // Ventas de ejemplo -- solo de los vendedores que tienen Tica asignada.
        foreach ([$vendedores[0], $vendedores[1]] as $vendedor) {
            Transaction::create([
                'tenant_id' => $tenant->id,
                'user_id' => $vendedor->id,
                'draw_id' => $draw->id,
                'type' => 'venta',
                'amount' => 500,
                'number_played' => '34',
                'with_addon' => true,
            ]);

            foreach ([['07', 1000], ['99', 200]] as [$numero, $monto]) {
                Transaction::create([
                    'tenant_id' => $tenant->id,
                    'user_id' => $vendedor->id,
                    'draw_id' => $draw->id,
                    'type' => 'venta',
                    'amount' => $monto,
                    'number_played' => $numero,
                    'addon_amount' => 0,
                ]);
            }
        }

        $this->command->info("Tenant demo creado. Sorteo #{$draw->id} (Tica) listo para cerrar con CloseDrawJob.");
    }
}
