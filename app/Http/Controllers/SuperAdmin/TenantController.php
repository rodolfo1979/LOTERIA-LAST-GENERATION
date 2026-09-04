<?php

namespace App\Http\Controllers\SuperAdmin;

use App\Http\Controllers\Controller;
use App\Models\Plan;
use App\Models\Tenant;
use App\Models\User;
use App\Services\DefaultTenantRules;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;

class TenantController extends Controller
{
    public function index(Request $request)
    {
        $this->assertSuperAdmin($request);

        return Tenant::with('plan:id,name,max_vendedores,price_monthly')
            ->with(['users' => fn ($q) => $q->whereIn('role', ['admin', 'dueno'])->select('id', 'tenant_id', 'name', 'phone', 'role', 'active')])
            ->withCount(['users as vendedores_count' => fn ($q) => $q->where('role', 'vendedor')])
            ->get();
    }

    // Crea el tenant y, de una vez, su primer usuario admin para que pueda entrar.
    public function store(Request $request)
    {
        $this->assertSuperAdmin($request);

        $data = $request->validate([
            'name' => ['required', 'string', 'max:150'],
            'plan_id' => ['required', Rule::exists('plans', 'id')->where('active', true)],
            'subscription_ends_at' => ['nullable', 'date'],
            'admin_name' => ['required', 'string', 'max:100'],
            'admin_phone' => ['required', 'string', 'unique:users,phone'],
            'admin_pin' => ['required', 'string', 'size:4'],
        ]);

        $tenant = Tenant::create([
            'name' => $data['name'],
            'plan_id' => $data['plan_id'],
            'status' => 'activo',
            'subscription_ends_at' => $data['subscription_ends_at'] ?? null,
        ]);

        $admin = User::create([
            'tenant_id' => $tenant->id,
            'name' => $data['admin_name'],
            'phone' => $data['admin_phone'],
            'role' => 'admin',
            'pin_hash' => Hash::make($data['admin_pin']),
        ]);

        app(DefaultTenantRules::class)->ensure($tenant->id);

        return response()->json([
            'tenant' => $tenant->load('plan'),
            'admin' => ['name' => $admin->name, 'phone' => $admin->phone],
        ], 201);
    }

    // Cambiar de plan o suspender/reactivar un tenant.
    public function update(Request $request, Tenant $tenant)
    {
        $this->assertSuperAdmin($request);

        $data = $request->validate([
            'plan_id' => ['sometimes', Rule::exists('plans', 'id')->where('active', true)],
            'status' => ['sometimes', 'in:activo,suspendido,prueba'],
            'subscription_ends_at' => ['sometimes', 'nullable', 'date'],
        ]);

        $tenant->update($data);

        return response()->json($tenant->load('plan'));
    }

    public function resetAdminPin(Request $request, Tenant $tenant)
    {
        $this->assertSuperAdmin($request);

        $data = $request->validate([
            'user_id' => ['required', 'integer', 'exists:users,id'],
            'pin' => ['required', 'string', 'regex:/^\d{4}$/'],
        ], [
            'user_id.required' => 'Selecciona el administrador del tenant.',
            'pin.required' => 'Falta el nuevo PIN.',
            'pin.regex' => 'El PIN debe tener exactamente 4 digitos.',
        ]);

        $admin = User::where('tenant_id', $tenant->id)
            ->whereIn('role', ['admin', 'dueno'])
            ->findOrFail($data['user_id']);

        $admin->forceFill([
            'pin_hash' => Hash::make($data['pin']),
        ])->save();

        $admin->tokens()->delete();

        return response()->json([
            'message' => "PIN actualizado para {$admin->name}.",
            'admin' => [
                'id' => $admin->id,
                'name' => $admin->name,
                'phone' => $admin->phone,
                'role' => $admin->role,
            ],
        ]);
    }

    protected function assertSuperAdmin(Request $request): void
    {
        if ($request->user()->role !== 'superadmin') {
            abort(403, 'Solo el superadmin puede gestionar tenants.');
        }
    }
}
