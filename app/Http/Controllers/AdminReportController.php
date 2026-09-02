<?php

namespace App\Http\Controllers;

use App\Models\Draw;
use App\Models\Transaction;
use App\Models\User;
use Illuminate\Http\Request;

class AdminReportController extends Controller
{
    public function sellerControl(Request $request)
    {
        if (! in_array($request->user()->role, ['admin', 'dueno'])) {
            abort(403);
        }

        $data = $request->validate([
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date'],
            'draw_id' => ['nullable', 'integer', 'exists:draws,id'],
            'user_id' => ['nullable', 'integer', 'exists:users,id'],
        ]);

        $tenantId = $request->user()->tenant_id;
        $from = isset($data['from']) ? now()->parse($data['from'])->startOfDay() : today()->startOfDay();
        $to = isset($data['to']) ? now()->parse($data['to'])->endOfDay() : today()->endOfDay();

        $draw = null;
        if (! empty($data['draw_id'])) {
            $draw = Draw::where('tenant_id', $tenantId)->findOrFail($data['draw_id']);
        }

        $seller = null;
        if (! empty($data['user_id'])) {
            $seller = User::where('tenant_id', $tenantId)
                ->where('role', 'vendedor')
                ->findOrFail($data['user_id']);
        }

        $transactions = Transaction::where('tenant_id', $tenantId)
            ->whereBetween('created_at', [$from, $to])
            ->when($draw, fn ($query) => $query->where('draw_id', $draw->id))
            ->when($seller, fn ($query) => $query->where('user_id', $seller->id))
            ->with(['user:id,name,phone', 'draw:id,name,draw_datetime,status,winning_number,winning_number_addon'])
            ->latest()
            ->get();

        $sellerQuery = User::where('tenant_id', $tenantId)->where('role', 'vendedor');
        if ($seller) {
            $sellerQuery->where('id', $seller->id);
        }

        $rows = $sellerQuery->orderBy('name')->get()->map(function (User $vendedor) use ($transactions) {
            $items = $transactions->where('user_id', $vendedor->id);
            $sales = $items->where('type', 'venta');
            $commissions = $items->where('type', 'comision');
            $prizes = $items->where('type', 'premio');
            $cash = $items->where('type', 'ajuste');

            $salesMain = (float) $sales->sum('amount');
            $salesAddon = (float) $sales->sum('addon_amount');
            $salesTotal = $salesMain + $salesAddon;
            $commissionTotal = (float) $commissions->sum('amount');
            $prizeTotal = abs((float) $prizes->sum('amount'));
            $cashDelivered = abs((float) $cash->filter(fn (Transaction $item) => $item->amount < 0)->sum('amount'));
            $cashGiven = (float) $cash->filter(fn (Transaction $item) => $item->amount > 0)->sum('amount');
            $settlementDue = $salesTotal - $commissionTotal - $prizeTotal - $cashDelivered + $cashGiven;

            $status = 'cuadrado';
            if ($settlementDue > 0) {
                $status = 'pendiente';
            } elseif ($settlementDue < 0) {
                $status = 'a favor';
            }

            return [
                'seller' => [
                    'id' => $vendedor->id,
                    'name' => $vendedor->name,
                    'phone' => $vendedor->phone,
                ],
                'sales_count' => $sales->count(),
                'sales_main' => $salesMain,
                'sales_addon' => $salesAddon,
                'sales_total' => $salesTotal,
                'commission_total' => $commissionTotal,
                'prize_total' => $prizeTotal,
                'cash_delivered' => $cashDelivered,
                'cash_given' => $cashGiven,
                'settlement_due' => $settlementDue,
                'ledger_balance' => (float) $items->sum('amount'),
                'status' => $status,
            ];
        })->values();

        $recent = $transactions->take(25)->map(fn (Transaction $item) => [
            'id' => $item->id,
            'type' => $item->type,
            'amount' => (float) $item->amount,
            'addon_amount' => (float) $item->addon_amount,
            'number_played' => $item->number_played,
            'created_at' => $item->created_at,
            'seller_name' => $item->user?->name,
            'draw_name' => $item->draw?->name,
            'draw_datetime' => $item->draw?->draw_datetime,
            'metadata' => $item->metadata,
        ]);

        return response()->json([
            'filters' => [
                'from' => $from->toDateString(),
                'to' => $to->toDateString(),
                'draw_id' => $draw?->id,
                'user_id' => $seller?->id,
            ],
            'totals' => [
                'sales_count' => (int) $rows->sum('sales_count'),
                'sales_main' => (float) $rows->sum('sales_main'),
                'sales_addon' => (float) $rows->sum('sales_addon'),
                'sales_total' => (float) $rows->sum('sales_total'),
                'commission_total' => (float) $rows->sum('commission_total'),
                'prize_total' => (float) $rows->sum('prize_total'),
                'cash_delivered' => (float) $rows->sum('cash_delivered'),
                'cash_given' => (float) $rows->sum('cash_given'),
                'settlement_due' => (float) $rows->sum('settlement_due'),
            ],
            'rows' => $rows,
            'recent' => $recent,
        ]);
    }
}
