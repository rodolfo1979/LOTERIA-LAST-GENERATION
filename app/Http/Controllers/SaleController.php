<?php

namespace App\Http\Controllers;

use App\Models\Draw;
use App\Models\DrawNumberLimit;
use App\Models\Client;
use App\Models\ClientMovement;
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
            'client_id' => ['nullable', 'integer', 'exists:clients,id'],
            'payment_mode' => ['nullable', 'in:cash,prepaid'],
            'allow_cash_fallback' => ['sometimes', 'boolean'],
        ]);
        $data['with_addon'] = (bool) ($data['with_addon'] ?? false);
        $data['addon_amount'] = $data['with_addon'] ? (float) ($data['addon_amount'] ?? 0) : 0;
        $data['payment_mode'] = $data['payment_mode'] ?? 'cash';
        $data['allow_cash_fallback'] = (bool) ($data['allow_cash_fallback'] ?? false);
        $totalVenta = (float) $data['amount'] + (float) $data['addon_amount'];

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

        $client = null;
        if (! empty($data['client_id'])) {
            $client = Client::where('tenant_id', $request->user()->tenant_id)
                ->where('active', true)
                ->findOrFail($data['client_id']);

            if ($data['payment_mode'] === 'prepaid' && $client->balance() < $totalVenta) {
                return response()->json([
                    'message' => 'El cliente no tiene saldo suficiente.',
                    'client_balance' => $client->balance(),
                    'required' => $totalVenta,
                    'can_sell_as_cash' => true,
                ], 422);
            }
        }

        $rule = TenantRule::where('tenant_id', $draw->tenant_id)
            ->where('game_type', $draw->game_type)
            ->first();
        $numberLimit = DrawNumberLimit::where('draw_id', $draw->id)
            ->where('number_played', $data['number_played'])
            ->first();

        // Bloqueo automatico: si este numero ya llego al tope, se rechaza sin
        // que nadie tenga que estar viendo la pantalla para cerrarlo a mano.
        // Se envuelve en una transaccion con lock para evitar que dos ventas
        // simultaneas se cuelen justo en el limite (condicion de carrera).
        if (($rule && $rule->max_bet_per_number) || $numberLimit) {
            $transaction = DB::transaction(function () use ($request, $draw, $rule, $numberLimit, $data, $client, $totalVenta) {
                if ($numberLimit?->blocked) {
                    return ['error' => true, 'blocked' => true, 'disponible' => 0];
                }

                $vendidoActual = Transaction::where('draw_id', $draw->id)
                    ->where('number_played', $data['number_played'])
                    ->where('type', 'venta')
                    ->lockForUpdate()
                    ->sum('amount');

                $maximos = collect([$rule?->max_bet_per_number, $numberLimit?->max_amount])
                    ->filter(fn ($value) => $value !== null && (float) $value > 0)
                    ->map(fn ($value) => (float) $value);
                $maximoAplicado = $maximos->isNotEmpty() ? $maximos->min() : null;
                $disponible = $maximoAplicado !== null ? $maximoAplicado - $vendidoActual : null;

                if ($disponible !== null && $data['amount'] > $disponible) {
                    return ['error' => true, 'disponible' => max($disponible, 0)];
                }

                $sale = Transaction::create([
                    'tenant_id' => $request->user()->tenant_id,
                    'user_id' => $request->user()->id,
                    'client_id' => $client?->id,
                    'prepaid_applied' => $client && $data['payment_mode'] === 'prepaid',
                    'draw_id' => $draw->id,
                    'type' => 'venta',
                    'amount' => $data['amount'],
                    'number_played' => $data['number_played'],
                    'with_addon' => $data['with_addon'],
                    'addon_amount' => $data['addon_amount'],
                    'metadata' => [
                        'payment_mode' => $client && $data['payment_mode'] === 'prepaid' ? 'prepaid' : 'cash',
                        'cash_fallback' => $client && $data['payment_mode'] === 'cash' && $data['allow_cash_fallback'],
                    ],
                ]);

                if ($client && $data['payment_mode'] === 'prepaid') {
                    ClientMovement::create([
                        'tenant_id' => $request->user()->tenant_id,
                        'client_id' => $client->id,
                        'user_id' => $request->user()->id,
                        'transaction_id' => $sale->id,
                        'type' => 'compra',
                        'amount' => -1 * $totalVenta,
                        'note' => "Compra {$draw->name} numero {$data['number_played']}",
                    ]);
                }

                $this->crearComisionDeVenta($sale, $draw, $rule);

                return ['error' => false, 'transaction' => $sale->load('client:id,name,phone')];
            });

            if ($transaction['error']) {
                return response()->json([
                    'message' => ($transaction['blocked'] ?? false)
                        ? 'Ese numero esta bloqueado para este sorteo.'
                        : ($transaction['disponible'] > 0
                        ? "Ese numero ya casi llega al limite. Cupo disponible: ₡{$transaction['disponible']}."
                        : 'Ese numero ya llego al limite de ventas. Elegi otro numero.'),
                    'disponible' => $transaction['disponible'],
                ], 422);
            }

            return response()->json($transaction['transaction'], 201);
        }

        // Sin limite configurado para este juego -- se vende sin restriccion.
        $transaction = DB::transaction(function () use ($request, $draw, $data, $client, $totalVenta) {
            $sale = Transaction::create([
                'tenant_id' => $request->user()->tenant_id,
                'user_id' => $request->user()->id,
                'client_id' => $client?->id,
                'prepaid_applied' => $client && $data['payment_mode'] === 'prepaid',
                'draw_id' => $draw->id,
                'type' => 'venta',
                'amount' => $data['amount'],
                'number_played' => $data['number_played'],
                'with_addon' => $data['with_addon'],
                'addon_amount' => $data['addon_amount'],
                'metadata' => [
                    'payment_mode' => $client && $data['payment_mode'] === 'prepaid' ? 'prepaid' : 'cash',
                    'cash_fallback' => $client && $data['payment_mode'] === 'cash' && $data['allow_cash_fallback'],
                ],
            ]);

            if ($client && $data['payment_mode'] === 'prepaid') {
                ClientMovement::create([
                    'tenant_id' => $request->user()->tenant_id,
                    'client_id' => $client->id,
                    'user_id' => $request->user()->id,
                    'transaction_id' => $sale->id,
                    'type' => 'compra',
                    'amount' => -1 * $totalVenta,
                    'note' => "Compra {$draw->name} numero {$data['number_played']}",
                ]);
            }

            $this->crearComisionDeVenta($sale, $draw, $rule);

            return $sale->load('client:id,name,phone');
        });

        return response()->json($transaction, 201);
    }

    protected function crearComisionDeVenta(Transaction $sale, Draw $draw, ?TenantRule $rule): void
    {
        if (! $rule || $rule->commission_pct <= 0) {
            return;
        }

        $montoComision = ((float) $sale->amount + (float) $sale->addon_amount) * ((float) $rule->commission_pct / 100);

        if ($montoComision <= 0) {
            return;
        }

        Transaction::create([
            'tenant_id' => $draw->tenant_id,
            'user_id' => $sale->user_id,
            'draw_id' => $draw->id,
            'type' => 'comision',
            'amount' => $montoComision,
            'metadata' => [
                'sale_transaction_id' => $sale->id,
                'commission_pct' => (float) $rule->commission_pct,
            ],
        ]);
    }
}
