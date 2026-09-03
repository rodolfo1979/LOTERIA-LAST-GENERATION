<?php

namespace App\Services;

use App\Models\Draw;
use App\Models\Loteria;
use Illuminate\Support\Carbon;

class DailyDrawService
{
    public function ensureForTenant(int $tenantId, ?Carbon $date = null): array
    {
        $day = ($date ?: now())->copy()->startOfDay();
        $created = collect();
        $existing = collect();
        $withoutSchedule = collect();

        $loterias = Loteria::where('tenant_id', $tenantId)
            ->where('active', true)
            ->orderBy('name')
            ->get();

        foreach ($loterias as $loteria) {
            $scheduleDraws = Draw::where('tenant_id', $tenantId)
                ->where('loteria_id', $loteria->id)
                ->orderByDesc('draw_datetime')
                ->get()
                ->unique(fn (Draw $draw) => $draw->draw_datetime->format('H:i'));

            if ($scheduleDraws->isEmpty()) {
                $withoutSchedule->push($loteria->name);
                continue;
            }

            foreach ($scheduleDraws as $baseDraw) {
                $drawDateTime = $day->copy()->setTimeFrom($baseDraw->draw_datetime);
                $draw = Draw::where('tenant_id', $tenantId)
                    ->where('loteria_id', $loteria->id)
                    ->where('draw_datetime', $drawDateTime)
                    ->first();

                if ($draw) {
                    $existing->push($draw);
                    continue;
                }

                $created->push(Draw::create([
                    'tenant_id' => $tenantId,
                    'loteria_id' => $loteria->id,
                    'name' => $loteria->name,
                    'game_type' => $loteria->game_type,
                    'draw_datetime' => $drawDateTime,
                    'cutoff_minutes' => $baseDraw->cutoff_minutes,
                    'status' => 'abierto',
                    'is_active' => true,
                ]));
            }
        }

        return [
            'created' => $created,
            'existing' => $existing,
            'without_schedule' => $withoutSchedule->values(),
        ];
    }
}
