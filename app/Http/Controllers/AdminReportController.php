<?php

namespace App\Http\Controllers;

use App\Models\Draw;
use App\Models\SettlementClosure;
use App\Models\Transaction;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class AdminReportController extends Controller
{
    public function sellerControl(Request $request)
    {
        return response()->json($this->buildSellerControlReport($request));
    }

    public function exportExcel(Request $request)
    {
        $report = $this->buildSellerControlReport($request);
        $filename = 'control-vendedores-'.$report['filters']['from'].'-'.$report['filters']['to'].'.xls';
        $html = $this->buildExcelHtml($report);

        return response($html, 200, [
            'Content-Type' => 'application/vnd.ms-excel; charset=UTF-8',
            'Content-Disposition' => 'attachment; filename="'.$filename.'"',
        ]);
    }

    public function exportPdf(Request $request)
    {
        $report = $this->buildSellerControlReport($request);
        $filename = 'control-vendedores-'.$report['filters']['from'].'-'.$report['filters']['to'].'.pdf';
        $pdf = $this->buildPdf($report);

        return response($pdf, 200, [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' => 'attachment; filename="'.$filename.'"',
        ]);
    }

    public function closeSeller(Request $request)
    {
        if (! in_array($request->user()->role, ['admin', 'dueno'])) {
            abort(403);
        }

        $data = $request->validate([
            'user_id' => ['required', 'integer', 'exists:users,id'],
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date'],
            'draw_id' => ['nullable', 'integer', 'exists:draws,id'],
            'note' => ['nullable', 'string', 'max:255'],
        ]);

        $reportRequest = $request->duplicate(array_merge($request->query(), [
            'user_id' => $data['user_id'],
            'from' => $data['from'] ?? today()->toDateString(),
            'to' => $data['to'] ?? today()->toDateString(),
            'draw_id' => $data['draw_id'] ?? null,
        ]));

        $reportRequest->setUserResolver(fn () => $request->user());
        $report = $this->buildSellerControlReport($reportRequest);
        $row = $report['rows'][0] ?? null;

        if (! $row) {
            return response()->json(['message' => 'No se encontro el vendedor para cerrar.'], 422);
        }

        $closure = DB::transaction(function () use ($request, $data, $report, $row) {
            $closure = SettlementClosure::create([
                'tenant_id' => $request->user()->tenant_id,
                'user_id' => $row['seller']['id'],
                'closed_by' => $request->user()->id,
                'draw_id' => $data['draw_id'] ?? null,
                'period_from' => $report['filters']['from'],
                'period_to' => $report['filters']['to'],
                'sales_total' => $row['sales_total'],
                'commission_total' => $row['commission_total'],
                'prize_total' => $row['prize_total'],
                'cash_delivered' => $row['cash_delivered'],
                'cash_given' => $row['cash_given'],
                'settlement_amount' => $row['settlement_due'],
                'note' => $data['note'] ?? null,
                'snapshot' => $row,
            ]);

            if ((float) $row['settlement_due'] !== 0.0) {
                Transaction::create([
                    'tenant_id' => $request->user()->tenant_id,
                    'user_id' => $row['seller']['id'],
                    'draw_id' => $data['draw_id'] ?? null,
                    'type' => 'ajuste',
                    'amount' => -1 * (float) $row['settlement_due'],
                    'metadata' => [
                        'direction' => $row['settlement_due'] > 0 ? 'vendedor_a_admin' : 'admin_a_vendedor',
                        'note' => $data['note'] ?? 'Cierre de caja',
                        'settlement_closure_id' => $closure->id,
                        'registrado_por' => $request->user()->id,
                    ],
                ]);
            }

            return $closure;
        });

        return response()->json([
            'message' => 'Cierre de caja registrado.',
            'closure' => $closure,
        ], 201);
    }

    protected function buildSellerControlReport(Request $request): array
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
        $from = isset($data['from']) ? Carbon::parse($data['from'])->startOfDay() : today()->startOfDay();
        $to = isset($data['to']) ? Carbon::parse($data['to'])->endOfDay() : today()->endOfDay();

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

        $closures = SettlementClosure::where('tenant_id', $tenantId)
            ->whereBetween('created_at', [$from, $to])
            ->when($draw, fn ($query) => $query->where('draw_id', $draw->id))
            ->when($seller, fn ($query) => $query->where('user_id', $seller->id))
            ->with(['seller:id,name,phone', 'closer:id,name'])
            ->latest()
            ->limit(15)
            ->get()
            ->map(fn (SettlementClosure $closure) => [
                'id' => $closure->id,
                'seller_name' => $closure->seller?->name,
                'closed_by_name' => $closure->closer?->name,
                'period_from' => $closure->period_from?->toDateString(),
                'period_to' => $closure->period_to?->toDateString(),
                'settlement_amount' => (float) $closure->settlement_amount,
                'created_at' => $closure->created_at,
                'note' => $closure->note,
            ]);

        return [
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
            'closures' => $closures,
        ];
    }

    protected function buildExcelHtml(array $report): string
    {
        $money = fn ($value) => 'CRC '.number_format((float) $value, 2, '.', ',');
        $html = '<html><head><meta charset="UTF-8"></head><body>';
        $html .= '<h2>Control de ventas y comisiones</h2>';
        $html .= '<p>Desde: '.$this->e($report['filters']['from']).' | Hasta: '.$this->e($report['filters']['to']).'</p>';

        $html .= '<table border="1"><thead><tr>';
        foreach (['Vendedor', 'Telefono', 'Ventas', 'Normal', 'Reventado', 'Total', 'Comision', 'Premios', 'Entregado', 'Admin entrega', 'Debe entregar', 'Estado'] as $heading) {
            $html .= '<th>'.$heading.'</th>';
        }
        $html .= '</tr></thead><tbody>';

        foreach ($report['rows'] as $row) {
            $html .= '<tr>';
            $html .= '<td>'.$this->e($row['seller']['name']).'</td>';
            $html .= '<td>'.$this->e($row['seller']['phone']).'</td>';
            $html .= '<td>'.$row['sales_count'].'</td>';
            $html .= '<td>'.$money($row['sales_main']).'</td>';
            $html .= '<td>'.$money($row['sales_addon']).'</td>';
            $html .= '<td>'.$money($row['sales_total']).'</td>';
            $html .= '<td>'.$money($row['commission_total']).'</td>';
            $html .= '<td>'.$money($row['prize_total']).'</td>';
            $html .= '<td>'.$money($row['cash_delivered']).'</td>';
            $html .= '<td>'.$money($row['cash_given']).'</td>';
            $html .= '<td>'.$money($row['settlement_due']).'</td>';
            $html .= '<td>'.$this->e($row['status']).'</td>';
            $html .= '</tr>';
        }

        $html .= '</tbody></table><br><h3>Ultimos movimientos</h3>';
        $html .= '<table border="1"><thead><tr><th>Tipo</th><th>Vendedor</th><th>Sorteo</th><th>Numero</th><th>Monto</th><th>Reventado</th><th>Fecha</th></tr></thead><tbody>';

        foreach ($report['recent'] as $item) {
            $html .= '<tr>';
            $html .= '<td>'.$this->e($item['type']).'</td>';
            $html .= '<td>'.$this->e($item['seller_name'] ?? '').'</td>';
            $html .= '<td>'.$this->e($item['draw_name'] ?? '').'</td>';
            $html .= '<td>'.$this->e($item['number_played'] ?? '').'</td>';
            $html .= '<td>'.$money($item['amount']).'</td>';
            $html .= '<td>'.$money($item['addon_amount']).'</td>';
            $html .= '<td>'.$this->e((string) $item['created_at']).'</td>';
            $html .= '</tr>';
        }

        return $html.'</tbody></table></body></html>';
    }

    protected function buildPdf(array $report): string
    {
        $lines = [
            'Control de ventas y comisiones',
            'Desde '.$report['filters']['from'].' hasta '.$report['filters']['to'],
            'Total vendido: CRC '.number_format($report['totals']['sales_total'], 2, '.', ','),
            'Reventado: CRC '.number_format($report['totals']['sales_addon'], 2, '.', ','),
            'Comisiones: CRC '.number_format($report['totals']['commission_total'], 2, '.', ','),
            'Debe entregar: CRC '.number_format($report['totals']['settlement_due'], 2, '.', ','),
            '',
            'Vendedores',
        ];

        foreach ($report['rows'] as $row) {
            $lines[] = Str::limit($row['seller']['name'], 22, '').' | ventas CRC '.number_format($row['sales_total'], 2, '.', ',').' | comision CRC '.number_format($row['commission_total'], 2, '.', ',').' | debe CRC '.number_format($row['settlement_due'], 2, '.', ',').' | '.$row['status'];
        }

        $lines[] = '';
        $lines[] = 'Ultimos movimientos';
        foreach ($report['recent'] as $item) {
            $amount = $item['type'] === 'venta'
                ? (float) $item['amount'] + (float) $item['addon_amount']
                : (float) $item['amount'];
            $lines[] = Str::limit(($item['type'].' '.$item['seller_name'].' '.$item['draw_name'].' '.$item['number_played']), 55, '').' CRC '.number_format($amount, 2, '.', ',');
        }

        return $this->simplePdf($lines);
    }

    protected function simplePdf(array $lines): string
    {
        $content = "BT\n/F1 12 Tf\n50 790 Td\n";
        foreach (array_slice($lines, 0, 42) as $index => $line) {
            if ($index > 0) {
                $content .= "0 -17 Td\n";
            }
            $content .= '('.$this->pdfText($line).") Tj\n";
        }
        $content .= "ET";

        $objects = [
            "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
            "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
            "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n",
            "4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
            "5 0 obj\n<< /Length ".strlen($content)." >>\nstream\n".$content."\nendstream\nendobj\n",
        ];

        $pdf = "%PDF-1.4\n";
        $offsets = [0];
        foreach ($objects as $object) {
            $offsets[] = strlen($pdf);
            $pdf .= $object;
        }

        $xref = strlen($pdf);
        $pdf .= "xref\n0 ".(count($objects) + 1)."\n";
        $pdf .= "0000000000 65535 f \n";
        for ($i = 1; $i <= count($objects); $i++) {
            $pdf .= sprintf("%010d 00000 n \n", $offsets[$i]);
        }

        return $pdf."trailer\n<< /Size ".(count($objects) + 1)." /Root 1 0 R >>\nstartxref\n".$xref."\n%%EOF";
    }

    protected function pdfText(string $text): string
    {
        $converted = iconv('UTF-8', 'Windows-1252//TRANSLIT', $text);
        $text = $converted === false ? preg_replace('/[^\x20-\x7E]/', '', $text) : $converted;

        return str_replace(['\\', '(', ')'], ['\\\\', '\\(', '\\)'], $text);
    }

    protected function e(?string $text): string
    {
        return htmlspecialchars($text ?? '', ENT_QUOTES, 'UTF-8');
    }
}
