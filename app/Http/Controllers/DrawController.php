<?php

namespace App\Http\Controllers;

use App\Jobs\CloseDrawJob;
use App\Models\Draw;
use App\Models\Loteria;
use App\Models\TenantRule;
use App\Models\Transaction;
use Illuminate\Http\Request;

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
                'is_open_for_sales' => $draw->isOpenForSales(),
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
        ]);

        return response()->json($draw, 201);
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
            $numeros = $vendido->map(fn ($fila) => [
                'numero' => $fila->number_played,
                'total' => (float) $fila->total,
                'addon_total' => (float) $fila->addon_total,
                'grand_total' => (float) $fila->total + (float) $fila->addon_total,
                'tickets' => $fila->tickets,
                'en_riesgo' => $maxPorNumero && $fila->total >= $maxPorNumero,
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
        ]);
    }
}
