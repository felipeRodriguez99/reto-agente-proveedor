import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import OpenAI from "openai";
import {
  leer_solicitud,
  mapear_campos,
  generar_formulario,
  armar_paquete,
  simular_envio
} from "./tools/proveedor";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

app.use(cors());
app.use(express.json());

// Servir archivos estáticos del frontend en web/ y manejar ruta raíz /
const rootDir = process.cwd();
const webDir = path.join(rootDir, "web");

app.use(express.static(webDir));

app.get("/", (req, res) => {
  const indexPath = path.join(webDir, "index.html");
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send("Archivo index.html no encontrado en la carpeta web/");
  }
});

// Cargar el system prompt desde agent/prompt.md
function getSystemPrompt(): string {
  const promptPath = path.join(rootDir, "agent", "prompt.md");
  if (fs.existsSync(promptPath)) {
    return fs.readFileSync(promptPath, "utf-8");
  }
  return "Eres un asistente de automatización de registro como proveedor para Periferia IT Group.";
}

// Mapeo de herramientas disponibles
const toolsMap: { [name: string]: any } = {
  proveedor_leer_solicitud: leer_solicitud,
  proveedor_mapear_campos: mapear_campos,
  proveedor_generar_formulario: generar_formulario,
  proveedor_armar_paquete: armar_paquete,
  proveedor_simular_envio: simular_envio
};

