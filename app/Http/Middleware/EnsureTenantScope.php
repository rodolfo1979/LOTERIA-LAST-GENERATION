<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureTenantScope
{
    // Se aplica despues de auth:sanctum. Bloquea cualquier intento de
    // pasar un tenant_id distinto al del usuario autenticado en el body.
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if ($request->has('tenant_id') && (int) $request->input('tenant_id') !== $user->tenant_id) {
            return response()->json(['message' => 'No autorizado para ese tenant.'], 403);
        }

        // Fuerza el tenant_id correcto en cualquier request, para que
        // los controladores nunca confien en un valor que venga del cliente.
        $request->merge(['tenant_id' => $user->tenant_id]);

        return $next($request);
    }
}
