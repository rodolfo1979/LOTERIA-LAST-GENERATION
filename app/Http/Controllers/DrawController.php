<?php

namespace App\Http\Controllers;

use App\Jobs\CloseDrawJob;
use App\Models\Draw;
use App\Models\DrawNumberLimit;
use App\Models\Loteria;
use App\Models\TenantRule;
use App\Models\Transaction;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class DrawController extends Controller
{
    public function index(Request $request)
    {
        if (! in_array($request->user()->role, ['admin', 'dueno'])) {
            abort(403);
        }

        return Draw::where('tenant_id', $request->user()->tenant_id)
            ->latest('draw_datetime')
            ->limit(50)
            ->get()
            ->map(fn (Draw $draw) => [
                'id' => $draw->id,
                'tenant_id' => $draw->tenant_id,
                'loteria_id' => $draw->loteria_id,
                'name' => $draw->name,
                'game_type' => $draw->game_type,
                'draw_datetime' => $draw->draw_datetime,
                'cutoff_minutes' => $draw->cutoff_minutes,
                'status' => $draw->status,
                'is_active' => $draw->is_active,
                'is_open_for_sales' => $draw->isOpenForSales(),
                'sales_count' => $draw->transactions()->where('type', 'venta')->count(),
                'winning_number' => $draw->winning_number,
                'winning_number_addon' => $draw->winning_number_addon,
            ]);
    }

    // Crea un sorteo puntual (ej. "Tica" de hoy 6pm) a partir de una loteria ya existente.
    // El nombre y las reglas se heredan de la loteria, no se escriben libres aqui.
    public function store(Request $request)
    {
        if (! in_array($request->user()->role, ['admin', 'dueno'])) {
            abort(403, 'Solo el admin puede crear sorteos.');
        }

        $data = $request->validate([
            'loteria_id' => ['required', 'exists:loterias,id'],
            'draw_datetime' => ['required', 'date'],
            'cutoff_minutes' => ['sometimes', 'integer', 'min:0'],
        ]);

        $loteria = Loteria::findOrFail($data['loteria_id']);

        if ($loteria->tenant_id !== $request->user()->tenant_id) {
            abort(403);
        }

        $draw = Draw::create([
            'tenant_id' => $request->user()->tenant_id,
            'loteria_id' => $loteria->id,
            'name' => $loteria->name,
            'game_type' => $loteria->game_type,
            'draw_datetime' => $data['draw_datetime'],
            'cutoff_minutes' => $data['cutoff_minutes'] ?? 15,
            'status' => 'abierto',
            'is_active' => true,
        ]);

        return response()->json($draw, 201);
    }

    public function update(Request $request, Draw $draw)
    {
        if (! in_array($request->user()->role, ['admin', 'dueno']) || $draw->tenant_id !== $request->user()->tenant_id) {
            abort(403);
        }

        if ($draw->status !== 'abierto') {
            return response()->json([
                'message' => 'Solo se pueden editar sorteos abiertos.',
            ], 422);
        }

        $data = $request->validate([
            'loteria_id' => ['required', 'exists:loterias,id'],
            'draw_datetime' => ['required', 'date'],
            'cutoff_minutes' => ['required', 'integer', 'min:0'],
            'is_active' => ['required', 'boolean'],
        ]);

        $hasSales = $draw->transactions()->where('type', 'venta')->exists();
        if ($hasSales && (int) $data['loteria_id'] !== (int) $draw->loteria_id) {
            return response()->json([
                'message' => 'Este sorteo ya tiene ventas. No se puede cambiar la loteria, solo fecha, hora, corte o activacion.',
            ], 422);
        }

        $loteria = Loteria::where('tenant_id', $request->user()->tenant_id)
            ->findOrFail($data['loteria_id']);

        $draw->update([
            'loteria_id' => $loteria->id,
            'name' => $loteria->name,
            'game_type' => $loteria->game_type,
            'draw_datetime' => $data['draw_datetime'],
            'cutoff_minutes' => $data['cutoff_minutes'],
            'is_active' => (bool) $data['is_active'],
        ]);

        return response()->json([
            'message' => 'Sorteo actualizado.',
            'draw' => $draw->fresh(),
        ]);
    }

    public function generateDay(Request $request)
    {
        if (! in_array($request->user()->role, ['admin', 'dueno'])) {
            abort(403, 'Solo el admin puede preparar sorteos.');
        }

        $data = $request->validate([
            'date' => ['required', 'date_format:Y-m-d'],
        ]);

        $date = Carbon::createFromFormat('Y-m-d', $data['date'])->startOfDay();
        $created = collect();
        $existing = collect();
        $withoutSchedule = collect();

        $loterias = Loteria::where('tenant_id', $request->user()->tenant_id)
            ->where('active', true)
            ->orderBy('name')
            ->get();

        foreach ($loterias as $loteria) {
            $baseDraw = Draw::where('tenant_id', $request->user()->tenant_id)
                ->where('loteria_id', $loteria->id)
                ->latest('draw_datetime')
                ->first();

            if (! $baseDraw) {
                $withoutSchedule->push($loteria->name);
                continue;
            }

            $drawDateTime = $date->copy()->setTimeFrom($baseDraw->draw_datetime);
            $draw = Draw::where('tenant_id', $request->user()->tenant_id)
                ->where('loteria_id', $loteria->id)
                ->where('draw_datetime', $drawDateTime)
                ->first();

            if ($draw) {
                $existing->push($draw);
                continue;
            }

            $created->push(Draw::create([
                'tenant_id' => $request->user()->tenant_id,
                'loteria_id' => $loteria->id,
                'name' => $loteria->name,
                'game_type' => $loteria->game_type,
                'draw_datetime' => $drawDateTime,
                'cutoff_minutes' => $baseDraw->cutoff_minutes,
                'status' => 'abierto',
                'is_active' => true,
            ]));
        }

        return response()->json([
            'message' => 'Sorteos del dia preparados.',
            'created_count' => $created->count(),
            'existing_count' => $existing->count(),
            'without_schedule' => $withoutSchedule->values(),
        ]);
    }

    public function setActive(Request $request, Draw $draw)
    {
        if (! in_array($request->user()->role, ['admin', 'dueno']) || $draw->tenant_id !== $request->user()->tenant_id) {
            abort(403);
        }

        $data = $request->validate([
            'is_active' => ['required', 'boolean'],
        ]);

        $draw->update(['is_active' => (bool) $data['is_active']]);

        return response()->json([
            'message' => $draw->is_active ? 'Sorteo activado.' : 'Sorteo desactivado.',
            'draw' => $draw,
        ]);
    }

    public function destroy(Request $request, Draw $draw)
    {
        if (! in_array($request->user()->role, ['admin', 'dueno']) || $draw->tenant_id !== $request->user()->tenant_id) {
            abort(403);
        }

        if ($draw->transactions()->exists()) {
            $draw->update(['is_active' => false]);

            return response()->json([
                'message' => 'El sorteo ya tiene movimientos. Se desactivo para proteger el historial.',
                'deleted' => false,
            ]);
        }

        $draw->delete();

        return response()->json([
            'message' => 'Sorteo eliminado.',
            'deleted' => true,
        ]);
    }

    public function close(Request $request, Draw $draw)
    {
        $this->authorize('closeDraw', $draw);

        $data = $request->validate([
            'winning_number' => ['required', 'string'],
            'winning_number_addon' => ['nullable', 'string'],
        ]);

        if ($draw->tenant_id !== $request->user()->tenant_id) {
            abort(403);
        }

        CloseDrawJob::dispatchSync($draw->id, $data['winning_number'], $data['winning_number_addon'] ?? null);

        return response()->json(['message' => 'Sorteo cerrado y premios calculados.']);
    }

    // Cuadricula 00-99 (o lista de numeros jugados) con lo vendido en tiempo real por numero.
    public function numbers(Request $request, Draw $draw)
    {
        if (! in_array($request->user()->role, ['admin', 'dueno']) || $draw->tenant_id !== $request->user()->tenant_id) {
            abort(403);
        }

        $rule = TenantRule::where('tenant_id', $draw->tenant_id)
            ->where('game_type', $draw->game_type)
            ->first();

        $vendido = Transaction::where('draw_id', $draw->id)
            ->where('type', 'venta')
            ->selectRaw('number_played, SUM(amount) as total, SUM(addon_amount) as addon_total, COUNT(*) as tickets')
            ->groupBy('number_played')
            ->get()
            ->keyBy('number_played');

        $limits = DrawNumberLimit::where('draw_id', $draw->id)
            ->get()
            ->keyBy('number_played');

        $ventasPorVendedor = Transaction::where('draw_id', $draw->id)
            ->where('type', 'venta')
            ->selectRaw('user_id, number_played, SUM(amount) as total, SUM(addon_amount) as addon_total, COUNT(*) as tickets')
            ->groupBy('user_id', 'number_played')
            ->get()
            ->groupBy('user_id');

        $maxPorNumero = $rule->max_bet_per_number ?? null;
        $digitos = $rule->digits_count ?? 2;

        // Cuadricula completa solo tiene sentido para 2 digitos (00-99).
        // Con 3+ digitos serian miles de combinaciones, ahi solo listamos lo que tiene ventas.
        if ($digitos <= 2) {
            $numeros = [];
            for ($i = 0; $i <= 99; $i++) {
                $num = str_pad($i, 2, '0', STR_PAD_LEFT);
                $fila = $vendido->get($num);
                $limit = $limits->get($num);
                $total = $fila->total ?? 0;
                $addonTotal = $fila->addon_total ?? 0;
                $effectiveMax = $limit?->max_amount ?? $maxPorNumero;

                $numeros[] = [
                    'numero' => $num,
                    'total' => (float) $total,
                    'addon_total' => (float) $addonTotal,
                    'grand_total' => (float) $total + (float) $addonTotal,
                    'tickets' => $fila->tickets ?? 0,
                    'limit_amount' => $limit?->max_amount !== null ? (float) $limit->max_amount : null,
                    'blocked' => (bool) ($limit?->blocked ?? false),
                    'available' => $effectiveMax !== null ? max((float) $effectiveMax - (float) $total, 0) : null,
                    'en_riesgo' => $limit?->blocked || ($effectiveMax && $total >= $effectiveMax),
                ];
            }
        } else {
            $numeros = $vendido->map(fn ($fila) => [
                'numero' => $fila->number_played,
                'total' => (float) $fila->total,
                'addon_total' => (float) $fila->addon_total,
                'grand_total' => (float) $fila->total + (float) $fila->addon_total,
                'tickets' => $fila->tickets,
                'limit_amount' => $limits->get($fila->number_played)?->max_amount !== null ? (float) $limits->get($fila->number_played)->max_amount : null,
                'blocked' => (bool) ($limits->get($fila->number_played)?->blocked ?? false),
                'available' => ($limits->get($fila->number_played)?->max_amount ?? $maxPorNumero) !== null
                    ? max((float) ($limits->get($fila->number_played)?->max_amount ?? $maxPorNumero) - (float) $fila->total, 0)
                    : null,
                'en_riesgo' => $limits->get($fila->number_played)?->blocked || (($limits->get($fila->number_played)?->max_amount ?? $maxPorNumero) && $fila->total >= ($limits->get($fila->number_played)?->max_amount ?? $maxPorNumero)),
            ])->values();
        }

        $vendedores = $draw->loteria
            ? $draw->loteria->vendedores()->orderBy('name')->get(['users.id', 'users.name', 'users.phone'])
            : collect();

        $sellerBreakdown = $vendedores->map(function ($vendedor) use ($ventasPorVendedor, $maxPorNumero, $digitos) {
            $ventas = $ventasPorVendedor->get($vendedor->id, collect())->keyBy('number_played');

            if ($digitos <= 2) {
                $numeros = [];
                for ($i = 0; $i <= 99; $i++) {
                    $num = str_pad($i, 2, '0', STR_PAD_LEFT);
                    $fila = $ventas->get($num);
                    $total = $fila->total ?? 0;
                    $addonTotal = $fila->addon_total ?? 0;

                    $numeros[] = [
                        'numero' => $num,
                        'total' => (float) $total,
                        'addon_total' => (float) $addonTotal,
                        'grand_total' => (float) $total + (float) $addonTotal,
                        'tickets' => $fila->tickets ?? 0,
                        'en_riesgo' => $maxPorNumero && $total >= $maxPorNumero,
                    ];
                }
            } else {
                $numeros = $ventas->map(fn ($fila) => [
                    'numero' => $fila->number_played,
                    'total' => (float) $fila->total,
                    'addon_total' => (float) $fila->addon_total,
                    'grand_total' => (float) $fila->total + (float) $fila->addon_total,
                    'tickets' => $fila->tickets,
                    'en_riesgo' => $maxPorNumero && $fila->total >= $maxPorNumero,
                ])->values();
            }

            return [
                'seller' => [
                    'id' => $vendedor->id,
                    'name' => $vendedor->name,
                    'phone' => $vendedor->phone,
                ],
                'sales_count' => (int) collect($numeros)->sum('tickets'),
                'main_total' => (float) collect($numeros)->sum('total'),
                'addon_total' => (float) collect($numeros)->sum('addon_total'),
                'grand_total' => (float) collect($numeros)->sum('grand_total'),
                'numbers_sold' => collect($numeros)->filter(fn ($numero) => $numero['grand_total'] > 0)->count(),
                'numeros' => $numeros,
            ];
        })->values();

        return response()->json([
            'draw' => ['id' => $draw->id, 'name' => $draw->name, 'loteria_id' => $draw->loteria_id],
            'max_por_numero' => $maxPorNumero,
            'numeros' => $numeros,
            'seller_breakdown' => $sellerBreakdown,
            'limits' => $limits->values()->map(fn (DrawNumberLimit $limit) => [
                'id' => $limit->id,
                'number_played' => $limit->number_played,
                'max_amount' => $limit->max_amount !== null ? (float) $limit->max_amount : null,
                'blocked' => $limit->blocked,
                'note' => $limit->note,
            ]),
        ]);
    }

    public function limits(Request $request, Draw $draw)
    {
        if (! in_array($request->user()->role, ['admin', 'dueno']) || $draw->tenant_id !== $request->user()->tenant_id) {
            abort(403);
        }

        return $draw->numberLimits()
            ->orderBy('number_played')
            ->get();
    }

    public function saveLimits(Request $request, Draw $draw)
    {
        if (! in_array($request->user()->role, ['admin', 'dueno']) || $draw->tenant_id !== $request->user()->tenant_id) {
            abort(403);
        }

        $data = $request->validate([
            'numbers' => ['required', 'array', 'min:1'],
            'numbers.*' => ['required', 'string', 'regex:/^\d{2}$/'],
            'max_amount' => ['nullable', 'numeric', 'min:0'],
            'blocked' => ['sometimes', 'boolean'],
            'note' => ['nullable', 'string', 'max:255'],
        ]);

        foreach (array_unique($data['numbers']) as $number) {
            DrawNumberLimit::updateOrCreate(
                ['draw_id' => $draw->id, 'number_played' => $number],
                [
                    'tenant_id' => $request->user()->tenant_id,
                    'max_amount' => $data['max_amount'] ?? null,
                    'blocked' => (bool) ($data['blocked'] ?? false),
                    'note' => $data['note'] ?? null,
                ]
            );
        }

        return response()->json([
            'message' => 'Limites de numeros actualizados.',
        ]);
    }

    public function deleteLimit(Request $request, Draw $draw, string $number)
    {
        if (! in_array($request->user()->role, ['admin', 'dueno']) || $draw->tenant_id !== $request->user()->tenant_id) {
            abort(403);
        }

        $draw->numberLimits()->where('number_played', $number)->delete();

        return response()->json([
            'message' => 'Limite eliminado.',
        ]);
    }
}
