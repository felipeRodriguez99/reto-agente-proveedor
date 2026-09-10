# Solución Técnica — Agente Conversacional "Registro como Proveedor"

> **Proceso de Selección · Equipo Perxia 2.0 · Periferia IT Group**  
> **Autor:** Felipe Rodríguez  
> **Fecha:** 2026-09-10  

---

## 1. Problema en una frase

El área administrativa de Periferia IT Group pierde decenas de horas hombre al mes transcribiendo manualmente información corporativa repetitiva desde un repositorio interno hacia múltiples formatos de formularios de clientes (Excel, PDF y portales web), con elevado riesgo de errores en datos sensibles e ineficiencia en el tiempo de respuesta.

---

## 2. Arquitectura de la Solución

### 2.1 Diagrama de Componentes

```
┌─────────────────────────────────────────────────────────────┐
│                       Front: Chat Web                       │
│ - Historial de conversación                                 │
│ - Indicador de pensamiento y llamados a herramientas        │
│ - Banner interactivo de confirmación humana                 │
└──────────────────────────────┬──────────────────────────────┘
                               │ HTTP / REST API
┌──────────────────────────────▼──────────────────────────────┐
│                    Backend (src/server.ts)                  │
│ - Express HTTP Server & Router                              │
│ - Adaptador OpenAI (gpt-4o-mini)                            │
│ - Ciclo del Agente (bucle tool call + tope 25 iteraciones)  │
│ - Gestión de sesiones en memoria                            │
└──────────────────────────────┬──────────────────────────────┘
                               │
            ┌──────────────────┴──────────────────┐
            │                                     │
┌───────────▼───────────┐             ┌───────────▼───────────┐
│     Prompt & Rules    │             │   Herramientas Zod    │
│  (agent/prompt.md)    │             │(src/tools/proveedor)  │
│                       │             │- leer_solicitud       │
│                       │             │- mapear_campos        │
│                       │             │- generar_formulario   │
│                       │             │- armar_paquete        │
│                       │             │- simular_envio        │
└───────────────────────┘             └───────────┬───────────┘
                                                  │
                               ┌──────────────────┴──────────────────┐
                               │                                     │
                    ┌──────────▼──────────┐               ┌──────────▼──────────┐
                    │      Lectura        │               │      Escritura      │
                    │   reto-01/casos/    │               │        out/         │
                    │  reto-01/repositorio│               │  - <caso>/formulario│
                    │  glosario-campos    │               │  - <caso>/paquete/  │
                    └─────────────────────┘               │  - <caso>/log.jsonl │
                                                          └─────────────────────┘
```

### 2.2 Separación de Responsabilidades

- **Comportamiento (Prompt)**: Externalizado en `agent/prompt.md`. Define el rol, el tono y las restricciones estrictas del modelo. Modificar las reglas de negocio en el prompt no requiere recompilar ni alterar el servidor.
- **Conocimiento / Fuentes de Datos**: Ubicado en `reto-01/repositorio/` (`maestro.json`, `soportes/`) y `reto-01/glosario-campos.json`.
- **Ejecución (Herramientas)**: Ubicado en `src/tools/proveedor.ts`. Funciones puras en TypeScript con esquemas `zod` que realizan las operaciones de lectura, mapeo, generación de archivos y auditoría.
- **Orquestación**: Ubicado en `src/server.ts`. Servidor HTTP Express que coordina el ciclo de razonamiento (LLM $\rightarrow$ Tool Calls $\rightarrow$ Output) y expone la API para el cliente web.

---

## 3. Ciclo del Agente y Confirmación Humana

### 3.1 Bucle del Agente
1. El usuario envía un mensaje a la API `POST /api/chat`.
2. El servidor envía los mensajes acumulados a la API de OpenAI (`gpt-4o-mini`) adjuntando las definiciones de las 5 herramientas.
3. Si el modelo responde con solicitudes de llamado a herramientas (`tool_calls`), el servidor ejecuta cada función invocada en `src/tools/proveedor.ts`.
4. El resultado serializado en JSON de cada herramienta se añade al historial con el rol `tool`.
5. El bucle continúa de forma autónoma hasta que el modelo emite una respuesta textual final o se alcanza el **tope de 25 iteraciones** (CA1).

