<?php

namespace App\Http\Controllers\SuperAdmin;

use App\Http\Controllers\Controller;
use App\Models\Plan;
use Illuminate\Http\Request;

class PlanController extends Controller
{
    public function index(Request $request)
    {
        $this->assertSuperAdmin($request);

        return Plan::withCount('tenants')->get();
    }

    public function store(Request $request)
    {
        $this->assertSuperAdmin($request);

        $data = $request->validate([
            'name' => ['required', 'string', 'max:100'],
            'price_monthly' => ['required', 'numeric', 'min:0'],
            'max_vendedores' => ['nullable', 'integer', 'min:1'],
            'max_loterias' => ['nullable', 'integer', 'min:1'],
        ]);

        $plan = Plan::create($data);

        return response()->json($plan, 201);
    }

    public function update(Request $request, Plan $plan)
    {
        $this->assertSuperAdmin($request);

        $data = $request->validate([
            'name' => ['required', 'string', 'max:100'],
            'price_monthly' => ['required', 'numeric', 'min:0'],
            'max_vendedores' => ['nullable', 'integer', 'min:1'],
            'max_loterias' => ['nullable', 'integer', 'min:1'],
        ]);

        $plan->update($data);

        return response()->json($plan->loadCount('tenants'));
    }

    public function setActive(Request $request, Plan $plan)
    {
        $this->assertSuperAdmin($request);

        $data = $request->validate([
            'active' => ['required', 'boolean'],
        ]);

        $plan->update(['active' => $data['active']]);

        return response()->json($plan->loadCount('tenants'));
    }

    protected function assertSuperAdmin(Request $request): void
    {
        if ($request->user()->role !== 'superadmin') {
            abort(403, 'Solo el superadmin puede gestionar planes.');
        }
    }
}
