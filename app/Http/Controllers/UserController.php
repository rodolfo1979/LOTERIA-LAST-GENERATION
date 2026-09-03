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
                'active' => (bool) $v->active,
                'balance' => $v->balance(),
                'loterias' => $v->loterias->map(fn ($loteria) => [
                    'id' => $loteria->id,
                    'name' => $loteria->name,
                ])->values(),
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
        ], [
            'name.required' => 'Falta el nombre del vendedor.',
            'name.max' => 'El nombre del vendedor no puede tener mas de 100 caracteres.',
            'phone.required' => 'Falta el telefono del vendedor.',
            'phone.unique' => 'Ese telefono ya esta registrado. Usa otro numero o revisa si el vendedor ya existe.',
            'pin.required' => 'Falta el PIN del vendedor.',
            'pin.size' => 'El PIN debe tener 4 digitos.',
            'loteria_ids.array' => 'La seleccion de loterias no es valida.',
            'loteria_ids.*.integer' => 'Una de las loterias seleccionadas no es valida.',
            'loteria_ids.*.exists' => 'Una de las loterias seleccionadas no existe.',
        ]);

        $vendedor = User::create([
            'tenant_id' => $request->user()->tenant_id,
            'name' => $data['name'],
            'phone' => $data['phone'],
            'role' => 'vendedor',
            'active' => true,
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

    public function resetPin(Request $request, User $user)
    {
        if (! in_array($request->user()->role, ['admin', 'dueno'])
            || $user->tenant_id !== $request->user()->tenant_id
            || $user->role !== 'vendedor') {
            abort(403, 'Solo el admin puede resetear PIN de vendedores de su negocio.');
        }

        $data = $request->validate([
            'pin' => ['required', 'string', 'regex:/^\d{4}$/'],
        ], [
            'pin.required' => 'Falta el nuevo PIN.',
            'pin.regex' => 'El PIN debe tener exactamente 4 digitos.',
        ]);

        $user->forceFill([
            'pin_hash' => Hash::make($data['pin']),
        ])->save();

        $user->tokens()->delete();

        return response()->json([
            'message' => "PIN actualizado para {$user->name}.",
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'phone' => $user->phone,
            ],
        ]);
    }

    public function setActive(Request $request, User $user)
    {
        if (! in_array($request->user()->role, ['admin', 'dueno'])
            || $user->tenant_id !== $request->user()->tenant_id
            || $user->role !== 'vendedor') {
            abort(403, 'Solo el admin puede activar o desactivar vendedores de su negocio.');
        }

        $data = $request->validate([
            'active' => ['required', 'boolean'],
        ]);

        $user->update(['active' => (bool) $data['active']]);

        if (! $user->active) {
            $user->tokens()->delete();
        }

        return response()->json([
            'message' => $user->active ? 'Vendedor activado.' : 'Vendedor desactivado.',
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'phone' => $user->phone,
                'active' => (bool) $user->active,
            ],
        ]);
    }

    public function destroy(Request $request, User $user)
    {
        $request->merge(['active' => false]);

        return $this->setActive($request, $user);
    }
}
