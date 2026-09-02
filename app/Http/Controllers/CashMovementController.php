<?php

namespace App\Http\Controllers;

use App\Models\Transaction;
use App\Models\User;
use Illuminate\Http\Request;

class CashMovementController extends Controller
{
    // Registra que dinero cambio de manos fuera del sistema (efectivo, Sinpe, etc.)
    // Solo deja constancia del movimiento -- el sistema nunca mueve plata de verdad.
    public function store(Request $request)
    {
        $data = $request->validate([
            'user_id' => ['required', 'exists:users,id'],
            'amount' => ['required', 'numeric', 'min:1'],
            'direction' => ['required', 'in:admin_a_vendedor,vendedor_a_admin'],
            'note' => ['nullable', 'string', 'max:255'],
        ]);

        $vendedor = User::findOrFail($data['user_id']);
        $admin = $request->user();

        if ($vendedor->tenant_id !== $admin->tenant_id || ! in_array($admin->role, ['admin', 'dueno'])) {
            abort(403);
        }

        // admin_a_vendedor: sube el saldo del vendedor (la central le cubre el faltante).
        // vendedor_a_admin: baja el saldo del vendedor (entrego el sobrante que tenia).
        $amount = $data['direction'] === 'admin_a_vendedor' ? $data['amount'] : -1 * $data['amount'];

        $movimiento = Transaction::create([
            'tenant_id' => $admin->tenant_id,
            'user_id' => $vendedor->id,
            'type' => 'ajuste',
            'amount' => $amount,
            'metadata' => [
                'direction' => $data['direction'],
                'note' => $data['note'] ?? null,
                'registrado_por' => $admin->id,
            ],
        ]);

        return response()->json([
            'movimiento' => $movimiento,
            'nuevo_saldo' => $vendedor->balance(),
        ], 201);
    }
}
