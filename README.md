# Workforce Pro

Ung dung cham cong duoc tach thanh 2 phan:

- `frontend`: React + TypeScript + Vite.
- `backend`: TypeScript API mock dung Node HTTP.

## Chay frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend mac dinh chay tai `http://localhost:5173`.

## Chay backend

```bash
cd backend
npm install
npm run build
npm run dev
```

Backend mac dinh chay tai `http://localhost:4000`.

## Tai khoan demo

Mat khau demo cho tat ca tai khoan la `password`.

- `alex@workforce.local` - Employee
- `manager@workforce.local` - Manager
- `hr@workforce.local` - HR
- `payroll@workforce.local` - Payroll
- `admin@workforce.local` - Admin
## Deploy demo

Cach de deploy ban demo hien tai:

### Backend tren Render/Railway

Root directory:

```text
backend
```

Build command:

```bash
npm install && npm run build
```

Start command:

```bash
npm run start
```

Environment variables:

```env
PORT=4000
FRONTEND_URL=https://your-frontend-domain.vercel.app
```

Neu co nhieu domain frontend, dung:

```env
ALLOWED_ORIGINS=http://localhost:5173,https://your-frontend-domain.vercel.app
```

Health check endpoint:

```text
/api/health
```

### Frontend tren Vercel/Netlify

Root directory:

```text
frontend
```

Build command:

```bash
npm run build
```

Output directory:

```text
dist
```

Environment variables:

```env
VITE_API_URL=https://your-backend-domain.onrender.com
```

### Luu y

Ban hien tai deploy duoc de demo. Du lieu van dang luu tren memory cua backend, nen khi server restart thi cac thay doi moi tao co the mat. De len production that can them database, storage upload file va email SMTP.
