<?php

namespace App\Policies;

use App\Models\Draw;
use App\Models\User;

class DrawPolicy
{
    public function closeDraw(User $user, Draw $draw): bool
    {
        return $draw->tenant_id === $user->tenant_id
            && in_array($user->role, ['admin', 'dueno']);
    }
}
