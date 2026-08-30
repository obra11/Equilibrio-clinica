# Deploy rápido — Equilíbrio

Use **as contas GitHub e Railway que você já tem**.

## Status local

- Repositório Git criado em `C:\Users\tluna\equilibrio`
- Commits prontos na branch `main`
- Prisma configurado para **PostgreSQL**
- Scripts: `npm run build:api` / `start:api` e `build:web` / `start:web`

## A) Publicar no GitHub (5 minutos)

1. Abra https://github.com/new  
2. Nome: `equilibrio-clinica` (ou outro)  
3. Marque **Private**  
4. **Não** marque “Add README” (o projeto já tem arquivos)  
5. Clique **Create repository**  
6. No PowerShell:

```powershell
$env:Path = "C:\Program Files\Git\cmd;" + $env:Path
cd C:\Users\tluna\equilibrio
git remote add origin https://github.com/SEU_USUARIO/equilibrio-clinica.git
git push -u origin main
```

Troque `SEU_USUARIO` pelo seu usuário do GitHub. Se pedir login, use o navegador / Personal Access Token.

## B) Railway

1. https://railway.app → login com o **mesmo GitHub**  
2. **New Project** → **Deploy from GitHub repo** → `equilibrio-clinica`  
3. **Add PostgreSQL**  
4. **Add service** (ou duplique) para ter dois serviços Node:

### Serviço `api`

| Campo | Valor |
|--------|--------|
| Build Command | `npm run build:api` |
| Start Command | `npm run start:api` |

Variáveis:

```
DATABASE_URL=${{Postgres.DATABASE_URL}}
JWT_SECRET=cole-um-segredo-longo-aqui
CORS_ORIGIN=https://SEU-DOMINIO-WEB.up.railway.app
CLINIC_NAME=Equilíbrio Fisioterapia e Bem-Estar
CLINIC_WHATSAPP=5548984882418
WHATSAPP_PROVIDER=console

# Storage em nuvem (Cloudflare R2 recomendado — fotos/vídeos grandes)
S3_BUCKET=equilibrio-media
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
S3_ENDPOINT=https://ACCOUNT_ID.r2.cloudflarestorage.com
S3_REGION=auto
S3_FORCE_PATH_STYLE=true
S3_PUBLIC_BASE_URL=https://pub-XXXX.r2.dev
STORAGE_MAX_VIDEO_MB=512
```

> Sem S3/R2, uploads vão para disco e **somem no redeploy**. Volume local (`UPLOADS_DIR=/data/uploads`) só como fallback.

### CORS no bucket R2/S3

Permita o domínio do web:

- Allowed Origins: `https://SEU-DOMINIO-WEB.up.railway.app` (e localhost em teste)
- Allowed Methods: `GET`, `PUT`, `HEAD`
- Allowed Headers: `Content-Type`
- Max Age: `3600`

Depois do primeiro deploy, no shell da API:

```bash
npm run db:seed
```

### Serviço `web`

| Campo | Valor |
|--------|--------|
| Build Command | `npm run build:web` |
| Start Command | `npm run start:web` |

Variável:

```
NEXT_PUBLIC_API_URL=https://SEU-DOMINIO-API.up.railway.app/api
```

(Use a URL pública que a Railway gerar para o serviço `api`.)

5. Abra a URL do **web** → login `admin@equilibrio.fisio.br` / `admin123`  
6. **Troque a senha** depois do primeiro acesso.

## C) Registro.br (quando tiver o domínio)

1. Compre/registre o domínio  
2. No serviço **web** (e opcionalmente **api**) → **Custom Domain**  
3. No DNS do Registro.br, crie o CNAME/A que a Railway mostrar  
4. Atualize `CORS_ORIGIN` e `NEXT_PUBLIC_API_URL` para o domínio final  

## Local com PostgreSQL

```powershell
cd C:\Users\tluna\equilibrio
docker compose up -d
# Ajuste apps/api/.env para:
# DATABASE_URL="postgresql://equilibrio:equilibrio@localhost:5432/equilibrio?schema=public"
npm run db:generate
npm run db:push
npm run db:seed
```
