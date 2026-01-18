const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');

// Rutas base: /api/users

// Crear usuario
router.post('/', userController.createUser);

// Listar usuarios
router.get('/', userController.getUsers);

module.exports = router;
