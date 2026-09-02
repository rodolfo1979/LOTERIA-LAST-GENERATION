<?php

namespace App\Http\Controllers;

use App\Models\Loteria;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;

class UserController extends Controller
{
    public function index(Request $request)
    {
        if (! in_array($request->user()->role, ['admin', 'dueno'])) {
            abort(403);
        }

        return User::where('tenant_id', $request->user()->tenant_id)
            ->where('role', 'vendedor')
            ->with('loterias:id,name')
            ->get()
            ->map(fn ($v) => [
                'id' => $v->id,
                'name' => $v->name,
                'phone' => $v->phone,
                'balance' => $v->balance(),
                'loterias' => $v->loterias->pluck('name'),
            ]);
    }

    // Crea un vendedor y le asigna, de una vez, las loterias marcadas por checkbox.
    public function store(Request $request)
    {
        if (! in_array($request->user()->role, ['admin', 'dueno'])) {
            abort(403, 'Solo el admin puede crear vendedores.');
        }

        $tenant = $request->user()->tenant;

        if (! $tenant->puedeAgregarVendedor()) {
            return response()->json([
                'message' => "Tu paquete permite hasta {$tenant->plan->max_vendedores} vendedores. Actualiza tu plan para agregar mas.",
            ], 422);
        }

        $data = $request->validate([
            'name' => ['required', 'string', 'max:100'],
            'phone' => ['required', 'string', 'unique:users,phone'],
            'pin' => ['required', 'string', 'size:4'],
            'loteria_ids' => ['sometimes', 'array'],
            'loteria_ids.*' => ['integer', 'exists:loterias,id'],
        ]);

        $vendedor = User::create([
            'tenant_id' => $request->user()->tenant_id,
            'name' => $data['name'],
            'phone' => $data['phone'],
            'role' => 'vendedor',
            'pin_hash' => Hash::make($data['pin']),
        ]);

        // Solo se permite asignar loterias del mismo tenant, nunca de otro.
        $loteriaIds = Loteria::whereIn('id', $data['loteria_ids'] ?? [])
            ->where('tenant_id', $request->user()->tenant_id)
            ->pluck('id');

        $vendedor->loterias()->sync($loteriaIds);

        return response()->json($vendedor->load('loterias:id,name'), 201);
    }

    // Cambia que loterias tiene asignadas un vendedor ya existente.
    public function updateLoterias(Request $request, User $user)
    {
        if (! in_array($request->user()->role, ['admin', 'dueno']) || $user->tenant_id !== $request->user()->tenant_id) {
            abort(403);
        }

        $data = $request->validate([
            'loteria_ids' => ['required', 'array'],
            'loteria_ids.*' => ['integer', 'exists:loterias,id'],
        ]);

        $loteriaIds = Loteria::whereIn('id', $data['loteria_ids'])
            ->where('tenant_id', $request->user()->tenant_id)
            ->pluck('id');

        $user->loterias()->sync($loteriaIds);

        return response()->json($user->load('loterias:id,name'));
    }
}
