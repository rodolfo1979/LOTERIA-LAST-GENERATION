<?php

namespace Tests\Feature;

use App\Models\Client;
use App\Models\ClientMovement;
use App\Models\Draw;
use App\Models\Loteria;
use App\Models\Plan;
use App\Models\Tenant;
use App\Models\TenantRule;
use App\Models\Transaction;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PrepaidClientSaleTest extends TestCase
{
    use RefreshDatabase;

    public function test_prepaid_sale_discounts_client_balance_and_appears_in_history(): void
    {
        $plan = Plan::create([
            'name' => 'Pro',
            'price_monthly' => 25000,
            'max_vendedores' => 10,
            'max_loterias' => 5,
        ]);

        $tenant = Tenant::create([
            'name' => 'Loteria Demo CR',
            'plan_id' => $plan->id,
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

        $loteria = Loteria::create([
            'tenant_id' => $tenant->id,
            'name' => 'Tica',
            'game_type' => 'tiempos',
        ]);

        $seller = User::create([
            'tenant_id' => $tenant->id,
            'name' => 'Rodolfo',
            'phone' => '60040508',
            'role' => 'vendedor',
            'pin_hash' => Hash::make('1234'),
        ]);
        $seller->loterias()->sync([$loteria->id]);

        $admin = User::create([
            'tenant_id' => $tenant->id,
            'name' => 'Admin',
            'phone' => '88880000',
            'role' => 'admin',
            'pin_hash' => Hash::make('1234'),
        ]);

        $draw = Draw::create([
            'tenant_id' => $tenant->id,
            'loteria_id' => $loteria->id,
            'name' => $loteria->name,
            'game_type' => $loteria->game_type,
            'draw_datetime' => now()->addHours(2),
            'cutoff_minutes' => 15,
            'status' => 'abierto',
        ]);

        $client = Client::create([
            'tenant_id' => $tenant->id,
            'name' => 'Rodolfo',
            'phone' => '60040508',
        ]);

        ClientMovement::create([
            'tenant_id' => $tenant->id,
            'client_id' => $client->id,
            'user_id' => $admin->id,
            'type' => 'recarga',
            'amount' => 8000,
            'note' => 'Saldo inicial',
        ]);

        Sanctum::actingAs($seller);

        $this->postJson('/api/sales', [
            'draw_id' => $draw->id,
            'number_played' => '41',
            'amount' => 1000,
            'with_addon' => true,
            'addon_amount' => 2000,
            'client_id' => $client->id,
            'payment_mode' => 'prepaid',
        ])->assertCreated()
            ->assertJsonPath('client_id', $client->id)
            ->assertJsonPath('prepaid_applied', true);

        $this->assertSame(5000.0, $client->fresh()->balance());

        $this->assertDatabaseHas('client_movements', [
            'client_id' => $client->id,
            'user_id' => $seller->id,
            'type' => 'compra',
            'amount' => -3000,
            'note' => 'Compra Tica numero 41',
        ]);

        $this->assertDatabaseHas('transactions', [
            'tenant_id' => $tenant->id,
            'user_id' => $seller->id,
            'draw_id' => $draw->id,
            'type' => 'comision',
            'amount' => 300,
        ]);

        $sale = Transaction::where('type', 'venta')->first();
        $this->assertDatabaseHas('transactions', [
            'type' => 'comision',
            'metadata->sale_transaction_id' => $sale->id,
            'metadata->commission_pct' => 10,
        ]);

        $this->getJson('/api/me/dashboard')
            ->assertOk()
            ->assertJsonPath('commissions.week_total', 300)
            ->assertJsonPath('commissions.history.0.amount', 300)
            ->assertJsonPath('commissions.history.0.draw_name', 'Tica');

        Sanctum::actingAs($admin);

        $this->getJson("/api/clients/{$client->id}/movements")
            ->assertOk()
            ->assertJsonPath('0.type', 'compra')
            ->assertJsonPath('0.amount', -3000)
            ->assertJsonPath('0.draw_name', 'Tica')
            ->assertJsonPath('0.number_played', '41')
            ->assertJsonPath('0.prepaid_applied', true);
    }
}
