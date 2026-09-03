<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\SaleController;
use App\Models\Draw;
use App\Models\Transaction;
use App\Services\DailyDrawService;
use Illuminate\Support\Facades\Route;

// Login por telefono + PIN, sin contrasenas complejas.
Route::post('/login', [AuthController::class, 'login'])
    ->middleware('throttle:6,1'); // 6 intentos por minuto por IP

// Rutas del superadmin -- fuera del middleware de tenant, porque el superadmin no pertenece a ninguno.
Route::middleware('auth:sanctum')->prefix('superadmin')->group(function () {
    Route::get('/plans', [\App\Http\Controllers\SuperAdmin\PlanController::class, 'index']);
    Route::post('/plans', [\App\Http\Controllers\SuperAdmin\PlanController::class, 'store']);

    Route::get('/tenants', [\App\Http\Controllers\SuperAdmin\TenantController::class, 'index']);
    Route::post('/tenants', [\App\Http\Controllers\SuperAdmin\TenantController::class, 'store']);
    Route::put('/tenants/{tenant}', [\App\Http\Controllers\SuperAdmin\TenantController::class, 'update']);
    Route::put('/tenants/{tenant}/admin-pin', [\App\Http\Controllers\SuperAdmin\TenantController::class, 'resetAdminPin']);
});

