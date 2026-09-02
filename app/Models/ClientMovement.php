<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ClientMovement extends Model
{
    protected $fillable = [
        'tenant_id', 'client_id', 'user_id', 'transaction_id', 'type', 'amount', 'note',
    ];

    public function client()
    {
        return $this->belongsTo(Client::class);
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function transaction()
    {
        return $this->belongsTo(Transaction::class);
    }
}
