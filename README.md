# Equilíbrio — Gestão da Clínica

Sistema web para **Equilíbrio Fisioterapia e Bem-Estar** (Florianópolis).

## Stack

- **Web**: Next.js 15 + Tailwind
- **API**: NestJS + Prisma
- **DB**: PostgreSQL (local via Docker; produção na Railway)
- **Shared**: Zod + tokens de marca

## Como rodar (local)

> **Nota Windows / Google Drive:** rode a partir de uma cópia local (ex.: `C:\Users\<voce>\equilibrio`).

```bash
# 1) Subir Postgres
docker compose up -d

# 2) apps/api/.env (veja .env.example)
# DATABASE_URL="postgresql://equilibrio:equilibrio@localhost:5432/equilibrio?schema=public"

npm install
npm run build -w @equilibrio/shared
npm run db:generate
npm run db:push
npm run db:seed

# terminal 1
npm run dev:api

# terminal 2
npm run dev:web
```

- Web: http://localhost:3000  
- API: http://localhost:3001/api  

### Logins (seed)

| Perfil | E-mail | Senha |
|--------|--------|-------|
| Admin | admin@equilibrio.fisio.br | admin123 |
| Admin (Lizandra) | liz@equilibrio.fisio.br | fisio123 |
| Recepção | recepcao@equilibrio.fisio.br | recepcao123 |
| Fisioterapeuta | mirele@equilibrio.fisio.br | fisio123 |

## Deploy (GitHub + Railway + Registro.br)

### 1. GitHub (conta que você já tem)

```bash
cd C:\Users\<voce>\equilibrio
git init
git add .
git commit -m "Initial commit — Equilíbrio gestão clínica"
git branch -M main
# Crie um repo PRIVADO no GitHub (ex.: equilibrio-clinica), depois:
git remote add origin https://github.com/<seu-usuario>/equilibrio-clinica.git
git push -u origin main
```

### 2. Railway (mesma conta)

1. New Project → Deploy from GitHub → selecione o repo  
2. Add **PostgreSQL**  
3. Serviço **api**  
   - Build: `npm run build:api`  
   - Start: `npm run start:api`  
   - Vars: `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGIN`, **S3/R2** (`S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_ENDPOINT`, `S3_PUBLIC_BASE_URL`)  
   - Vídeos grandes: upload direto à nuvem (`STORAGE_MAX_VIDEO_MB=512`) — ver `DEPLOY.md`  
4. Serviço **web**  
   - Build: `npm run build:web`  
   - Start: `npm run start:web`  
   - Var: `NEXT_PUBLIC_API_URL=https://<url-da-api>/api`  
5. Gere domínio público Railway e teste o login  
6. Rode o seed uma vez (Railway shell ou one-off): `npm run db:seed`

Arquivos de referência: `railway.api.toml`, `railway.web.toml`, `apps/api/.env.example`.

### 3. Registro.br

1. Registre o domínio  
2. Na Railway → Custom Domain (web e, se quiser, `api.`)  
3. No DNS do Registro.br, crie o CNAME/A que a Railway mostrar  
4. Atualize `CORS_ORIGIN` e `NEXT_PUBLIC_API_URL` para o domínio final  

## Módulos

- Auth + papéis (ADMIN, RECEPCAO, FISIOTERAPEUTA)
- Pacientes + prontuário + fotos
- Agenda, Pilates em grupo, Financeiro
- WhatsApp de boas-vindas (configure Evolution/Meta para envio real)