Route::middleware(['auth:sanctum', \App\Http\Middleware\EnsureTenantScope::class])->group(function () {

    Route::post('/logout', [AuthController::class, 'logout']);

    // Sorteos abiertos para el vendedor autenticado (los chips de la pantalla).
    Route::get('/draws/open', function (\Illuminate\Http\Request $request) {
        app(DailyDrawService::class)->ensureForTenant($request->user()->tenant_id);

        $query = Draw::where('tenant_id', $request->user()->tenant_id)
            ->where('status', 'abierto')
            ->where('is_active', true)
            ->orderBy('draw_datetime');

        // El vendedor solo ve las loterias que tiene asignadas. El admin las ve todas.
        if ($request->user()->role === 'vendedor') {
            $loteriaIds = $request->user()->loterias()->pluck('loterias.id');
            $query->whereIn('loteria_id', $loteriaIds);
        }

        return $query->get()
            ->filter(fn (Draw $draw) => $draw->isOpenForSales())
            ->values();
    });

    // Cuadricula 00-99 de ventas en tiempo real por sorteo (solo admin).
    Route::get('/draws/{draw}/numbers', [\App\Http\Controllers\DrawController::class, 'numbers']);

    // Busqueda operativa de tiquetes/ventas por numero para auditoria del admin.
    Route::get('/sales/search', function (\Illuminate\Http\Request $request) {
        $user = $request->user();
        if (! in_array($user->role, ['admin', 'dueno'])) {
            abort(403);
        }

        $data = $request->validate([
            'number' => ['required', 'regex:/^\d{1,2}$/'],
            'draw_id' => ['nullable', 'integer', 'exists:draws,id'],
        ]);

        $number = str_pad($data['number'], 2, '0', STR_PAD_LEFT);
        $query = Transaction::where('tenant_id', $user->tenant_id)
            ->where('type', 'venta')
            ->where('number_played', $number)
            ->with([
                'user:id,name,phone',
                'client:id,name,phone',
                'draw:id,name,game_type,draw_datetime,status,loteria_id',
                'draw.loteria:id,name',
            ])
            ->latest();

        if (! empty($data['draw_id'])) {
            $draw = Draw::where('tenant_id', $user->tenant_id)->findOrFail($data['draw_id']);
            $query->where('draw_id', $draw->id);
        }

        $items = $query->limit(100)->get();

        return response()->json([
            'number' => $number,
            'count' => $items->count(),
            'main_total' => (float) $items->sum('amount'),
            'addon_total' => (float) $items->sum('addon_amount'),
            'grand_total' => (float) $items->sum(fn (Transaction $sale) => $sale->amount + $sale->addon_amount),
            'items' => $items->map(fn (Transaction $sale) => [
                'id' => $sale->id,
                'number_played' => $sale->number_played,
                'amount' => (float) $sale->amount,
                'addon_amount' => (float) $sale->addon_amount,
                'grand_total' => (float) $sale->amount + (float) $sale->addon_amount,
                'with_addon' => (bool) $sale->with_addon,
                'prepaid_applied' => (bool) $sale->prepaid_applied,
                'created_at' => $sale->created_at,
                'seller' => $sale->user ? [
                    'id' => $sale->user->id,
                    'name' => $sale->user->name,
                    'phone' => $sale->user->phone,
                ] : null,
                'client' => $sale->client ? [
                    'id' => $sale->client->id,
                    'name' => $sale->client->name,
                    'phone' => $sale->client->phone,
                ] : null,
                'draw' => $sale->draw ? [
                    'id' => $sale->draw->id,
                    'name' => $sale->draw->name,
                    'game_type' => $sale->draw->game_type,
                    'status' => $sale->draw->status,
                    'draw_datetime' => $sale->draw->draw_datetime,
                    'loteria_name' => $sale->draw->loteria?->name,
                ] : null,
            ]),
        ]);
    });

    // Cupo disponible de un numero especifico -- lo usa el vendedor antes de vender.
    Route::get('/draws/{draw}/capacity/{numero}', function (\Illuminate\Http\Request $request, \App\Models\Draw $draw, string $numero) {
        if ($draw->tenant_id !== $request->user()->tenant_id) {
            abort(403);
        }

        $rule = \App\Models\TenantRule::where('tenant_id', $draw->tenant_id)
            ->where('game_type', $draw->game_type)
            ->first();

        $vendido = \App\Models\Transaction::where('draw_id', $draw->id)
            ->where('number_played', $numero)
            ->where('type', 'venta')
            ->sum('amount');

        $limit = \App\Models\DrawNumberLimit::where('draw_id', $draw->id)
            ->where('number_played', str_pad($numero, 2, '0', STR_PAD_LEFT))
            ->first();

        if ($limit?->blocked) {
            return response()->json([
                'sin_limite' => false,
                'blocked' => true,
                'max' => 0,
                'vendido' => (float) $vendido,
                'disponible' => 0,
            ]);
        }

        $maximos = collect([$rule?->max_bet_per_number, $limit?->max_amount])
            ->filter(fn ($value) => $value !== null && (float) $value > 0)
            ->map(fn ($value) => (float) $value);

        if ($maximos->isEmpty()) {
            return response()->json(['sin_limite' => true]);
        }

        $max = $maximos->min();

        return response()->json([
            'sin_limite' => false,
            'blocked' => false,
            'max' => (float) $max,
            'vendido' => (float) $vendido,
            'disponible' => max($max - $vendido, 0),
        ]);
    });

    // Registrar una venta.
    Route::post('/sales', [SaleController::class, 'store']);

    // Loterias (producto recurrente: Tica, Nica, Pana...).
    Route::get('/loterias', [\App\Http\Controllers\LoteriaController::class, 'index']);
    Route::post('/loterias', [\App\Http\Controllers\LoteriaController::class, 'store']);

    // Crear vendedores y gestionar que loterias tienen asignadas.
    Route::get('/users', [\App\Http\Controllers\UserController::class, 'index']);
    Route::post('/users', [\App\Http\Controllers\UserController::class, 'store']);
    Route::put('/users/{user}/loterias', [\App\Http\Controllers\UserController::class, 'updateLoterias']);
    Route::put('/users/{user}/pin', [\App\Http\Controllers\UserController::class, 'resetPin']);
    Route::patch('/users/{user}/active', [\App\Http\Controllers\UserController::class, 'setActive']);
    Route::delete('/users/{user}', [\App\Http\Controllers\UserController::class, 'destroy']);

    // Clientes prepago: recargas y saldo descontable por venta.
    Route::get('/clients', [\App\Http\Controllers\ClientController::class, 'index']);
    Route::post('/clients', [\App\Http\Controllers\ClientController::class, 'store']);
    Route::post('/clients/{client}/recharge', [\App\Http\Controllers\ClientController::class, 'recharge']);
    Route::get('/clients/{client}/movements', [\App\Http\Controllers\ClientController::class, 'movements']);
    Route::delete('/clients/{client}', [\App\Http\Controllers\ClientController::class, 'destroy']);

    // Lista de sorteos para el admin, incluyendo sorteos que ya pasaron el corte.
    Route::get('/draws', [\App\Http\Controllers\DrawController::class, 'index']);

    // Crear un nuevo sorteo (ej. "Tica 1pm", "Nica 9pm", "Pana 6pm").
    Route::post('/draws', [\App\Http\Controllers\DrawController::class, 'store']);
    Route::put('/draws/{draw}', [\App\Http\Controllers\DrawController::class, 'update']);
    Route::post('/draws/generate-day', [\App\Http\Controllers\DrawController::class, 'generateDay']);
    Route::patch('/draws/{draw}/active', [\App\Http\Controllers\DrawController::class, 'setActive']);
    Route::delete('/draws/{draw}', [\App\Http\Controllers\DrawController::class, 'destroy']);
    Route::get('/draws/{draw}/number-limits', [\App\Http\Controllers\DrawController::class, 'limits']);
    Route::post('/draws/{draw}/number-limits', [\App\Http\Controllers\DrawController::class, 'saveLimits']);
    Route::delete('/draws/{draw}/number-limits/{number}', [\App\Http\Controllers\DrawController::class, 'deleteLimit']);

    // Cerrar sorteo y calcular premios/comisiones (solo admin/dueno).
    Route::post('/draws/{draw}/close', [\App\Http\Controllers\DrawController::class, 'close']);

    // Registrar entrega de efectivo entre admin y vendedor.
    Route::post('/cash-movements', [\App\Http\Controllers\CashMovementController::class, 'store']);

    // Control completo de ventas, premios, comisiones y efectivo por vendedor.
    Route::get('/reports/seller-control', [\App\Http\Controllers\AdminReportController::class, 'sellerControl']);
    Route::get('/reports/seller-control/export/excel', [\App\Http\Controllers\AdminReportController::class, 'exportExcel']);
    Route::get('/reports/seller-control/export/pdf', [\App\Http\Controllers\AdminReportController::class, 'exportPdf']);
    Route::post('/reports/seller-control/close', [\App\Http\Controllers\AdminReportController::class, 'closeSeller']);

    // Reglas de cada juego (multiplicadores, comision) -- editables por el admin.
    Route::get('/tenant-rules', [\App\Http\Controllers\TenantRuleController::class, 'index']);
    Route::put('/tenant-rules/{tenantRule}', [\App\Http\Controllers\TenantRuleController::class, 'update']);
    Route::get('/vendedores', function (\Illuminate\Http\Request $request) {
        return \App\Models\User::where('tenant_id', $request->user()->tenant_id)
            ->where('role', 'vendedor')
            ->get()
            ->map(fn ($v) => [
                'id' => $v->id,
                'name' => $v->name,
                'balance' => $v->balance(),
            ]);
    });

    // Historial de ventas del vendedor en el dia actual.
    Route::get('/sales/today', function (\Illuminate\Http\Request $request) {
        return Transaction::where('tenant_id', $request->user()->tenant_id)
            ->where('user_id', $request->user()->id)
            ->where('type', 'venta')
            ->whereDate('created_at', today())
            ->latest()
            ->get();
    });

    // Resumen visible para el vendedor: ventas del dia y comisiones propias.
    Route::get('/me/dashboard', function (\Illuminate\Http\Request $request) {
        $user = $request->user();

        $ventasHoy = Transaction::where('tenant_id', $user->tenant_id)
            ->where('user_id', $user->id)
            ->where('type', 'venta')
            ->whereDate('created_at', today())
            ->latest()
            ->with('client:id,name,phone')
            ->get();

        $comisiones = Transaction::where('tenant_id', $user->tenant_id)
            ->where('user_id', $user->id)
            ->where('type', 'comision')
            ->latest()
            ->limit(20)
            ->with('draw:id,name,draw_datetime')
            ->get();

        return response()->json([
            'sales_today' => [
                'count' => $ventasHoy->count(),
                'main_total' => (float) $ventasHoy->sum('amount'),
                'addon_total' => (float) $ventasHoy->sum('addon_amount'),
                'grand_total' => (float) $ventasHoy->sum(fn (Transaction $sale) => $sale->amount + $sale->addon_amount),
                'items' => $ventasHoy,
            ],
            'commissions' => [
                'week_total' => (float) Transaction::where('tenant_id', $user->tenant_id)
                    ->where('user_id', $user->id)
                    ->where('type', 'comision')
                    ->whereBetween('created_at', [now()->startOfWeek(), now()->endOfWeek()])
                    ->sum('amount'),
                'history' => $comisiones->map(fn (Transaction $commission) => [
                    'id' => $commission->id,
                    'amount' => (float) $commission->amount,
                    'created_at' => $commission->created_at,
                    'draw_name' => $commission->draw?->name,
                    'draw_datetime' => $commission->draw?->draw_datetime,
                ]),
            ],
        ]);
    });

    // Saldo actual del vendedor (suma del libro).
    Route::get('/me/balance', function (\Illuminate\Http\Request $request) {
        return ['balance' => $request->user()->balance()];
    });

    // Reporte de comisiones de la semana para el admin.
    Route::get('/reports/commissions', function (\Illuminate\Http\Request $request) {
        return Transaction::where('tenant_id', $request->user()->tenant_id)
            ->whereBetween('created_at', [now()->startOfWeek(), now()->endOfWeek()])
            ->selectRaw('user_id, SUM(amount) as balance')
            ->groupBy('user_id')
            ->with('user:id,name')
            ->get();
    });
});
