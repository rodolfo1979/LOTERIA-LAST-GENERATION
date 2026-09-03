<?php

namespace App\Http\Controllers;

use App\Models\Client;
use App\Models\ClientMovement;
use Illuminate\Http\Request;

class ClientController extends Controller
{
    public function index(Request $request)
    {
        return Client::where('tenant_id', $request->user()->tenant_id)
            ->where('active', true)
            ->orderBy('name')
            ->get()
            ->map(fn (Client $client) => [
                'id' => $client->id,
                'name' => $client->name,
                'phone' => $client->phone,
                'balance' => $client->balance(),
            ]);
    }

    public function store(Request $request)
    {
        if (! in_array($request->user()->role, ['admin', 'dueno'])) {
            abort(403);
        }

        $data = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'phone' => ['nullable', 'string', 'max:30'],
            'initial_balance' => ['nullable', 'numeric', 'min:0'],
        ]);

        $client = Client::create([
            'tenant_id' => $request->user()->tenant_id,
            'name' => $data['name'],
            'phone' => $data['phone'] ?? null,
        ]);

        if ((float) ($data['initial_balance'] ?? 0) > 0) {
            ClientMovement::create([
                'tenant_id' => $request->user()->tenant_id,
                'client_id' => $client->id,
                'user_id' => $request->user()->id,
                'type' => 'recarga',
                'amount' => $data['initial_balance'],
                'note' => 'Saldo inicial',
            ]);
        }

        return response()->json([
            'id' => $client->id,
            'name' => $client->name,
            'phone' => $client->phone,
            'balance' => $client->balance(),
        ], 201);
    }

    public function recharge(Request $request, Client $client)
    {
        if (! in_array($request->user()->role, ['admin', 'dueno']) || $client->tenant_id !== $request->user()->tenant_id) {
            abort(403);
        }

        $data = $request->validate([
            'amount' => ['required', 'numeric', 'min:1'],
            'note' => ['nullable', 'string', 'max:255'],
        ]);

        ClientMovement::create([
            'tenant_id' => $request->user()->tenant_id,
            'client_id' => $client->id,
            'user_id' => $request->user()->id,
            'type' => 'recarga',
            'amount' => $data['amount'],
            'note' => $data['note'] ?? 'Recarga de saldo',
        ]);

        return response()->json([
            'message' => 'Recarga registrada.',
            'balance' => $client->balance(),
        ]);
    }

    public function movements(Request $request, Client $client)
    {
        if ($client->tenant_id !== $request->user()->tenant_id) {
            abort(403);
        }

        return $client->movements()
            ->with(['user:id,name', 'transaction:id,draw_id,number_played,amount,addon_amount,prepaid_applied,metadata', 'transaction.draw:id,name'])
            ->orderByDesc('id')
            ->limit(50)
            ->get()
            ->map(fn (ClientMovement $movement) => [
                'id' => $movement->id,
                'type' => $movement->type,
                'amount' => (float) $movement->amount,
                'note' => $movement->note,
                'created_at' => $movement->created_at,
                'user_name' => $movement->user?->name,
                'number_played' => $movement->transaction?->number_played,
                'draw_name' => $movement->transaction?->draw?->name,
                'sale_total' => $movement->transaction
                    ? (float) $movement->transaction->amount + (float) $movement->transaction->addon_amount
                    : null,
                'prepaid_applied' => (bool) ($movement->transaction?->prepaid_applied ?? false),
            ]);
    }

    public function destroy(Request $request, Client $client)
    {
        if (! in_array($request->user()->role, ['admin', 'dueno']) || $client->tenant_id !== $request->user()->tenant_id) {
            abort(403);
        }

        $client->update(['active' => false]);

        return response()->json([
            'message' => 'Cliente eliminado de la lista activa. Su historial queda guardado.',
        ]);
    }
}
