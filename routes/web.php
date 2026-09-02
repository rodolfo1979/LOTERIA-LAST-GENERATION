<?php

use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return response()->file(public_path('index.html'));
});

Route::get('/login', function () {
    return request()->expectsJson()
        ? response()->json(['message' => 'Sesion vencida. Inicia sesion de nuevo.'], 401)
        : redirect('/');
})->name('login');
