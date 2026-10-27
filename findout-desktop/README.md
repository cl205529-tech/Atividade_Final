# Find Out — App Desktop (Electron)

Rastreamento tátil inteligente. Mesma identidade visual do site, agora como app desktop.

## Rodar
```bash
npm install
npm start          # modo normal
npm run dev        # com DevTools
```

## Gerar instaladores
```bash
npm run dist:win     # Windows (.exe)
npm run dist:mac     # macOS (.dmg)
npm run dist:linux   # AppImage + .deb
```

## O que tem
- Janela sem moldura com barra de título própria (minimizar / maximizar / fechar)
- Início, Rastrear (simulador de vibração por distância), Dispositivos (CRUD), Histórico e Configurações
- Ícone na bandeja do sistema (fechar a janela mantém o app rodando, configurável)
- Notificação do sistema ao encontrar um objeto
- Instância única
- Dados salvos em JSON na pasta do usuário (`userData/findout-data.json`)
- Segurança: `contextIsolation`, `sandbox`, sem `nodeIntegration`, CSP restritiva, IPC validado

## Estrutura
```
src/main.js            processo principal (janela, tray, IPC, persistência)
src/preload.js         ponte segura (contextBridge)
src/renderer/          interface (HTML/CSS/JS)
assets/icon.png        ícone do app e da bandeja
```

## Próximos passos
Trocar o simulador por Bluetooth LE real (`navigator.bluetooth` / `@abandonware/noble`),
usando o RSSI da tag para calcular a distância.

## Banco de dados (MySQL) + Login/Cadastro
1. `npm install` (instala `mysql2` e `dotenv`)
2. Confira o arquivo `.env` na raiz (modelo em `.env.example`)
3. `npm start` — a tabela `pessoas` é criada automaticamente na primeira execução

CRUD de pessoa: **Create** (Criar conta) · **Read** (Entrar / Minha conta) · **Update** (editar dados e senha) · **Delete** (excluir conta).
Senhas são guardadas com hash `scrypt` + salt. O `.env` está no `.gitignore`.
Para o instalador (`npm run dist`), copie o `.env` para a pasta de dados do app (`userData`) na máquina do usuário.

## Área de administração
- Login: `admin@findout.com` / `12345678` (definidos em `ADMIN_EMAIL` e `ADMIN_PASSWORD` no `.env`; a conta é criada sozinha na 1ª execução)
- Lista de usuários com busca e filtros, estatísticas, criar, editar, bloquear/desbloquear, redefinir senha, excluir e exportar CSV
- O perfil é verificado no banco a cada ação (o renderer não decide quem é admin). O admin não pode excluir/bloquear a si mesmo
- Usuários bloqueados não conseguem entrar
