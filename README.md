# Code Defender Full Stack

Refatoracao do monolito `code-defender-v8.html` para Node.js + Express + MongoDB + frontend ES Modules.

## Rodando localmente

1. Instale dependencias:

```bash
npm install
```

2. Configure o MongoDB em `.env`:

```env
PORT=3000
MONGO_URI=mongodb://127.0.0.1:27017/code_defender
JWT_SECRET=troque-este-segredo-em-producao
```

3. Inicie o servidor:

```bash
npm start
```

Abra http://localhost:3000. Em Render, Railway ou Fly.io, defina `MONGO_URI`, `JWT_SECRET` e deixe a plataforma preencher `PORT`.
