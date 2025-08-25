// VIVA LIBRAS - SERVIDOR PREMIUM PARA NUVEM
// Garantido para funcionar em qualquer plataforma cloud

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

// Configuração CORS ultra permissiva
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST", "PUT", "DELETE"],
        allowedHeaders: ["*"],
        credentials: true
    },
    allowEIO3: true,
    transports: ['polling', 'websocket']
});

// Middleware essencial
app.use(cors({
    origin: "*",
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["*"]
}));
app.use(express.json());
app.use(express.static('public'));

// Dados em memória
const usuarios = new Map();
const interpretesOnline = new Set();
const surdosEsperando = new Set();

// Sistema de log colorido
const log = {
    info: (msg) => console.log(`[INFO] ${new Date().toLocaleTimeString('pt-BR')} - ${msg}`),
    success: (msg) => console.log(`[SUCCESS] ${new Date().toLocaleTimeString('pt-BR')} - ${msg}`),
    warning: (msg) => console.log(`[WARNING] ${new Date().toLocaleTimeString('pt-BR')} - ${msg}`),
    error: (msg) => console.log(`[ERROR] ${new Date().toLocaleTimeString('pt-BR')} - ${msg}`)
};

// Rota principal - mostra que servidor está funcionando
app.get('/', (req, res) => {
    res.send(`
        <html>
        <head>
            <title>Viva Libras - Servidor Premium</title>
            <style>
                body { font-family: Arial, sans-serif; background: #f0f9ff; text-align: center; padding: 50px; }
                .container { max-width: 600px; margin: 0 auto; background: white; padding: 40px; border-radius: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.1); }
                .logo { font-size: 48px; margin-bottom: 20px; }
                .title { color: #1f2937; margin-bottom: 10px; }
                .subtitle { color: #6b7280; margin-bottom: 30px; }
                .stats { display: flex; justify-content: space-around; margin: 30px 0; }
                .stat { text-align: center; }
                .stat-number { font-size: 32px; font-weight: bold; color: #3b82f6; }
                .stat-label { color: #6b7280; font-size: 14px; }
                .status { background: #10b981; color: white; padding: 10px 20px; border-radius: 50px; display: inline-block; margin-top: 20px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="logo">🤝</div>
                <h1 class="title">Viva Libras</h1>
                <p class="subtitle">Servidor Premium Funcionando na Nuvem</p>
                <div class="stats">
                    <div class="stat">
                        <div class="stat-number">${usuarios.size}</div>
                        <div class="stat-label">Usuários Online</div>
                    </div>
                    <div class="stat">
                        <div class="stat-number">${interpretesOnline.size}</div>
                        <div class="stat-label">Intérpretes Disponíveis</div>
                    </div>
                    <div class="stat">
                        <div class="stat-number">${surdosEsperando.size}</div>
                        <div class="stat-label">Surdos Aguardando</div>
                    </div>
                </div>
                <div class="status">🌟 SERVIDOR ONLINE E FUNCIONANDO</div>
                <p>Timestamp: ${new Date().toLocaleString('pt-BR')}</p>
            </div>
        </body>
        </html>
    `);
});

// Rota de estatísticas em JSON
app.get('/api/stats', (req, res) => {
    res.json({
        status: 'online',
        timestamp: new Date().toISOString(),
        usuarios_total: usuarios.size,
        interpretes_online: interpretesOnline.size,
        surdos_esperando: surdosEsperando.size,
        server_info: {
            node_version: process.version,
            uptime: process.uptime()
        }
    });
});

// Teste de conectividade
app.get('/api/ping', (req, res) => {
    res.json({ 
        message: 'pong',
        timestamp: new Date().toISOString(),
        server_healthy: true
    });
});

