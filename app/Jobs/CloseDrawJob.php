<?php

namespace App\Jobs;

use App\Models\Draw;
use App\Models\TenantRule;
use App\Models\Transaction;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

class CloseDrawJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public function __construct(
        protected int $drawId,
        protected string $winningNumber,
        protected ?string $winningNumberAddon = null,
    ) {}

    public function handle(): void
    {
        $draw = Draw::findOrFail($this->drawId);

        $rule = TenantRule::where('tenant_id', $draw->tenant_id)
            ->where('game_type', $draw->game_type)
            ->firstOrFail();

        $draw->update([
            'status' => 'cerrado',
            'winning_number' => $this->winningNumber,
            'winning_number_addon' => $this->winningNumberAddon,
        ]);

        $ventas = Transaction::where('draw_id', $draw->id)->where('type', 'venta')->get();

        foreach ($ventas as $venta) {
            $this->pagarPremioSiAplica($venta, $draw, $rule);
        }

        // Las comisiones se generan al momento de vender para que el vendedor
        // las vea en tiempo real. En el cierre solo se rellenan ventas antiguas
        // que no tengan comision asociada.
        foreach ($ventas as $venta) {
            $yaTieneComision = Transaction::where('type', 'comision')
                ->where('draw_id', $draw->id)
                ->where('user_id', $venta->user_id)
                ->where('metadata->sale_transaction_id', $venta->id)
                ->exists();

            if (! $yaTieneComision && $rule->commission_pct > 0) {
                Transaction::create([
                    'tenant_id' => $draw->tenant_id,
                    'user_id' => $venta->user_id,
                    'draw_id' => $draw->id,
                    'type' => 'comision',
                    'amount' => ((float) $venta->amount + (float) $venta->addon_amount) * ((float) $rule->commission_pct / 100),
                    'metadata' => [
                        'sale_transaction_id' => $venta->id,
                        'commission_pct' => (float) $rule->commission_pct,
                    ],
                ]);
            }
        }

        $draw->update(['status' => 'pagado']);
    }

    protected function pagarPremioSiAplica(Transaction $venta, Draw $draw, TenantRule $rule): void
    {
        // Caso "todo o nada" (Tiempos, Chances): coincidencia exacta del numero completo.
        if (empty($rule->partial_match_rules)) {
            if ($venta->number_played === $this->winningNumber) {
                $this->crearPremio($venta, $draw, $venta->amount * $rule->prize_multiplier, 'exacto');
            }
        } else {
            // Caso pagos parciales (3 Monazos): cuenta cuantas posiciones coinciden.
            $aciertos = $this->contarAciertos($venta->number_played, $this->winningNumber);
            $multiplicador = $rule->partial_match_rules[(string) $aciertos] ?? null;

            if ($multiplicador) {
                $this->crearPremio($venta, $draw, $venta->amount * $multiplicador, "{$aciertos}_de_{$rule->digits_count}");
            }
        }

        // Addon opcional (Reventado): solo si la venta lo marco Y hay bolita ganadora del addon.
        if ($venta->with_addon && $this->winningNumberAddon && $rule->addon_multiplier) {
            if ($venta->number_played === $this->winningNumberAddon) {
                $this->crearPremio($venta, $draw, $venta->addon_amount * $rule->addon_multiplier, 'reventado');
            }
        }
    }

    protected function contarAciertos(string $jugado, string $ganador): int
    {
        $jugado = str_split($jugado);
        $ganador = str_split($ganador);
        $aciertos = 0;

        foreach ($jugado as $i => $digito) {
            if (($ganador[$i] ?? null) === $digito) {
                $aciertos++;
            }
        }

        return $aciertos;
    }

    protected function crearPremio(Transaction $venta, Draw $draw, float $monto, string $motivo): void
    {
        Transaction::create([
            'tenant_id' => $draw->tenant_id,
            'user_id' => $venta->user_id,
            'draw_id' => $draw->id,
            'type' => 'premio',
            'amount' => -1 * $monto,
            'number_played' => $venta->number_played,
            'metadata' => ['motivo' => $motivo, 'sale_transaction_id' => $venta->id],
        ]);
    }
}