### 3.2 Confirmación Humana (CA3 / RN4)
- Cuando el agente invoca `proveedor_armar_paquete`, se genera la carpeta `out/<caso>/paquete/` con `checklist.md` y `borrador-correo.md`.
- El servidor detecta la preparación del paquete y establece la propiedad `needsConfirmation: true` en la respuesta JSON de la API.
- El frontend web resalta inmediatamente un **Banner de Confirmación Humana Requerida** con botones de acción ("Sí, confirmar envío" / "No, cancelar").
- El agente **nunca** invoca la herramienta `proveedor_simular_envio` a menos que el usuario le otorgue una autorización explícita en el turno de conversación inmediatamente posterior.

---

## 4. Elección del Modelo de Lenguaje

- **Proveedor y Modelo**: OpenAI / `gpt-4o-mini`.
- **Justificación**:
  - Excelente capacidad para el seguimiento de instrucciones complejas y estructuradas en formato system prompt.
  - Soporte nativo y rápido para **Function Calling / Tool Use**.
  - Latencia promedio muy baja (~400 ms por iteración) y alta disponibilidad.
- **Costo Estimado por Caso Procesado**:
  - Un caso promedio requiere 4 llamadas a herramientas más la generación del resumen final (aprox. 3,500 tokens de entrada y 600 tokens de salida).
  - Con la tarifa vigente de `gpt-4o-mini` ($0.15 USD por 1M input tokens, $0.60 USD por 1M output tokens):
  - **Costo por caso:** $\approx \$0.000885\text{ USD}$ (menos de $0.001 USD por solicitud procesada).

---

## 5. Diseño Requerido para Portales Web (Sección 7.4)

### 5.1 Estrategia de Automatización
Para aquellos clientes cuyo formato de salida es un **portal web** con usuario y contraseña (ej. Caso `pa-logistica-istmo`), se implementa una estrategia **Asistida por Humano (Human-in-the-Loop)**:
1. El agente procesa el caso y genera el archivo `out/<caso>/valores-portal.md`.
2. El archivo contiene una matriz limpia con todas las etiquetas requeridas, sus valores correspondientes extraídos del maestro y notas de confirmación.
3. La analista administrativa consulta esta matriz y realiza la carga de datos en el portal web del cliente.

### 5.2 Limites de la Automatización Directa
- **Desafíos Técnicos**: Los portales de clientes reales implementan CAPTCHAs, autenticación multifactor (MFA/2FA), cambios dinámicos de DOM o tokens de sesión de corta duración que hacen inestable la automatización 100% desatendida mediante scrapers o headless browsers.

### 5.3 Gestión Segura de Credenciales
- **Políticas de Seguridad**: Las credenciales de acceso a portales **nunca** se almacenan en el repositorio, **nunca** se envían en los prompts al modelo de lenguaje y **nunca** se registran en archivos de log.
- **Operación**: Las credenciales permanecen bajo la custodia del usuario humano (analista), quien inicia sesión en el navegador. Se propone el desarrollo futuro de una extensión de navegador corporativa que autocomplete los inputs desde `valores-portal.md` sin almacenar claves.

---

## 6. Decisiones Técnicas y Trade-offs

1. **Uso de TypeScript y Zod para herramientas estables vs. Generación directa con el LLM**:
   - *Alternativa descartada*: Permitir que el LLM generara directamente los archivos Excel, PDF y Markdown sin herramientas interactivas.
   - *Razón*: Para cumplir estrictamente la regla **CA2** ("El modelo no puede afirmar un valor que no provenga de una herramienta"), la extracción de datos debe ser determinista, programática y validada mediante esquemas `zod`.

2. **Formato Markdown para Borrador de Correo vs. Integración SMTP Real**:
   - *Alternativa descartada*: Enviar correos reales automáticamente mediante Nodemailer o SendGrid.
   - *Razón*: El PRD exige que el agente sea un asistente que prepara el paquete pero **nunca firma ni envía de forma autónoma**. La simulación mediada por `borrador-correo.md` e `ENVIO-SIMULADO.md` garantiza el control humano absoluto.

