<?php

namespace App\Policies;

use App\Models\Transaction;
use App\Models\User;

class TransactionPolicy
{
    public function view(User $user, Transaction $transaction): bool
    {
        if ($transaction->tenant_id !== $user->tenant_id) {
            return false;
        }

        // Admin/dueno ven todo lo de su tenant; el vendedor solo lo suyo.
        return in_array($user->role, ['admin', 'dueno']) || $transaction->user_id === $user->id;
    }

}
