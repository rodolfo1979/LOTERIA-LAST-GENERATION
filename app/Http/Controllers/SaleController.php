<?php

namespace App\Http\Controllers;

use App\Models\Draw;
use App\Models\TenantRule;
use App\Models\Transaction;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class SaleController extends Controller
{
    public function store(Request $request)
    {
        $data = $request->validate([
            'draw_id' => ['required', 'exists:draws,id'],
            'number_played' => ['required', 'string'],
            'amount' => ['required', 'numeric', 'min:1'],
            'with_addon' => ['sometimes', 'boolean'],
            'addon_amount' => ['nullable', 'numeric', 'min:0'],
        ]);
        $data['with_addon'] = (bool) ($data['with_addon'] ?? false);
        $data['addon_amount'] = $data['with_addon'] ? (float) ($data['addon_amount'] ?? 0) : 0;

        if ($data['with_addon'] && $data['addon_amount'] <= 0) {
            return response()->json([
                'message' => 'Indica el monto del Reventado.',
            ], 422);
        }

        $draw = Draw::findOrFail($data['draw_id']);

        // La validacion real vive aqui, nunca solo en el cliente.
        if (! $draw->isOpenForSales()) {
            return response()->json([
                'message' => 'Este sorteo ya cerro para ventas.',
            ], 422);
        }

        $tieneAsignada = $draw->loteria_id === null
            || $request->user()->loterias()->where('loterias.id', $draw->loteria_id)->exists();

        if (! $tieneAsignada) {
            return response()->json([
                'message' => 'No tenes esta loteria asignada.',
            ], 403);
        }

        $rule = TenantRule::where('tenant_id', $draw->tenant_id)
            ->where('game_type', $draw->game_type)
            ->first();

        // Bloqueo automatico: si este numero ya llego al tope, se rechaza sin
        // que nadie tenga que estar viendo la pantalla para cerrarlo a mano.
        // Se envuelve en una transaccion con lock para evitar que dos ventas
        // simultaneas se cuelen justo en el limite (condicion de carrera).
        if ($rule && $rule->max_bet_per_number) {
            $transaction = DB::transaction(function () use ($request, $draw, $rule, $data) {
                $vendidoActual = Transaction::where('draw_id', $draw->id)
                    ->where('number_played', $data['number_played'])
                    ->where('type', 'venta')
                    ->lockForUpdate()
                    ->sum('amount');

                $disponible = $rule->max_bet_per_number - $vendidoActual;

                if ($data['amount'] > $disponible) {
                    return ['error' => true, 'disponible' => max($disponible, 0)];
                }

                return ['error' => false, 'transaction' => Transaction::create([
                    'tenant_id' => $request->user()->tenant_id,
                    'user_id' => $request->user()->id,
                    'draw_id' => $draw->id,
                    'type' => 'venta',
                    'amount' => $data['amount'],
                    'number_played' => $data['number_played'],
                    'with_addon' => $data['with_addon'],
                    'addon_amount' => $data['addon_amount'],
                ])];
            });

            if ($transaction['error']) {
                return response()->json([
                    'message' => $transaction['disponible'] > 0
                        ? "Ese numero ya casi llega al limite. Cupo disponible: ₡{$transaction['disponible']}."
                        : 'Ese numero ya llego al limite de ventas. Elegi otro numero.',
                    'disponible' => $transaction['disponible'],
                ], 422);
            }

            return response()->json($transaction['transaction'], 201);
        }

        // Sin limite configurado para este juego -- se vende sin restriccion.
        $transaction = Transaction::create([
            'tenant_id' => $request->user()->tenant_id,
            'user_id' => $request->user()->id,
            'draw_id' => $draw->id,
            'type' => 'venta',
            'amount' => $data['amount'],
            'number_played' => $data['number_played'],
            'with_addon' => $data['with_addon'],
            'addon_amount' => $data['addon_amount'],
        ]);

        return response()->json($transaction, 201);
    }
}
