# Reto Técnico 01 — Agente Conversacional "Registro como Proveedor"

Agente conversacional de extremo a extremo que automatiza el diligenciamiento de formularios de registro como proveedor ante clientes de LATAM, mapeando campos contra el repositorio maestro y preparando el paquete documental para firma del representante legal.

---

## 🚀 Puesta en Marcha Rápida (Local)

### 1. Requisitos Previos
- **Node.js 20+**
- **npm** o **bun**

### 2. Variables de Entorno
Crea el archivo `.env` en la raíz del proyecto (basado en `.env.example`):
```env
PORT=3000
OPENAI_API_KEY=tu_api_key_de_openai
OPENAI_MODEL=gpt-4o-mini
```

### 3. Instalar Dependencias y Compilar
```bash
npm install
npm run build
```

### 4. Ejecutar Demostración Sin Modelo (`demo.ts`)
Ejecuta la prueba automatizada de las 5 herramientas sobre todos los casos fixture (`co-industrias-delta`, `ec-corp-andina`, `hn-agroexport-sula`, `pa-logistica-istmo`) sin consumir API key:
```bash
npm run demo
```

### 5. Iniciar Servidor del Agente y Front Web
```bash
npm start
```
Abre tu navegador en: [http://localhost:3000](http://localhost:3000)

---

## 🛠️ Estructura del Proyecto

```
reto-agente-proveedor/
├── agent/
│   └── prompt.md                # System prompt del agente
├── src/
│   ├── server.ts                # API HTTP Express y ciclo OpenAI Function Calling
│   └── tools/
│       └── proveedor.ts         # Herramientas Zod (leer, mapear, generar, armar, simular)
├── web/
│   └── index.html               # Interfaz de chat moderna
├── reto-01/                     # Fixtures entregados (casos y repositorio maestro)
├── out/                         # Archivos generados por caso y auditoría log.jsonl
├── demo.ts                      # Ejecución de herramientas sin LLM
├── SOLUCION.md                  # Documento de planteamiento técnico y arquitectura
├── .env.example                 # Plantilla de variables de entorno
└── package.json
```

---

## 📑 Documentación de la Solución
Para más detalles sobre la arquitectura, ciclo del agente, confirmación humana, justificación del modelo y matriz de Historias de Usuario, consulta el archivo [`SOLUCION.md`](./SOLUCION.md).
