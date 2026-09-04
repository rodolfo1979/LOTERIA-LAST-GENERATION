<?php

namespace App\Http\Controllers;

use App\Models\TenantRule;
use App\Services\DefaultTenantRules;
use Illuminate\Http\Request;

class TenantRuleController extends Controller
{
    public function index(Request $request)
    {
        $this->assertIsAdmin($request);

        app(DefaultTenantRules::class)->ensure($request->user()->tenant_id);

        return TenantRule::where('tenant_id', $request->user()->tenant_id)->get();
    }

    public function update(Request $request, TenantRule $tenantRule)
    {
        $this->assertIsAdmin($request);

        if ($tenantRule->tenant_id !== $request->user()->tenant_id) {
            abort(403);
        }

        $data = $request->validate([
            'commission_pct' => ['sometimes', 'numeric', 'min:0', 'max:100'],
            'max_bet_per_number' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'prize_multiplier' => ['sometimes', 'numeric', 'min:0'],
            'addon_multiplier' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'partial_match_rules' => ['sometimes', 'nullable', 'array'],
        ]);

        $tenantRule->update($data);

        return response()->json($tenantRule);
    }

    protected function assertIsAdmin(Request $request): void
    {
        if (! in_array($request->user()->role, ['admin', 'dueno'])) {
            abort(403, 'Solo el admin puede modificar las reglas del juego.');
        }
    }
}
