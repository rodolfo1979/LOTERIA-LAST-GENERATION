<?php

namespace Tests\Feature;

use App\Models\Draw;
use App\Models\DrawNumberLimit;
use App\Models\Loteria;
use App\Models\Plan;
use App\Models\Tenant;
use App\Models\TenantRule;
use App\Models\Transaction;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class DrawAdministrationTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Carbon::setTestNow();

        parent::tearDown();
    }

    public function test_seller_open_draws_auto_prepares_today_and_preserves_manual_deactivation(): void
    {
        Carbon::setTestNow('2026-09-04 08:00:00');

        $tenant = $this->tenant();
        $admin = $this->user($tenant->id, 'admin', '88880000');
        $seller = $this->user($tenant->id, 'vendedor', '88881111');
        $loteria = Loteria::create(['tenant_id' => $tenant->id, 'name' => 'Tica', 'game_type' => 'tiempos']);
        $seller->loterias()->sync([$loteria->id]);

        Draw::create([
            'tenant_id' => $tenant->id,
            'loteria_id' => $loteria->id,
            'name' => 'Tica',
            'game_type' => 'tiempos',
            'draw_datetime' => '2026-09-03 10:00:00',
            'cutoff_minutes' => 15,
            'status' => 'abierto',
            'is_active' => true,
        ]);

        Draw::create([
            'tenant_id' => $tenant->id,
            'loteria_id' => $loteria->id,
            'name' => 'Tica',
            'game_type' => 'tiempos',
            'draw_datetime' => '2026-09-03 20:00:00',
            'cutoff_minutes' => 15,
            'status' => 'abierto',
            'is_active' => true,
        ]);

        Sanctum::actingAs($seller);

        $this->getJson('/api/draws/open')
            ->assertOk()
            ->assertJsonCount(2)
            ->assertJsonFragment(['draw_datetime' => '2026-09-04T10:00:00.000000Z'])
            ->assertJsonFragment(['draw_datetime' => '2026-09-04T20:00:00.000000Z']);

        $this->assertDatabaseCount('draws', 4);

        $morningDraw = Draw::where('loteria_id', $loteria->id)
            ->where('draw_datetime', '2026-09-04 10:00:00')
            ->firstOrFail();

        Sanctum::actingAs($admin);

        $this->patchJson("/api/draws/{$morningDraw->id}/active", ['is_active' => false])
            ->assertOk();

        Sanctum::actingAs($seller);

        $this->getJson('/api/draws/open')
            ->assertOk()
            ->assertJsonCount(1)
            ->assertJsonMissing(['id' => $morningDraw->id]);

        $this->assertDatabaseCount('draws', 4);

        Carbon::setTestNow();
    }

    public function test_auto_prepared_draw_keeps_admin_edited_time_without_recreating_old_time(): void
    {
        Carbon::setTestNow('2026-09-04 08:00:00');

        $tenant = $this->tenant();
        $admin = $this->user($tenant->id, 'admin', '88880000');
        $seller = $this->user($tenant->id, 'vendedor', '88881111');
        $loteria = Loteria::create(['tenant_id' => $tenant->id, 'name' => 'Nica', 'game_type' => 'tiempos']);
        $seller->loterias()->sync([$loteria->id]);

        Draw::create([
            'tenant_id' => $tenant->id,
            'loteria_id' => $loteria->id,
            'name' => 'Nica',
            'game_type' => 'tiempos',
            'draw_datetime' => '2026-09-03 10:00:00',
            'cutoff_minutes' => 15,
            'status' => 'abierto',
            'is_active' => true,
        ]);

        Sanctum::actingAs($seller);

        $this->getJson('/api/draws/open')
            ->assertOk()
            ->assertJsonCount(1);

        $todayDraw = Draw::where('loteria_id', $loteria->id)
            ->where('draw_datetime', '2026-09-04 10:00:00')
            ->firstOrFail();

        Sanctum::actingAs($admin);

        $this->putJson("/api/draws/{$todayDraw->id}", [
            'loteria_id' => $loteria->id,
            'draw_datetime' => '2026-09-04 12:00:00',
            'cutoff_minutes' => 15,
            'is_active' => true,
        ])->assertOk();

        $this->getJson('/api/draws')
            ->assertOk();

        $this->assertDatabaseMissing('draws', [
            'tenant_id' => $tenant->id,
            'loteria_id' => $loteria->id,
            'draw_datetime' => '2026-09-04 10:00:00',
        ]);

        $this->assertDatabaseHas('draws', [
            'tenant_id' => $tenant->id,
            'loteria_id' => $loteria->id,
            'draw_datetime' => '2026-09-04 12:00:00',
            'is_active' => true,
        ]);

        $this->assertDatabaseCount('draws', 2);

        Carbon::setTestNow();
    }

    public function test_admin_can_generate_daily_draws_and_disable_one_for_sales(): void
    {
        $tenant = $this->tenant();
        $admin = $this->user($tenant->id, 'admin', '88880000');
        $seller = $this->user($tenant->id, 'vendedor', '88881111');

        TenantRule::create([
            'tenant_id' => $tenant->id,
            'game_type' => 'tiempos',
            'digits_count' => 2,
            'commission_pct' => 10,
            'max_bet_per_number' => 5000,
            'prize_multiplier' => 90,
            'addon_multiplier' => 200,
        ]);

        $tica = Loteria::create(['tenant_id' => $tenant->id, 'name' => 'Tica', 'game_type' => 'tiempos']);
        $nica = Loteria::create(['tenant_id' => $tenant->id, 'name' => 'Nica', 'game_type' => 'tiempos']);
        $seller->loterias()->sync([$tica->id, $nica->id]);

        Draw::create([
            'tenant_id' => $tenant->id,
            'loteria_id' => $tica->id,
            'name' => 'Tica',
            'game_type' => 'tiempos',
            'draw_datetime' => '2026-09-03 14:30:00',
            'cutoff_minutes' => 15,
            'status' => 'abierto',
            'is_active' => true,
        ]);

        Draw::create([
            'tenant_id' => $tenant->id,
            'loteria_id' => $nica->id,
            'name' => 'Nica',
            'game_type' => 'tiempos',
            'draw_datetime' => '2026-09-03 20:00:00',
            'cutoff_minutes' => 15,
            'status' => 'abierto',
            'is_active' => true,
        ]);

        Sanctum::actingAs($admin);

        $this->postJson('/api/draws/generate-day', ['date' => '2026-09-04'])
            ->assertOk()
            ->assertJsonPath('created_count', 2)
            ->assertJsonPath('existing_count', 0);

        $draw = Draw::where('loteria_id', $nica->id)
            ->where('draw_datetime', '2026-09-04 20:00:00')
            ->firstOrFail();

        $this->patchJson("/api/draws/{$draw->id}/active", ['is_active' => false])
            ->assertOk()
            ->assertJsonPath('draw.is_active', false);

        Sanctum::actingAs($seller);

        $this->getJson('/api/draws/open')
            ->assertOk()
            ->assertJsonMissing(['id' => $draw->id]);
    }

    public function test_admin_can_edit_open_draw_but_cannot_change_lottery_after_sales(): void
    {
        $tenant = $this->tenant();
        $admin = $this->user($tenant->id, 'admin', '88880000');
        $seller = $this->user($tenant->id, 'vendedor', '88881111');

        $tica = Loteria::create(['tenant_id' => $tenant->id, 'name' => 'Tica', 'game_type' => 'tiempos']);
        $nica = Loteria::create(['tenant_id' => $tenant->id, 'name' => 'Nica', 'game_type' => 'tiempos']);

        $draw = Draw::create([
            'tenant_id' => $tenant->id,
            'loteria_id' => $tica->id,
            'name' => 'Tica',
            'game_type' => 'tiempos',
            'draw_datetime' => '2026-09-03 14:30:00',
            'cutoff_minutes' => 15,
            'status' => 'abierto',
            'is_active' => true,
        ]);

        Sanctum::actingAs($admin);

        $this->putJson("/api/draws/{$draw->id}", [
            'loteria_id' => $nica->id,
            'draw_datetime' => '2026-09-03 20:00:00',
            'cutoff_minutes' => 20,
            'is_active' => false,
        ])->assertOk()
            ->assertJsonPath('draw.loteria_id', $nica->id)
            ->assertJsonPath('draw.name', 'Nica')
            ->assertJsonPath('draw.cutoff_minutes', 20)
            ->assertJsonPath('draw.is_active', false);

        Transaction::create([
            'tenant_id' => $tenant->id,
            'user_id' => $seller->id,
            'draw_id' => $draw->id,
            'type' => 'venta',
            'amount' => 500,
            'number_played' => '41',
        ]);

        $this->putJson("/api/draws/{$draw->id}", [
            'loteria_id' => $tica->id,
            'draw_datetime' => '2026-09-03 21:00:00',
            'cutoff_minutes' => 25,
            'is_active' => true,
        ])->assertUnprocessable()
            ->assertJsonPath('message', 'Este sorteo ya tiene ventas. No se puede cambiar la loteria, solo fecha, hora, corte o activacion.');
    }

    public function test_admin_can_block_and_limit_numbers_for_a_draw(): void
    {
        $tenant = $this->tenant();
        $admin = $this->user($tenant->id, 'admin', '88880000');
        $seller = $this->user($tenant->id, 'vendedor', '88881111');

        TenantRule::create([
            'tenant_id' => $tenant->id,
            'game_type' => 'tiempos',
            'digits_count' => 2,
            'commission_pct' => 10,
            'max_bet_per_number' => 5000,
            'prize_multiplier' => 90,
            'addon_multiplier' => 200,
        ]);

        $loteria = Loteria::create(['tenant_id' => $tenant->id, 'name' => 'Tica', 'game_type' => 'tiempos']);
        $seller->loterias()->sync([$loteria->id]);

        $draw = Draw::create([
            'tenant_id' => $tenant->id,
            'loteria_id' => $loteria->id,
            'name' => 'Tica',
            'game_type' => 'tiempos',
            'draw_datetime' => now()->addHours(2),
            'cutoff_minutes' => 15,
            'status' => 'abierto',
            'is_active' => true,
        ]);

        Sanctum::actingAs($admin);

        $this->postJson("/api/draws/{$draw->id}/number-limits", [
            'numbers' => ['45'],
            'blocked' => true,
        ])->assertOk();

        $this->postJson("/api/draws/{$draw->id}/number-limits", [
            'numbers' => ['12'],
            'max_amount' => 1000,
            'blocked' => false,
        ])->assertOk();

        Sanctum::actingAs($seller);

        $this->postJson('/api/sales', [
            'draw_id' => $draw->id,
            'number_played' => '45',
            'amount' => 500,
        ])->assertUnprocessable()
            ->assertJsonPath('message', 'Ese numero esta bloqueado para este sorteo.');

        $this->postJson('/api/sales', [
            'draw_id' => $draw->id,
            'number_played' => '12',
            'amount' => 1500,
        ])->assertUnprocessable()
            ->assertJsonPath('disponible', 1000);

        $this->postJson('/api/sales', [
            'draw_id' => $draw->id,
            'number_played' => '12',
            'amount' => 1000,
        ])->assertCreated();

        $this->getJson("/api/draws/{$draw->id}/capacity/12")
            ->assertOk()
            ->assertJsonPath('disponible', 0);

        $this->assertDatabaseHas('draw_number_limits', [
            'draw_id' => $draw->id,
            'number_played' => '45',
            'blocked' => true,
        ]);
    }

    public function test_admin_can_search_sales_by_number(): void
    {
        $tenant = $this->tenant();
        $admin = $this->user($tenant->id, 'admin', '88880000');
        $seller = $this->user($tenant->id, 'vendedor', '88881111');
        $loteria = Loteria::create(['tenant_id' => $tenant->id, 'name' => 'Tica', 'game_type' => 'tiempos']);

        $draw = Draw::create([
            'tenant_id' => $tenant->id,
            'loteria_id' => $loteria->id,
            'name' => 'Tica',
            'game_type' => 'tiempos',
            'draw_datetime' => now()->addHours(2),
            'cutoff_minutes' => 15,
            'status' => 'abierto',
            'is_active' => true,
        ]);

        Transaction::create([
            'tenant_id' => $tenant->id,
            'user_id' => $seller->id,
            'draw_id' => $draw->id,
            'type' => 'venta',
            'amount' => 1000,
            'number_played' => '45',
            'with_addon' => true,
            'addon_amount' => 500,
        ]);

        Transaction::create([
            'tenant_id' => $tenant->id,
            'user_id' => $seller->id,
            'draw_id' => $draw->id,
            'type' => 'venta',
            'amount' => 2000,
            'number_played' => '12',
        ]);

        Sanctum::actingAs($admin);

        $this->getJson("/api/sales/search?number=45&draw_id={$draw->id}")
            ->assertOk()
            ->assertJsonPath('number', '45')
            ->assertJsonPath('count', 1)
            ->assertJsonPath('main_total', 1000)
            ->assertJsonPath('addon_total', 500)
            ->assertJsonPath('grand_total', 1500)
            ->assertJsonPath('items.0.seller.name', 'Vendedor')
            ->assertJsonPath('items.0.draw.name', 'Tica');
    }

    public function test_admin_can_reset_seller_pin(): void
    {
        $tenant = $this->tenant();
        $admin = $this->user($tenant->id, 'admin', '88880000');
        $seller = $this->user($tenant->id, 'vendedor', '88881111');

        Sanctum::actingAs($admin);

        $this->putJson("/api/users/{$seller->id}/pin", ['pin' => '4321'])
            ->assertOk()
            ->assertJsonPath('user.id', $seller->id);

        $this->postJson('/api/login', ['phone' => '88881111', 'pin' => '1234'])
            ->assertUnprocessable()
            ->assertJsonPath('message', 'Telefono o PIN incorrecto.');

        $this->postJson('/api/login', ['phone' => '88881111', 'pin' => '4321'])
            ->assertOk()
            ->assertJsonPath('user.id', $seller->id);
    }

    public function test_admin_can_deactivate_and_reactivate_seller_without_deleting_history(): void
    {
        $tenant = $this->tenant();
        $admin = $this->user($tenant->id, 'admin', '88880000');
        $seller = $this->user($tenant->id, 'vendedor', '88881111');

        Transaction::create([
            'tenant_id' => $tenant->id,
            'user_id' => $seller->id,
            'type' => 'venta',
            'amount' => 1000,
            'number_played' => '45',
        ]);

        Sanctum::actingAs($admin);

        $this->patchJson("/api/users/{$seller->id}/active", ['active' => false])
            ->assertOk()
            ->assertJsonPath('user.active', false);

        $this->assertDatabaseHas('users', [
            'id' => $seller->id,
            'active' => false,
        ]);
        $this->assertDatabaseHas('transactions', [
            'user_id' => $seller->id,
            'type' => 'venta',
            'amount' => 1000,
        ]);

        $this->postJson('/api/login', ['phone' => '88881111', 'pin' => '1234'])
            ->assertUnprocessable()
            ->assertJsonPath('message', 'Este usuario esta desactivado. Consulta con el administrador.');

        $this->patchJson("/api/users/{$seller->id}/active", ['active' => true])
            ->assertOk()
            ->assertJsonPath('user.active', true);

        $this->postJson('/api/login', ['phone' => '88881111', 'pin' => '1234'])
            ->assertOk()
            ->assertJsonPath('user.id', $seller->id);
    }

    public function test_superadmin_can_reset_tenant_admin_pin(): void
    {
        $tenant = $this->tenant();
        $superadmin = User::create([
            'tenant_id' => null,
            'name' => 'Superadmin',
            'phone' => '80000000',
            'role' => 'superadmin',
            'pin_hash' => Hash::make('9999'),
        ]);
        $tenantAdmin = $this->user($tenant->id, 'admin', '88880000');

        Sanctum::actingAs($superadmin);

        $this->putJson("/api/superadmin/tenants/{$tenant->id}/admin-pin", [
            'user_id' => $tenantAdmin->id,
            'pin' => '2468',
        ])->assertOk()
            ->assertJsonPath('admin.id', $tenantAdmin->id);

        $this->postJson('/api/login', ['phone' => '88880000', 'pin' => '1234'])
            ->assertUnprocessable()
            ->assertJsonPath('message', 'Telefono o PIN incorrecto.');

        $this->postJson('/api/login', ['phone' => '88880000', 'pin' => '2468'])
            ->assertOk()
            ->assertJsonPath('user.id', $tenantAdmin->id);
    }

    private function tenant(): Tenant
    {
        $plan = Plan::create([
            'name' => 'Pro',
            'price_monthly' => 25000,
            'max_vendedores' => 10,
            'max_loterias' => 5,
        ]);

        return Tenant::create([
            'name' => 'Loteria Demo CR',
            'plan_id' => $plan->id,
            'status' => 'activo',
        ]);
    }

    private function user(int $tenantId, string $role, string $phone): User
    {
        return User::create([
            'tenant_id' => $tenantId,
            'name' => ucfirst($role),
            'phone' => $phone,
            'role' => $role,
            'pin_hash' => Hash::make('1234'),
        ]);
    }
}