// === EVENTOS SOCKET.IO ===
io.on('connection', (socket) => {
    log.success(`Nova conexão: ${socket.id}`);

    // Evento: Login do usuário
    socket.on('user-login', (dados) => {
        try {
            const { role, email } = dados;
            
            usuarios.set(socket.id, {
                id: socket.id,
                role: role,
                email: email,
                conectadoEm: new Date(),
                online: true
            });

            socket.data.role = role;
            socket.data.email = email;

            log.info(`Login: ${role} - ${email} (${socket.id})`);

            // Se é intérprete, verificar surdos esperando
            if (role === 'interprete') {
                verificarSurdosEsperando();
            }

            // Se é surdo, verificar intérpretes disponíveis
            if (role === 'surdo') {
                if (interpretesOnline.size > 0) {
                    const interpreteDisponivel = Array.from(interpretesOnline)[0];
                    socket.emit('interpreter-status', {
                        available: true,
                        id: interpreteDisponivel
                    });
                    log.info(`Intérprete ${interpreteDisponivel} disponível para surdo ${socket.id}`);
                } else {
                    surdosEsperando.add(socket.id);
                    socket.emit('interpreter-status', {
                        available: false,
                        id: null
                    });
                    log.info(`Surdo ${socket.id} adicionado à fila de espera`);
                }
            }

        } catch (error) {
            log.error(`Erro no login: ${error.message}`);
            socket.emit('error', { message: 'Erro no login' });
        }
    });

    // Evento: Intérprete fica online
    socket.on('interpreter-online', () => {
        if (socket.data.role === 'interprete') {
            interpretesOnline.add(socket.id);
            
            const usuario = usuarios.get(socket.id);
            if (usuario) usuario.online = true;

            log.success(`Intérprete online: ${socket.id}`);
            notificarSurdosEsperando();
        }
    });

    // Evento: Intérprete fica offline
    socket.on('interpreter-offline', () => {
        if (socket.data.role === 'interprete') {
            interpretesOnline.delete(socket.id);
            
            const usuario = usuarios.get(socket.id);
            if (usuario) usuario.online = false;

            log.info(`Intérprete offline: ${socket.id}`);
        }
    });

    // Evento: Solicitação de chamada
    socket.on('request-call', (dados) => {
        try {
            const { to, from, offer } = dados;
            
            log.info(`Solicitação de chamada: ${from} → ${to}`);

            const socketDestino = io.sockets.sockets.get(to);
            if (socketDestino && interpretesOnline.has(to)) {
                // Remove intérprete temporariamente da lista
                interpretesOnline.delete(to);
                surdosEsperando.delete(from);

                socketDestino.emit('incoming-call', {
                    from: from,
                    offer: offer
                });

                log.success(`Chamada enviada para intérprete ${to}`);
            } else {
                socket.emit('interpreter-status', {
                    available: false,
                    id: null
                });
                log.warning(`Intérprete ${to} não está disponível`);
            }

        } catch (error) {
            log.error(`Erro na solicitação de chamada: ${error.message}`);
        }
    });

    // Evento: Responder chamada
    socket.on('answer-call', (dados) => {
        try {
            const { to, from, answer } = dados;
            
            log.success(`Chamada aceita: ${from} → ${to}`);

            io.to(to).emit('call-answer', {
                from: from,
                answer: answer
            });

        } catch (error) {
            log.error(`Erro ao responder chamada: ${error.message}`);
        }
    });

    // Evento: Recusar chamada
    socket.on('decline-call', (dados) => {
        try {
            const { to, from } = dados;
            
            log.info(`Chamada recusada: ${from} → ${to}`);

            // Recolocar intérprete como disponível
            if (socket.data.role === 'interprete') {
                interpretesOnline.add(socket.id);
            }

            // Recolocar surdo na fila
            surdosEsperando.add(to);

            io.to(to).emit('call-declined', { from: from });

        } catch (error) {
            log.error(`Erro ao recusar chamada: ${error.message}`);
        }
    });

    // Evento: Encerrar chamada
    socket.on('end-call', (dados) => {
        try {
            const { to } = dados;
            
            log.info(`Chamada encerrada por ${socket.id} → ${to}`);

            io.to(to).emit('call-ended', {
                from: socket.id
            });

            // Reativar intérpretes se aplicável
            const usuarioFrom = usuarios.get(socket.id);
            const usuarioTo = usuarios.get(to);

            if (usuarioFrom && usuarioFrom.role === 'interprete') {
                interpretesOnline.add(socket.id);
            }
            if (usuarioTo && usuarioTo.role === 'interprete') {
                interpretesOnline.add(to);
            }

            // Verificar se há surdos esperando
            verificarSurdosEsperando();

        } catch (error) {
            log.error(`Erro ao encerrar chamada: ${error.message}`);
        }
    });

    // Evento: Candidatos ICE (WebRTC)
    socket.on('ice-candidate', (dados) => {
        try {
            const { to, candidate } = dados;
            
            io.to(to).emit('ice-candidate', {
                from: socket.id,
                candidate: candidate
            });

        } catch (error) {
            log.error(`Erro no ICE candidate: ${error.message}`);
        }
    });

    // Evento: Desconexão
    socket.on('disconnect', () => {
        log.warning(`Usuário desconectado: ${socket.id}`);

        // Limpeza
        usuarios.delete(socket.id);
        interpretesOnline.delete(socket.id);
        surdosEsperando.delete(socket.id);

        // Se era intérprete, notificar surdos
        if (socket.data && socket.data.role === 'interprete') {
            notificarSurdosEsperando();
        }
    });

    // Ping/Pong para manter conexão
    socket.on('ping', () => {
        socket.emit('pong');
    });
});