3. **Almacenamiento de Sesiones en Memoria para Evaluaciones**:
   - *Alternativa descartada*: Implementar una base de datos PostgreSQL / Redis para persistir el historial de chat.
   - *Razón*: Mantiene la aplicación ligera, determinista y ejecutable en local de inmediato (`npm start`), cumpliendo el requisito no funcional de arranque en menos de 1 minuto sin dependencias de infraestructura pesadas.

---

## 7. Supuestos Asumidos

1. Los archivos fixture entregados en `reto-01/casos/` y `reto-01/repositorio/` reflejan la estructura representativa de los datos en producción.
2. La fecha de ejecución actual del sistema se utiliza como referencia para validar la vigencia de los soportes (`vigencia_hasta`), marcando como vencidos aquellos cuya fecha sea anterior al día de la prueba (2026-09-10).
3. Una respuesta afirmativa en el chat tras la presentación del resumen constituye la confirmación explícita necesaria para ejecutar la simulación de envío.

---

## 8. Cobertura de Historias de Usuario (HU)

| Historia de Usuario | Descripción | Estado | Detalle de Implementación |
|---|---|---|---|
| **HU-1** | Leer la solicitud y plantillas | **Hecho** | Implementado en `proveedor_leer_solicitud`. Parsea `solicitud.json`, plantillas (`xlsx`/`pdf`) y soportes exigidos. |
| **HU-2** | Mapear campos al maestro | **Hecho** | Implementado en `proveedor_mapear_campos`. Cruza con `maestro.json` y `glosario-campos.json`. Aplica la regla **RN1** para identificación tributaria por país. |
| **HU-3** | Generar el formulario | **Hecho** | Implementado en `proveedor_generar_formulario`. Escribe `formulario.xlsx` con ExcelJS, `formulario.pdf` con PDFKit o `valores-portal.md`. |
| **HU-4** | Armar el paquete para firma | **Hecho** | Implementado en `proveedor_armar_paquete`. Genera `checklist.md` (bloqueando `listo_para_firma` ante vencimientos) y `borrador-correo.md` (**sin datos bancarios**, RN2). |
| **HU-5** | Manejo de errores y auditoría | **Hecho** | Ninguna herramienta lanza excepciones (`{ ok: true }` / `{ ok: false }`). Todas las ejecuciones se registran en `out/<caso>/log.jsonl` (**RN5**). |

---

## 9. Declaración del Uso de Inteligencia Artificial

Para la construcción de esta solución se utilizaron asistentes de Inteligencia Artificial (Google Antigravity Agent & Gemini 3.6 Flash):
- **Tareas Automatizadas con IA**:
  - Generación del scaffolding inicial de TypeScript y contratos Zod para las 5 herramientas.
  - Maquetación de la interfaz web en HTML5/CSS3 moderno en `web/index.html`.
  - Construcción del script de prueba sin modelo `demo.ts`.
- **Validación Humana**:
  - Revisión y ajuste riguroso del cumplimiento de las reglas de negocio (regla de impuesto por país RN1, exclusión de datos bancarios en el borrador de correo RN2 y ciclo de confirmación humana RN4).

---

## 10. Riesgos en Producción y Estrategias de Mitigación

| Riesgo Identificado | Impacto | Estrategia de Mitigación |
|---|---|---|
| **Soportes vencidos no detectados a tiempo** | Alto | Implementar un cronjob diario de alertas administrativas que notifique al equipo 30 días antes del vencimiento de cualquier documento en el repositorio. |
| **Alucinación de valores en el modelo** | Crítico | Las herramientas Zod actúan como guardarraíles estrictos. El system prompt prohíbe al modelo responder valores que no provengan del resultado JSON de una herramienta. |
| **Variabilidad o cambio de formato en plantillas de clientes** | Medio | Incorporar un pipeline de visión por computador (OCR / Document AI) para extraer etiquetas de plantillas no estructuradas o imágenes. |
| **Envío accidental de correos sin revisión** | Crítico | Mantener la separación de responsabilidades: el agente solo simula o genera borradores; la integración de envío real requerirá firma digital humana previa. |
