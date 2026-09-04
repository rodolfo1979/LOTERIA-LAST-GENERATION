<?php

namespace App\Services;

use App\Models\TenantRule;

class DefaultTenantRules
{
    public function ensure(int $tenantId): void
    {
        foreach ($this->rules() as $rule) {
            TenantRule::firstOrCreate(
                [
                    'tenant_id' => $tenantId,
                    'game_type' => $rule['game_type'],
                ],
                $rule,
            );
        }
    }

    public function rules(): array
    {
        return [
            [
                'game_type' => 'tiempos',
                'digits_count' => 2,
                'commission_pct' => 10,
                'max_bet_per_number' => 5000,
                'prize_multiplier' => 90,
                'addon_multiplier' => 200,
                'partial_match_rules' => null,
            ],
            [
                'game_type' => '3monazos',
                'digits_count' => 3,
                'commission_pct' => 10,
                'max_bet_per_number' => 5000,
                'prize_multiplier' => 1000,
                'addon_multiplier' => null,
                'partial_match_rules' => ['3' => 1000, '2' => 80, '1' => 8],
            ],
        ];
    }
}