// === FUNÇÕES AUXILIARES ===
function verificarSurdosEsperando() {
    if (surdosEsperando.size > 0 && interpretesOnline.size > 0) {
        const surdoId = Array.from(surdosEsperando)[0];
        const interpreteId = Array.from(interpretesOnline)[0];
        
        io.to(surdoId).emit('interpreter-status', {
            available: true,
            id: interpreteId
        });

        log.info(`Conectando surdo ${surdoId} com intérprete ${interpreteId}`);
    }
}

function notificarSurdosEsperando() {
    surdosEsperando.forEach(surdoId => {
        if (interpretesOnline.size > 0) {
            const interpreteId = Array.from(interpretesOnline)[0];
            io.to(surdoId).emit('interpreter-status', {
                available: true,
                id: interpreteId
            });
        } else {
            io.to(surdoId).emit('interpreter-status', {
                available: false,
                id: null
            });
        }
    });
}

// Limpeza periódica
setInterval(() => {
    let limpezas = 0;

    usuarios.forEach((usuario, socketId) => {
        const socket = io.sockets.sockets.get(socketId);
        if (!socket) {
            usuarios.delete(socketId);
            interpretesOnline.delete(socketId);
            surdosEsperando.delete(socketId);
            limpezas++;
        }
    });

    if (limpezas > 0) {
        log.info(`Limpeza automática: ${limpezas} conexões removidas`);
    }
}, 30000);

// Status periódico
setInterval(() => {
    log.info(`Status: ${usuarios.size} usuários | ${interpretesOnline.size} intérpretes | ${surdosEsperando.size} surdos esperando`);
}, 60000);

// === INICIALIZAÇÃO DO SERVIDOR ===
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log('\n🚀 ================================================');
    console.log('🎯 VIVA LIBRAS - SERVIDOR PREMIUM NA NUVEM');
    console.log('🌟 Pronto para conectar o mundo todo!');
    console.log('🚀 ================================================');
    console.log(`\n✅ Servidor rodando na porta: ${PORT}`);
    console.log(`📡 Socket.IO ativo e funcionando`);
    console.log(`🌐 Acesse: ${process.env.RAILWAY_STATIC_URL || process.env.RENDER_EXTERNAL_URL || 'http://localhost:' + PORT}`);
    console.log(`📊 Stats: ${process.env.RAILWAY_STATIC_URL || process.env.RENDER_EXTERNAL_URL || 'http://localhost:' + PORT}/api/stats`);
    console.log('\n🎉 PRONTO PARA RECEBER CONEXÕES!\n');
});

// Tratamento de erros
process.on('uncaughtException', (error) => {
    log.error(`Erro crítico: ${error.message}`);
    console.error(error.stack);
});

process.on('unhandledRejection', (reason) => {
    log.error(`Promise rejeitada: ${reason}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    log.info('Encerrando servidor...');
    server.close(() => {
        log.success('Servidor encerrado com sucesso');
        process.exit(0);
    });
});