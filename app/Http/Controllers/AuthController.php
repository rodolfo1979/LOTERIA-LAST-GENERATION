<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    // El vendedor entra con su telefono + PIN de 4 digitos, nada mas.
    public function login(Request $request)
    {
        $data = $request->validate([
            'phone' => ['required', 'string'],
            'pin' => ['required', 'string'],
        ]);

        $phone = str($data['phone'])->lower()->replaceMatches('/[\s-]+/', '')->toString();
        $demoAliases = [
            'numerazo-admin' => '88880000',
            'numerazoadmin' => '88880000',
            'numerazo-superadmin' => '80000000',
            'numerazosuperadmin' => '80000000',
        ];

        $user = User::where('phone', $demoAliases[$phone] ?? $phone)->first();

        if (! $user || ! Hash::check($data['pin'], $user->pin_hash)) {
            throw ValidationException::withMessages([
                'phone' => ['Telefono o PIN incorrecto.'],
            ]);
        }

        if (! $user->active) {
            throw ValidationException::withMessages([
                'phone' => ['Este usuario esta desactivado. Consulta con el administrador.'],
            ]);
        }

        $token = $user->createToken('vendedor-app')->plainTextToken;

        return response()->json([
            'token' => $token,
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'role' => $user->role,
                'tenant_id' => $user->tenant_id,
                'tenant_name' => $user->tenant?->name,
            ],
        ]);
    }

    public function logout(Request $request)
    {
        $request->user()->currentAccessToken()->delete();

        return response()->json(['message' => 'Sesion cerrada.']);
    }
}
