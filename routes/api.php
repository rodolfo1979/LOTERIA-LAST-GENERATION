<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\SaleController;
use App\Models\Draw;
use App\Models\Transaction;
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
});

Route::middleware(['auth:sanctum', \App\Http\Middleware\EnsureTenantScope::class])->group(function () {

    Route::post('/logout', [AuthController::class, 'logout']);

    // Sorteos abiertos para el vendedor autenticado (los chips de la pantalla).
    Route::get('/draws/open', function (\Illuminate\Http\Request $request) {
        $query = Draw::where('tenant_id', $request->user()->tenant_id)
            ->where('status', 'abierto')
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

    // Cupo disponible de un numero especifico -- lo usa el vendedor antes de vender.
    Route::get('/draws/{draw}/capacity/{numero}', function (\Illuminate\Http\Request $request, \App\Models\Draw $draw, string $numero) {
        if ($draw->tenant_id !== $request->user()->tenant_id) {
            abort(403);
        }

        $rule = \App\Models\TenantRule::where('tenant_id', $draw->tenant_id)
            ->where('game_type', $draw->game_type)
            ->first();

        if (! $rule || ! $rule->max_bet_per_number) {
            return response()->json(['sin_limite' => true]);
        }

        $vendido = \App\Models\Transaction::where('draw_id', $draw->id)
            ->where('number_played', $numero)
            ->where('type', 'venta')
            ->sum('amount');

        return response()->json([
            'sin_limite' => false,
            'max' => (float) $rule->max_bet_per_number,
            'vendido' => (float) $vendido,
            'disponible' => max($rule->max_bet_per_number - $vendido, 0),
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

    // Lista de sorteos para el admin, incluyendo sorteos que ya pasaron el corte.
    Route::get('/draws', [\App\Http\Controllers\DrawController::class, 'index']);

    // Crear un nuevo sorteo (ej. "Tica 1pm", "Nica 9pm", "Pana 6pm").
    Route::post('/draws', [\App\Http\Controllers\DrawController::class, 'store']);

    // Cerrar sorteo y calcular premios/comisiones (solo admin/dueno).
    Route::post('/draws/{draw}/close', [\App\Http\Controllers\DrawController::class, 'close']);

    // Registrar entrega de efectivo entre admin y vendedor.
    Route::post('/cash-movements', [\App\Http\Controllers\CashMovementController::class, 'store']);

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