// Definición de schemas OpenAI Tool Calling
const openAiTools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "proveedor_leer_solicitud",
      description: leer_solicitud.description,
      parameters: {
        type: "object",
        properties: {
          caso: {
            type: "string",
            description: "Nombre de la carpeta del caso en reto-01/casos/ (ej: co-industrias-delta, ec-corp-andina, hn-agroexport-sula, pa-logistica-istmo)"
          }
        },
        required: ["caso"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "proveedor_mapear_campos",
      description: mapear_campos.description,
      parameters: {
        type: "object",
        properties: {
          caso: {
            type: "string",
            description: "Nombre de la carpeta del caso en reto-01/casos/"
          },
          campos: {
            type: "array",
            description: "Lista de campos requeridos devueltos por proveedor_leer_solicitud",
            items: { type: "object" }
          }
        },
        required: ["caso", "campos"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "proveedor_generar_formulario",
      description: generar_formulario.description,
      parameters: {
        type: "object",
        properties: {
          caso: {
            type: "string",
            description: "Nombre de la carpeta del caso en reto-01/casos/"
          },
          mapeo: {
            type: "object",
            description: "Objeto con los arrays llenos, faltantes y requiere_confirmacion de proveedor_mapear_campos",
            properties: {
              llenos: { type: "array", items: { type: "object" } },
              faltantes: { type: "array", items: { type: "object" } },
              requiere_confirmacion: { type: "array", items: { type: "object" } }
            },
            required: ["llenos"]
          }
        },
        required: ["caso", "mapeo"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "proveedor_armar_paquete",
      description: armar_paquete.description,
      parameters: {
        type: "object",
        properties: {
          caso: {
            type: "string",
            description: "Nombre de la carpeta del caso en reto-01/casos/"
          }
        },
        required: ["caso"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "proveedor_simular_envio",
      description: simular_envio.description,
      parameters: {
        type: "object",
        properties: {
          caso: {
            type: "string",
            description: "Nombre de la carpeta del caso en reto-01/casos/"
          },
          confirmado: {
            type: "boolean",
            description: "Debe ser true si el usuario otorgó confirmación explícita para enviar"
          }
        },
        required: ["caso", "confirmado"]
      }
    }
  }
];

// Almacenamiento de sesiones en memoria
interface Session {
  id: string;
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
}
const sessions: { [id: string]: Session } = {};

function getOrCreateSession(sessionId?: string): Session {
  const id = sessionId || `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  if (!sessions[id]) {
    sessions[id] = {
      id,
      messages: [
        {
          role: "system",
          content: getSystemPrompt()
        }
      ]
    };
  }
  return sessions[id];
}

// Inicializar cliente de OpenAI (se lee OPENAI_API_KEY de entorno)
function getOpenAIClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey.trim() === "") {
    return null;
  }
  return new OpenAI({ apiKey });
}

// Endpoint de Salud
app.get("/api/health", (req, res) => {
  const openaiAvailable = !!process.env.OPENAI_API_KEY;
  res.json({
    ok: true,
    provider: "openai",
    model: OPENAI_MODEL,
    apiKeyConfigured: openaiAvailable
  });
});

// Endpoint de Consulta de Sesión
app.get("/api/sessions/:id", (req, res) => {
  const session = sessions[req.params.id];
  if (!session) {
    res.status(404).json({ ok: false, error: "Sesión no encontrada" });
    return;
  }
  res.json({ ok: true, session });
});

// Endpoint Principal del Chat (Ciclo del Agente)
app.post("/api/chat", async (req, res) => {
  const { sessionId, message } = req.body;

  if (!message || typeof message !== "string") {
    res.status(400).json({ ok: false, error: "Se requiere un campo 'message' de tipo string" });
    return;
  }

  const openai = getOpenAIClient();
  if (!openai) {
    res.status(500).json({
      ok: false,
      error: "No se encuentra configurada la variable de entorno OPENAI_API_KEY."
    });
    return;
  }

  const session = getOrCreateSession(sessionId);
  session.messages.push({ role: "user", content: message });

  const turnToolCalls: any[] = [];
  const MAX_ITERATIONS = 25;
  let iterations = 0;
  let finalReply = "";
  let needsConfirmation = false;

  try {
    while (iterations < MAX_ITERATIONS) {
      iterations++;

      const completion = await openai.chat.completions.create({
        model: OPENAI_MODEL,
        messages: session.messages,
        tools: openAiTools,
        tool_choice: "auto"
      });

      const choice = completion.choices[0];
      const messageObj = choice.message;

      // Guardar el mensaje del asistente en el historial
      session.messages.push(messageObj);

      if (messageObj.tool_calls && messageObj.tool_calls.length > 0) {
        // Ejecutar cada llamada a herramienta indicada por el modelo
        for (const toolCall of messageObj.tool_calls) {
          if (toolCall.type === "function") {
            const fnName = toolCall.function.name;
            const tool = toolsMap[fnName];
            let argsObj: any = {};
            try {
              argsObj = JSON.parse(toolCall.function.arguments);
            } catch (_) {
              argsObj = {};
            }

            let toolResultStr = "";
            if (tool) {
              toolResultStr = await tool.execute(argsObj, {
                directory: process.cwd(),
                sessionId: session.id
              });
            } else {
              toolResultStr = JSON.stringify({ ok: false, error: `Herramienta desconocida: ${fnName}` });
            }

            let parsedData = {};
            try {
              parsedData = JSON.parse(toolResultStr);
            } catch (_) {}

            turnToolCalls.push({
              name: fnName,
              args: argsObj,
              result: parsedData
            });

            // Responder al modelo con el resultado de la herramienta
            session.messages.push({
              role: "tool",
              tool_call_id: toolCall.id,
              content: toolResultStr
            });
          }
        }
      } else {
        // El modelo produjo respuesta final de texto
        finalReply = messageObj.content || "";
        break;
      }
    }

    if (iterations >= MAX_ITERATIONS && !finalReply) {
      finalReply = "Se alcanzó el límite máximo de iteraciones para este turno. Por favor revisa el estado actual del caso.";
    }

    // Detectar si el agente requiere confirmación humana
    const armarPaqueteEjecutado = turnToolCalls.some((t) => t.name === "proveedor_armar_paquete");
    const simularEnvioEjecutado = turnToolCalls.some((t) => t.name === "proveedor_simular_envio");
    const textoPideConfirmacion = /\b(confirm|aprob|deseas|enviar|proceder|¿)\b/i.test(finalReply);

    if ((armarPaqueteEjecutado && !simularEnvioEjecutado) || textoPideConfirmacion) {
      needsConfirmation = true;
    }

    res.json({
      ok: true,
      sessionId: session.id,
      reply: finalReply,
      toolCalls: turnToolCalls,
      needsConfirmation
    });
  } catch (err: any) {
    const errorMsg = err.message || String(err);
    res.status(500).json({
      ok: false,
      error: `Error en el ciclo del agente: ${errorMsg}`
    });
  }
});

app.listen(PORT, () => {
  console.log(`=================================================`);
  console.log(` Servidor Agente Proveedor escuchando en puerto ${PORT}`);
  console.log(` API Health: http://localhost:${PORT}/api/health`);
  console.log(` Front Web:  http://localhost:${PORT}/`);
  console.log(`=================================================`);
});
