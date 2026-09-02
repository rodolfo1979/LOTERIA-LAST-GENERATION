<?php

namespace App\Http\Controllers;

use App\Models\Loteria;
use App\Models\TenantRule;
use Illuminate\Http\Request;

class LoteriaController extends Controller
{
    public function index(Request $request)
    {
        return Loteria::where('tenant_id', $request->user()->tenant_id)
            ->withCount('vendedores')
            ->get();
    }

    public function store(Request $request)
    {
        if (! in_array($request->user()->role, ['admin', 'dueno'])) {
            abort(403, 'Solo el admin puede crear loterias.');
        }

        $data = $request->validate([
            'name' => ['required', 'string', 'max:100'],
            'game_type' => ['required', 'string'],
        ]);

        $tieneReglas = TenantRule::where('tenant_id', $request->user()->tenant_id)
            ->where('game_type', $data['game_type'])
            ->exists();

        if (! $tieneReglas) {
            return response()->json([
                'message' => "No hay reglas configuradas para '{$data['game_type']}'. Crea las reglas primero.",
            ], 422);
        }

        $loteria = Loteria::create([
            'tenant_id' => $request->user()->tenant_id,
            'name' => $data['name'],
            'game_type' => $data['game_type'],
        ]);

        return response()->json($loteria, 201);
    }
}
