<?php

use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return response()->file(public_path('index.html'));
});

Route::get('/vendedor', function () {
    return response()->file(public_path('index.html'));
});

Route::get('/admin', function () {
    return response()->file(public_path('admin.html'));
});

Route::get('/superadmin', function () {
    return response()->file(public_path('superadmin.html'));
});

Route::get('/login', function () {
    return request()->expectsJson()
        ? response()->json(['message' => 'Sesion vencida. Inicia sesion de nuevo.'], 401)
        : redirect('/');
})->name('login');
